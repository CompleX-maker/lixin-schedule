export type * from "../db/schema";
export * from "./errors";

export interface SemesterConfig {
  /** 学期代码，如 2026-2027-1 */
  semester: string;
  /** 学期第一周周一，ISO 日期 YYYY-MM-DD */
  startDate: string;
  /** 每节课的开始时间（HH:MM），索引 0 = 第 1 节 */
  periodTimes: string[];
}

export const DEFAULT_PERIOD_TIMES = [
  "08:20", "09:15", "10:15", "11:10",
  "13:00", "13:55", "14:55", "15:50",
  "16:45", "17:40", "18:40", "19:35",
];

export const DEFAULT_SEMESTER_CONFIG: SemesterConfig = {
  semester: "2026-2027-1",
  startDate: "2026-09-07",
  periodTimes: DEFAULT_PERIOD_TIMES,
};
