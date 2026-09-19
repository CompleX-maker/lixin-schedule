import { enterJw, loginLixin, LixinAuthError } from "./auth";
import { rawFetch, type StepLog } from "./http";

/**
 * 立信教务（Beangle EAMS，lxjw.lixin.edu.cn）课表抓取。
 * 已实测验证的链路：
 *   /edu/lesson/std/timetable.action → 302 → timetable!innerIndex.action?projectId=N
 *   页面内含 stdId（"ids"）与当前 semester.id（semesterCalendar value）
 *   POST /edu/lesson/std/timetable!courseTable.action
 *     参数：setting.kind=std, ids=<stdId>, semester.id=<semesterId>, weekSpan=1-18
 *   返回 HTML+JS：new CourseTable('开学日期', [[节次起止...]]) + table0.newActivity(...) / addActivityByTime(...)
 *   周次为 53 位 ISO 周年掩码，但需先按 newActivity 的 startOn 参数做周偏移
 *   （对齐官方 TaskActivity.js 的 weeksBetween + convertWeekstate2ReverseString），
 *   位移后 bit w = 第 w 教学周。
 */

export interface ParsedCourse {
  courseName: string;
  teacher: string | null;
  location: string | null;
  dayOfWeek: number; // 1-7
  startSection: number;
  endSection: number;
  weeks: number[];
  weeksText: string | null;
  rawText: string | null;
}

export interface FetchOutcome {
  courses: ParsedCourse[];
  student: { name?: string; college?: string; className?: string };
  /** 从教务系统提取的学期信息（比手工配置更准） */
  extracted: { beginOn: string; periodTimes: string[] };
  log: StepLog[];
}

export class ScheduleFetchError extends Error {
  readonly log: StepLog[];
  readonly samples: Record<string, string>;
  constructor(message: string, log: StepLog[], samples: Record<string, string>) {
    super(message);
    this.log = log;
    this.samples = samples;
  }
}

/** 根据当前日期推断学期代码，如 2026-09 → 2026-2027-1 */
export function currentSemester(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 8) return `${y}-${y + 1}-1`;
  if (m <= 1) return `${y - 1}-${y}-1`;
  return `${y - 1}-${y}-2`;
}

// ---------- EAMS weekstate 解码（与官方 TaskActivity.js 完全一致的逻辑） ----------
// 页面端 newActivity(..., startOn, weekstate, ...) 会执行：
//   weeks = Dates.weeksBetween(beginOn.getDay(), beginOn, toDate(startOn))
//   weekstate' = convertWeekstate2ReverseString(weekstate, weeks)  // 按 weeks 左/右移
// 位移后的掩码中 bit w 即"第 w 教学周"（bit 0 为占位）。
// 关键：startOn 是按星期几锚定的日期（周四/五的课程锚在 ISO 第 1 周，周一至三锚在第 2 周），
// 忽略它会让周四/五的课程整体偏移一周（第 1 周的课丢失）——2026-09 学期实测确认。

/** 把日期回退到最近的 weekday（0=周日…6=周六，含当天），对齐 EAMS Dates.weeksBetween */
function rollBackToWeekday(date: Date, weekday: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** startOn 相对 beginOn 的周偏移（= EAMS 的 weeksBetween 结果） */
function weekOffset(beginOn: string, startOn: string): number {
  const [by, bm, bd] = beginOn.split("-").map(Number);
  const [sy, sm, sd] = startOn.split("-").map(Number);
  const begin = new Date(Date.UTC(by, bm - 1, bd));
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const wd = begin.getUTCDay();
  const a = rollBackToWeekday(begin, wd);
  const b = rollBackToWeekday(start, wd);
  return Math.round((b.getTime() - a.getTime()) / (7 * 86400000));
}

/** weekstate + startOn → 教学周数组（位移后 bit w = 第 w 教学周） */
function weekstateToWeeks(weekstate: bigint, beginOn: string, startOn: string): number[] {
  const offset = startOn ? weekOffset(beginOn, startOn) : 0;
  const shifted = offset >= 0 ? weekstate << BigInt(offset) : weekstate >> BigInt(-offset);
  const weeks: number[] = [];
  for (let b = 1; b < 64; b++) {
    if ((shifted >> BigInt(b)) & 1n) weeks.push(b);
  }
  return weeks.filter((w) => w <= 30);
}

/** 周数组 → 紧凑文本，如 [1,3,5..15]→"1-15周(单)"，[1..16]→"1-16周" */
export function weeksToText(weeks: number[]): string {
  if (!weeks.length) return "";
  const min = weeks[0];
  const max = weeks[weeks.length - 1];
  const contiguous = weeks.length === max - min + 1;
  if (contiguous) return min === max ? `${min}周` : `${min}-${max}周`;
  const allOdd = weeks.every((w) => w % 2 === 1);
  const allEven = weeks.every((w) => w % 2 === 0);
  const step2 = weeks.every((w, i) => i === 0 || w - weeks[i - 1] === 2);
  if (step2 && allOdd) return `${min}-${max}周(单)`;
  if (step2 && allEven) return `${min}-${max}周(双)`;
  return weeks.join(",") + "周";
}

function hhmm(n: number): string {
  return `${String(Math.floor(n / 100)).padStart(2, "0")}:${String(n % 100).padStart(2, "0")}`;
}

// ---------- 解析 ----------

/** 合并"同课同时段同教室但周次分散"的活动（周次取并集）。
 *  教室不同的不合并：同一门课单周在 A 教室、双周在 B 教室时保留两条，
 *  课表按周过滤后每周只显示当周真正的教室。 */
function mergeActivities(list: ParsedCourse[]): ParsedCourse[] {
  const map = new Map<string, ParsedCourse>();
  for (const c of list) {
    const key = `${c.courseName}|${c.dayOfWeek}|${c.startSection}|${c.endSection}|${c.teacher ?? ""}|${c.location ?? ""}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...c, weeks: [...c.weeks] });
      continue;
    }
    prev.weeks = [...new Set([...prev.weeks, ...c.weeks])].sort((a, b) => a - b);
    prev.weeksText = weeksToText(prev.weeks);
  }
  return [...map.values()];
}

function parseCourseTable(html: string): {
  courses: ParsedCourse[];
  beginOn: string;
  periodTimes: string[];
} {
  const ctor = html.match(/new CourseTable\('([\d-]+)'\s*,\s*(\[\[[\d,\s\[\]]+\]\])\)/);
  if (!ctor) throw new Error("课表页面缺少 CourseTable 数据（学期可能无课）");
  const beginOn = ctor[1];
  const units: [number, number][] = JSON.parse(ctor[2].replace(/\s/g, ""));
  const periodTimes = units.map(([s]) => hhmm(s));

  const actRe =
    /newActivity\("([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)",(\d+)[^)]*\);\s*\w+\.addActivityByTime\(activity,(\d+),(\d+),(\d+)\)/g;
  const courses: ParsedCourse[] = [];
  let m: RegExpExecArray | null;
  while ((m = actRe.exec(html))) {
    // 捕获组：1=teacherId 2=teacher 3=courseCode 4=courseName 5=roomId 6=room 7=startOn 8=weekstate 9=weekday 10=beginAt 11=endAt
    const [, , teacher, , courseNameRaw, , room, startOn, weekstate, weekday, beginAt, endAt] = m;
    const startUnit = units.findIndex(([s]) => s === +beginAt);
    const endUnit = units.findIndex(([, e]) => e === +endAt);
    if (startUnit < 0 || endUnit < 0) continue;
    const weeks = weekstateToWeeks(BigInt(weekstate), beginOn, startOn);
    if (!weeks.length) continue;
    const courseName = courseNameRaw.replace(/\(\d+\)\s*$/, "").trim();
    courses.push({
      courseName,
      teacher: teacher || null,
      location: room || null,
      dayOfWeek: +weekday,
      startSection: startUnit + 1,
      endSection: endUnit + 1,
      weeks,
      weeksText: weeksToText(weeks),
      rawText: m[0].slice(0, 400),
    });
  }
  return { courses: mergeActivities(courses), beginOn, periodTimes };
}

// ---------- 主流程 ----------

const JW = "https://lxjw.lixin.edu.cn";

export async function fetchSchedule(
  studentId: string,
  password: string,
  _semester: string, // 学期以教务系统当前学期为准（semester.id 从页面提取）
): Promise<FetchOutcome> {
  const session = await loginLixin(studentId, password);
  const log = session.log;
  const samples: Record<string, string> = {};
  const jar = session.jar;

  await enterJw(session);

  // 学生主页 → 姓名/学院
  const student: FetchOutcome["student"] = {};
  try {
    const stdHome = await rawFetch(jar, `${JW}/edu/student/std/home.action`);
    log.push({ step: "std-home", url: `${JW}/edu/student/std/home.action`, status: stdHome.status });
    student.name = stdHome.body.match(/([\u4e00-\u9fa5]{2,4})\(\d{6,}\)/)?.[1];
    student.college = stdHome.body.match(/([\u4e00-\u9fa5]{2,20}(?:学院|部))(?=<|、|，)/)?.[1];
  } catch {
    /* 非关键，忽略 */
  }

  // 课表首页（建立上下文）→ timetable → innerIndex
  await rawFetch(jar, `${JW}/edu/lesson/std/home.action`);
  const tt = await rawFetch(jar, `${JW}/edu/lesson/std/timetable.action`);
  let innerUrl = `${JW}/edu/lesson/std/timetable!innerIndex.action`;
  if (tt.status === 302 && tt.headers.get("location")) {
    innerUrl = new URL(tt.headers.get("location")!, JW).toString();
  }
  const inner = await rawFetch(jar, innerUrl);
  log.push({ step: "timetable-index", url: innerUrl, status: inner.status });
  samples.innerIndex = inner.body.slice(0, 600);

  const stdId =
    inner.body.match(/val\(\)=="std"\)\)\s*\{\s*[\w.$]*\.?addInput\(form,"ids","(\d+)"\)/s)?.[1] ??
    inner.body.match(/addInput\(form,"ids","(\d+)"\)/)?.[1];
  const semesterId = inner.body.match(/semesterCalendar\(\{[^}]*value:"(\d+)"/)?.[1];
  if (!stdId || !semesterId) {
    throw new ScheduleFetchError("课表页未提取到 ids/semester.id", log, samples);
  }

  // 拉课表数据（实测 weekSpan=1-18 即返回全年 weekstate 掩码，19+ 周不受影响）
  const form = new URLSearchParams({
    "setting.kind": "std",
    weekSpan: "1-18",
    "semester.id": semesterId,
  });
  form.append("ids", stdId);
  const table = await rawFetch(jar, `${JW}/edu/lesson/std/timetable!courseTable.action`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-requested-with": "XMLHttpRequest",
      referer: innerUrl,
    },
    body: form.toString(),
  });
  log.push({ step: "courseTable", url: `${JW}/edu/lesson/std/timetable!courseTable.action`, status: table.status });
  samples.courseTable = table.body.slice(0, 600);

  let parsed: ReturnType<typeof parseCourseTable>;
  try {
    parsed = parseCourseTable(table.body);
  } catch (e) {
    throw new ScheduleFetchError(
      e instanceof Error ? e.message : "课表解析失败",
      log,
      samples,
    );
  }
  if (parsed.courses.length === 0) {
    throw new ScheduleFetchError("解析到 0 条课程（学期可能无课或接口变动）", log, samples);
  }

  return {
    courses: parsed.courses,
    student,
    extracted: { beginOn: parsed.beginOn, periodTimes: parsed.periodTimes },
    log,
  };
}

export { LixinAuthError };
