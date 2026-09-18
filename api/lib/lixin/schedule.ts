import { loginLixin, openJw, LixinAuthError } from "./auth";
import { rawFetch, type StepLog } from "./http";

/**
 * 课表抓取。
 * lxjw 教务系统厂商未明（已排除强智 /jsxsd），这里采用"候选端点探测 + 全程留痕"策略：
 * 登录后依次尝试常见教务系统的课表接口，解析成功者胜出；
 * 全部失败时把各端点响应片段抛给上层（写入 fetch_logs），供下一轮联调定位真实接口。
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

/** 根据当前日期推断学期代码，如 2026-09 → 2026-2027-1 */
export function currentSemester(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 8) return `${y}-${y + 1}-1`;
  if (m <= 1) return `${y - 1}-${y}-1`;
  return `${y - 1}-${y}-2`;
}

/** 解析周次文本："1-16周" "1-8周(单)" "2,4,6周" "1-16" 等 → 周数组 */
export function parseWeeks(text: string): number[] {
  const weeks = new Set<number>();
  const odd = /单/.test(text);
  const even = /双/.test(text);
  const re = /(\d+)\s*-\s*(\d+)|(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] && m[2]) {
      for (let w = +m[1]; w <= +m[2]; w++) {
        if (odd && w % 2 === 0) continue;
        if (even && w % 2 === 1) continue;
        weeks.add(w);
      }
    } else if (m[3]) {
      weeks.add(+m[3]);
    }
  }
  return [...weeks].sort((a, b) => a - b);
}

interface Candidate {
  name: string;
  method: "GET" | "POST";
  path: (semester: string) => string;
  body?: (semester: string) => Record<string, string>;
  parse: (body: string) => ParsedCourse[] | null;
}

// ---- 正方教务（jwglxt）JSON 解析 ----
function parseZF(body: string): ParsedCourse[] | null {
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const list = data?.kbList ?? data?.data?.kbList;
  if (!Array.isArray(list)) return null;
  return list
    .map((it: any): ParsedCourse | null => {
      const day = parseInt(it.xqj ?? it.dayOfWeek, 10);
      const jc: string = it.jc ?? it.jcs ?? "";
      const secs = jc.split(/[-,，]/).map((s: string) => parseInt(s, 10)).filter(Boolean);
      if (!day || !secs.length) return null;
      const zc: string = it.zcd ?? it.weeks ?? "";
      return {
        courseName: String(it.kcmc ?? it.courseName ?? "").trim(),
        teacher: it.xm ?? it.teacher ?? null,
        location: it.cdmc ?? it.jxdd ?? null,
        dayOfWeek: day,
        startSection: Math.min(...secs),
        endSection: Math.max(...secs),
        weeks: parseWeeks(zc || "1-16"),
        weeksText: zc || null,
        rawText: JSON.stringify(it).slice(0, 500),
      };
    })
    .filter((c): c is ParsedCourse => !!c && !!c.courseName);
}

function splitSemester(semester: string): { xnm: string; xqm: string } {
  // 2026-2027-1 → xnm=2026, xqm=3（正方：3=上学期, 12=下学期）
  const parts = semester.split("-");
  return { xnm: parts[0], xqm: parts[2] === "2" ? "12" : "3" };
}

const CANDIDATES: Candidate[] = [
  {
    name: "zf-xskbcx",
    method: "POST",
    path: () => "/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151",
    body: (s) => {
      const { xnm, xqm } = splitSemester(s);
      return { xnm, xqm, kzlx: "ck" };
    },
    parse: parseZF,
  },
  {
    name: "zf-xskbcx-2",
    method: "POST",
    path: () => "/jwglxt/kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151",
    body: (s) => {
      const { xnm, xqm } = splitSemester(s);
      return { xnm, xqm };
    },
    parse: parseZF,
  },
  {
    name: "qz-xskb",
    method: "GET",
    path: () => "/jsxsd/xskb/xskb_list.do",
    parse: () => null, // 强智返回 HTML，需表格解析（备用，命中再写解析器）
  },
  {
    name: "api-kbcx",
    method: "GET",
    path: (s) => `/api/xskb?semester=${encodeURIComponent(s)}`,
    parse: parseZF,
  },
];

export interface FetchOutcome {
  courses: ParsedCourse[];
  student?: { name?: string; college?: string; className?: string };
  log: StepLog[];
  hit?: string;
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

/** 从落地页 HTML 里捞学生姓名/学院等基础信息（尽力而为） */
function scrapeStudentInfo(html: string) {
  const name =
    html.match(/姓名[：:<\/\w]*\s*([\u4e00-\u9fa5]{2,4})/)?.[1] ??
    html.match(/userName["'\s:=]+([\u4e00-\u9fa5]{2,4})/)?.[1];
  const college = html.match(/学院[：:<\/\w]*\s*([\u4e00-\u9fa5]{2,20}学院)/)?.[1];
  return { name, college };
}

export async function fetchSchedule(
  studentId: string,
  password: string,
  semester: string,
): Promise<FetchOutcome> {
  const session = await loginLixin(studentId, password);
  const log = session.log;

  // 进入教务系统
  const landing = await openJw(session, "/cas/login");
  const samples: Record<string, string> = { landing: landing.body.slice(0, 800) };

  // 依次尝试候选课表端点
  for (const c of CANDIDATES) {
    const url = `https://lxjw.lixin.edu.cn${c.path(semester)}`;
    try {
      const res = await rawFetch(
        session.jar,
        url,
        c.method === "POST"
          ? {
              method: "POST",
              headers: {
                "content-type": "application/x-www-form-urlencoded",
                "x-requested-with": "XMLHttpRequest",
                accept: "application/json",
              },
              body: new URLSearchParams(c.body?.(semester) ?? {}).toString(),
            }
          : { headers: { "x-requested-with": "XMLHttpRequest", accept: "application/json" } },
      );
      log.push({ step: `candidate:${c.name}`, url, status: res.status });
      if (res.status !== 200) continue;
      const parsed = c.parse(res.body);
      if (parsed && parsed.length > 0) {
        return {
          courses: parsed,
          student: scrapeStudentInfo(landing.body),
          log,
          hit: c.name,
        };
      }
      samples[c.name] = res.body.slice(0, 800);
    } catch (e) {
      log.push({ step: `candidate:${c.name}`, url, note: String(e).slice(0, 120) });
    }
  }

  throw new ScheduleFetchError(
    "所有候选课表接口均未命中，需要人工看样本定位真实接口",
    log,
    samples,
  );
}

export { LixinAuthError };
