/**
 * 校区分楼作息表
 *
 * 依据学校教务发布的《上课时间表》整理。关键规则：
 *   - 松江、浦东两个主校区作息不同；
 *   - 同一校区内部，不同教学楼还有各自的作息（例如松江第 3 节，
 *     学验/育才/体育馆 10:20 开始，吉祥/北碚/徐汇/云间 10:30 开始）；
 *   - 浦东第 3、4 节同理（六教/体育馆 vs 二教/五教/实验中心）。
 *
 * 因此不能只按校区分两套，必须落到「教学楼」这一层。
 */

/** 一天最多 13 节 */
export const MAX_SECTIONS = 13;

/** 作息组：一组共用同一套上下课时间的教学楼 */
export interface PeriodGroup {
  /** 组标识 */
  key: string;
  /** 所属校区 */
  campus: Campus;
  /** 展示名，如「松江 · 学验楼」 */
  label: string;
  /** 该组包含的教学楼名称（用于匹配 location 前缀） */
  buildings: string[];
  /** 13 节课的起始时间；未使用的节次为 null */
  periodTimes: (string | null)[];
}

export type Campus = "松江" | "浦东";

/* ------------------------------------------------------------------ *
 * 松江校区
 * ------------------------------------------------------------------ */

/** 松江 A 组：学验楼、育才楼、体育馆 —— 第 1~13 节连续排列 */
const SONGJIANG_A: (string | null)[] = [
  "08:30", "09:20", "10:20", "11:10", "12:55",
  "13:45", "14:40", "15:30", "16:45", "17:35",
  "18:30", "19:20", "20:10",
];

/** 松江 B 组：吉祥楼、北碚楼、徐汇楼、云间楼 —— 第 3、4 节各晚 10 分钟 */
const SONGJIANG_B: (string | null)[] = [
  "08:30", "09:20", "10:30", "11:20", "12:55",
  "13:45", "14:40", "15:30", "16:45", "17:35",
  "18:30", "19:20", "20:10",
];

/* ------------------------------------------------------------------ *
 * 浦东校区
 * ------------------------------------------------------------------ */

/** 浦东 A 组：六教、体育馆 —— 第 1~4 节连续 */
const PUDONG_A: (string | null)[] = [
  "08:30", "09:20", "10:20", "11:10", "12:55",
  "13:45", "14:40", "15:30", "16:45", "17:35",
  "18:30", "19:20", "20:10",
];

/** 浦东 B 组：二教、五教、实验中心 —— 第 3、4 节各晚 10 分钟 */
const PUDONG_B: (string | null)[] = [
  "08:30", "09:20", "10:30", "11:20", "12:55",
  "13:45", "14:40", "15:30", "16:45", "17:35",
  "18:30", "19:20", "20:10",
];

/* ------------------------------------------------------------------ *
 * 作息组登记表
 * ------------------------------------------------------------------ */

export const PERIOD_GROUPS: PeriodGroup[] = [
  {
    key: "sj-a",
    campus: "松江",
    label: "松江 · 学验楼 / 育才楼 / 体育馆",
    buildings: ["学验楼", "育才楼", "体育馆", "2D", "3D", "3S", "田径场", "足球场", "篮球场", "排球场", "网球场", "水上码头"],
    periodTimes: SONGJIANG_A,
  },
  {
    key: "sj-b",
    campus: "松江",
    label: "松江 · 吉祥楼 / 北碚楼 / 徐汇楼 / 云间楼",
    buildings: ["吉祥楼", "北碚楼", "徐汇楼", "云间楼", "4D", "5D", "6D", "7D"],
    periodTimes: SONGJIANG_B,
  },
  {
    key: "pd-a",
    campus: "浦东",
    label: "浦东 · 六教 / 体育馆",
    buildings: ["六教", "浦东体育馆", "气膜馆", "健身房", "形体房", "体操房", "击剑房", "瑜伽房", "乒乓球", "跆拳道馆", "空手道场"],
    periodTimes: PUDONG_A,
  },
  {
    key: "pd-b",
    campus: "浦东",
    label: "浦东 · 二教 / 五教 / 实验中心",
    buildings: ["二教", "五教", "实验中心", "学生活动中心"],
    periodTimes: PUDONG_B,
  },
];

/** 默认作息（无法识别教学楼时兜底）：采用松江 A 组 */
export const DEFAULT_PERIOD_TIMES: string[] = SONGJIANG_A.map((t) => t ?? "08:30");

/* ------------------------------------------------------------------ *
 * 识别逻辑
 * ------------------------------------------------------------------ */

/**
 * 松江教学楼的编码前缀 → 真实楼名。
 *
 * 教务系统里松江的教学楼以「编号 + 楼型」编码：
 *   2 = 学验楼（原 2 号楼）、3 = 育才楼（原 3 号楼）、4 = 吉祥楼（原 4 号楼）、
 *   5 = 北碚楼（原 5 号楼）、6 = 徐汇楼（原 6 号楼）、7 = 云间楼（原 7 号楼）
 * 其中 M 为普通教室楼、S 为实训/体育类、XL 为学验楼特定区、DC/DL 为其他分区。
 */
const CODED_BUILDING_MAP: Record<string, string> = {
  "2": "学验楼",
  "3": "育才楼",
  "4": "吉祥楼",
  "5": "北碚楼",
  "6": "徐汇楼",
  "7": "云间楼",
};

/** 松江 A 组使用的楼（第 3、4 节 10:20 / 11:10） */
const SONGJIANG_A_BUILDINGS = new Set(["学验楼", "育才楼"]);

/**
 * 根据教室名解析出所属作息组。
 *
 * 支持两类输入：
 *   - 中文楼名：`六教202`、`实验中心702`、`二教413`
 *   - 松江编码：`3DM52`、`4DM42`、`2DC303`、`3DXL11`
 */
export function resolvePeriodGroup(location?: string | null): PeriodGroup {
  const fallback = PERIOD_GROUPS[0];

  if (!location) return fallback;
  const loc = location.trim();
  if (!loc) return fallback;

  // 线上教学不涉及教室
  if (loc.includes("线上") || loc.includes("网络")) return fallback;

  // 1) 中文楼名匹配（长名优先，避免「二教」误配「二教附楼」之类）
  for (const group of PERIOD_GROUPS) {
    const hit = group.buildings
      .filter((b) => /[\u4e00-\u9fa5]/.test(b))
      .sort((a, b) => b.length - a.length)
      .some((b) => loc.includes(b));
    if (hit) return group;
  }

  // 2) 松江编码匹配：形如 3DM52 / 4DS42 / 2DC303 / 3DXL11 / 2D121 / 3S12 / 2Y401
  //    首位数字即楼号；`D` 可省略（如 2D121、3S12、2Y401）
  const m = /^(\d)\s*(?:D)?\s*([A-Z])/i.exec(loc);
  if (m) {
    const building = CODED_BUILDING_MAP[m[1]];
    if (building) {
      const isSongjiangA = SONGJIANG_A_BUILDINGS.has(building);
      const group = PERIOD_GROUPS.find((g) =>
        isSongjiangA ? g.key === "sj-a" : g.key === "sj-b",
      );
      if (group) return group;
    }
  }

  // 3) 纯中文体育/活动场馆：统一按松江 A 组处理
  if (/球场|体育中心|码头|场馆|房$|馆$/.test(loc)) return fallback;

  return fallback;
}

/** 由教室名解析所属校区 */
export function resolveCampus(location?: string | null): Campus {
  return resolvePeriodGroup(location).campus;
}

/**
 * 取某教室对应作息组的 13 节起始时间（已过滤 null，长度可能 < 13）。
 */
export function periodTimesFor(location?: string | null): string[] {
  const group = resolvePeriodGroup(location);
  return group.periodTimes.filter((t): t is string => Boolean(t));
}

/* ------------------------------------------------------------------ *
 * 节次 → 具体时刻
 * ------------------------------------------------------------------ */

/** 每节课时长（分钟） */
export const SECTION_MINUTES = 45;

/** `HH:MM` → 当日分钟数 */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 当日分钟数 → `HH:MM` */
export function toHHMM(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * 计算某教室下、第 startSection 节到第 endSection 节的起止时刻。
 *
 * 注意：起止时间必须落在**同一个作息组**内取，不能拿全局 periodTimes。
 */
export function sectionRange(
  location: string | null | undefined,
  startSection: number,
  endSection: number,
): { start: string; end: string; startMin: number; endMin: number } | null {
  const times = periodTimesFor(location);
  const startBase = times[startSection - 1];
  if (!startBase) return null;

  // 结束时刻 = 末节开始 + 45 分钟（同一作息组内累加）
  const endBase = times[endSection - 1] ?? startBase;
  const endMin = toMinutes(endBase) + SECTION_MINUTES;

  return {
    start: startBase,
    end: toHHMM(endMin),
    startMin: toMinutes(startBase),
    endMin,
  };
}

/** 单个节次的时间段文本，如 `08:30-09:15` */
export function sectionText(
  location: string | null | undefined,
  section: number,
): string {
  const r = sectionRange(location, section, section);
  return r ? `${r.start}-${r.end}` : "";
}

/** 多节次的时间段文本，如 `08:30-10:05`（1-2 节） */
export function sectionRangeText(
  location: string | null | undefined,
  startSection: number,
  endSection: number,
): string {
  const r = sectionRange(location, startSection, endSection);
  return r ? `${r.start}-${r.end}` : "";
}

/** 供 UI 展示：某作息组的 13 行节次表 */
export function periodTable(group: PeriodGroup) {
  return group.periodTimes.map((start, i) => ({
    section: i + 1,
    start,
    end: start ? toHHMM(toMinutes(start) + SECTION_MINUTES) : null,
  }));
}
