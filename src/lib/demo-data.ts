import type { Course, SemesterConfig } from "@contracts/types";

/**
 * 游客模式的演示数据
 *
 * 目的：让还没登录的用户先看到课表长什么样，降低注册心理门槛。
 *
 * 重要：这里全部是**虚构的示例课程**，不含任何真实用户数据。
 * 课程名用通用名，教师统一写「示例」，避免涉及真实院系或教师。
 */

const ALL_WEEKS = Array.from({ length: 16 }, (_, i) => i + 1);

/** 构造一条演示课程 */
function demo(
  idx: number,
  courseName: string,
  location: string,
  dayOfWeek: number,
  startSection: number,
  endSection: number,
): Course {
  return {
    id: -idx,
    userId: 0,
    semester: "demo",
    courseName,
    teacher: "示例",
    location,
    dayOfWeek,
    startSection,
    endSection,
    weeks: ALL_WEEKS,
    weeksText: "1-16周",
    rawText: null,
    createdAt: new Date(0),
  };
}

export const DEMO_COURSES: Course[] = [
  demo(1, "高等数学", "六教202", 1, 1, 2),
  demo(2, "大学英语", "二教413", 1, 5, 6),
  demo(3, "线性代数", "3DM52", 2, 3, 4),
  demo(4, "会计学原理", "实验中心702", 2, 7, 8),
  demo(5, "概率论与数理统计", "五教114", 3, 3, 4),
  demo(6, "体育", "体育馆", 3, 9, 10),
  demo(7, "微观经济学", "六教306", 4, 1, 2),
  demo(8, "计算机应用基础", "实验中心510", 4, 5, 6),
  demo(9, "思想道德与法治", "二教311", 5, 3, 4),
];

/** 演示用的学期配置：沿用真实学期的日期，节次用松江作息 */
export function demoConfig(base: SemesterConfig | undefined): SemesterConfig {
  return {
    semester: base?.semester ?? "2026-2027-1",
    startDate: base?.startDate ?? "2026-09-07",
    periodTimes: [
      "08:30", "09:20", "10:20", "11:10", "12:55",
      "13:45", "14:40", "15:30", "16:45", "17:35",
      "18:30", "19:20", "20:10",
    ],
  };
}
