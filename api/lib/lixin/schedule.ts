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
 *   周次为 53 位 ISO 周年掩码（weekstate bit b = 该年 ISO 第 b+1 周）
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

// ---------- ISO 周工具 ----------

function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // 本周周四
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fd = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fd + 3);
  return {
    year: d.getUTCFullYear(),
    week: 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000)),
  };
}

function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4.getTime() - dayNum * 86400000);
  return new Date(monday.getTime() + (week - 1) * 7 * 86400000);
}

/** weekstate 位掩码 → 教学周数组（以学期第一周周一为锚） */
function weekstateToWeeks(weekstate: bigint, beginOn: string): number[] {
  const begin = new Date(beginOn + "T00:00:00");
  const beginIso = isoWeekOf(begin);
  const weeks: number[] = [];
  for (let b = 0; b < 64; b++) {
    if (!((weekstate >> BigInt(b)) & 1n)) continue;
    const iso = b + 1;
    const year = iso >= beginIso.week ? beginIso.year : beginIso.year + 1;
    const monday = isoWeekMonday(year, iso);
    const tw = Math.round((monday.getTime() - begin.getTime()) / (7 * 86400000)) + 1;
    if (tw >= 1 && tw <= 30) weeks.push(tw);
  }
  return weeks.sort((a, b) => a - b);
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

/** 合并"同课同时段但单双周/教室不同"的活动为一条（周次取并集，教室合并） */
function mergeActivities(list: ParsedCourse[]): ParsedCourse[] {
  const map = new Map<string, ParsedCourse>();
  for (const c of list) {
    const key = `${c.courseName}|${c.dayOfWeek}|${c.startSection}|${c.endSection}|${c.teacher ?? ""}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...c, weeks: [...c.weeks] });
      continue;
    }
    prev.weeks = [...new Set([...prev.weeks, ...c.weeks])].sort((a, b) => a - b);
    prev.weeksText = weeksToText(prev.weeks);
    if (c.location && c.location !== prev.location) {
      const rooms = new Set((prev.location ?? "").split(" / ").filter(Boolean));
      rooms.add(c.location);
      prev.location = [...rooms].join(" / ");
    }
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
    const [, , teacher, , courseNameRaw, , room, , weekstate, weekday, beginAt, endAt] = m;
    const startUnit = units.findIndex(([s]) => s === +beginAt);
    const endUnit = units.findIndex(([, e]) => e === +endAt);
    if (startUnit < 0 || endUnit < 0) continue;
    const weeks = weekstateToWeeks(BigInt(weekstate), beginOn);
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
