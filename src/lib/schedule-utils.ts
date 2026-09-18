import type { Course } from "@contracts/types";

/** 课程块的马卡龙色系（由柠檬橄榄主调衍生的同温层色阶） */
export const COURSE_COLORS = [
  { bg: "#e9f3c3", border: "#c4c800", text: "#4a5631" },
  { bg: "#d8ecc0", border: "#8cb350", text: "#3c4a24" },
  { bg: "#cdeed8", border: "#5aa578", text: "#274a38" },
  { bg: "#cbeae4", border: "#4da396", text: "#234740" },
  { bg: "#cfe6f2", border: "#5d93b5", text: "#2a4356" },
  { bg: "#ddd9f0", border: "#8d83c2", text: "#3f3a5e" },
  { bg: "#f2ddcf", border: "#c98f63", text: "#5d3f27" },
  { bg: "#f6e3b8", border: "#d0a83c", text: "#5d4a1c" },
];

export function courseColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COURSE_COLORS[h % COURSE_COLORS.length];
}

/** 由学期开始日期（第一周周一）算当前周次 */
export function weekOf(startDate: string, date = new Date()): number {
  const start = new Date(startDate + "T00:00:00").getTime();
  return Math.floor((date.getTime() - start) / (7 * 24 * 3600 * 1000)) + 1;
}

export function weekDateRange(startDate: string, week: number): [Date, Date] {
  const start = new Date(startDate + "T00:00:00");
  const monday = new Date(start.getTime() + (week - 1) * 7 * 24 * 3600 * 1000);
  return [monday, new Date(monday.getTime() + 6 * 24 * 3600 * 1000)];
}

export function dayLabel(d: number) {
  return ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"][d] ?? "";
}

export function fmtDate(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export interface TodayItem {
  course: Course;
  startMin: number;
  endMin: number;
  start: string;
  end: string;
}

/** 计算某天（上海时间）的课程时间线 */
export function dayTimeline(
  courses: Course[],
  week: number,
  dayOfWeek: number,
  periodTimes: string[],
): TodayItem[] {
  return courses
    .filter((c) => c.dayOfWeek === dayOfWeek && c.weeks.includes(week))
    .map((c) => {
      const start = periodTimes[c.startSection - 1] ?? "08:00";
      const endBase = periodTimes[c.endSection - 1] ?? start;
      const [eh, em] = endBase.split(":").map(Number);
      const endMin = eh * 60 + em + 45; // 每节 45 分钟
      const [sh, sm] = start.split(":").map(Number);
      return {
        course: c,
        startMin: sh * 60 + sm,
        endMin,
        start,
        end: `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`,
      };
    })
    .sort((a, b) => a.startMin - b.startMin);
}

/** 上海时区的"现在"（服务器/浏览器时区无关） */
export function shanghaiNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
}
