import { useEffect, useMemo, useState } from "react";
import type { Course, SemesterConfig } from "@contracts/types";
import { courseColor, dayTimeline, shanghaiNow, weekOf } from "@/lib/schedule-utils";
import { Coffee, MapPin } from "lucide-react";

/** 每秒刷新的上海时间 */
function useShanghaiNow() {
  const [now, setNow] = useState(shanghaiNow);
  useEffect(() => {
    const t = setInterval(() => setNow(shanghaiNow()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function CountdownRing({
  progress,
  children,
}: {
  progress: number; // 0..1
  children: React.ReactNode;
}) {
  const R = 104;
  const C = 2 * Math.PI * R;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <div className="relative mx-auto h-[240px] w-[240px]">
      <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90">
        <circle
          cx="120" cy="120" r={R} fill="none"
          stroke="hsl(var(--muted))" strokeWidth="10"
        />
        <circle
          cx="120" cy="120" r={R} fill="none"
          stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p)}
          style={{ transition: "stroke-dashoffset 0.9s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function fmtRemain(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function TodayView({
  courses,
  config,
}: {
  courses: Course[];
  config: SemesterConfig;
}) {
  const now = useShanghaiNow();
  const week = weekOf(config.startDate, now);
  const dow = now.getDay() === 0 ? 7 : now.getDay();

  const timeline = useMemo(
    () => dayTimeline(courses, week, dow, config.periodTimes),
    [courses, week, dow, config.periodTimes],
  );

  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const ongoing = timeline.find((t) => nowMin >= t.startMin && nowMin < t.endMin);
  const next = timeline.find((t) => t.startMin > nowMin);

  // 倒计时进度：窗口 = 上一个锚点（上一节课下课，否则 7:00）→ 下一节上课
  let ring: React.ReactNode;
  if (ongoing) {
    const p = (nowMin - ongoing.startMin) / (ongoing.endMin - ongoing.startMin);
    ring = (
      <CountdownRing progress={p}>
        <span className="label-caps text-muted-foreground">上课中</span>
        <span className="mt-1 max-w-[170px] truncate text-lg font-bold">{ongoing.course.courseName}</span>
        <span className="tnum mt-1 text-2xl font-semibold">{fmtRemain((ongoing.endMin - nowMin) * 60000)}</span>
        <span className="text-xs text-muted-foreground">后下课</span>
      </CountdownRing>
    );
  } else if (next) {
    const prevEnd = [...timeline].reverse().find((t) => t.endMin <= nowMin)?.endMin ?? 7 * 60;
    const gap = Math.max(1, next.startMin - prevEnd);
    const p = 1 - (next.startMin - nowMin) / gap;
    ring = (
      <CountdownRing progress={p}>
        <span className="label-caps text-muted-foreground">下一节课</span>
        <span className="mt-1 max-w-[170px] truncate text-lg font-bold">{next.course.courseName}</span>
        <span className="tnum mt-1 text-2xl font-semibold">{fmtRemain((next.startMin - nowMin) * 60000)}</span>
        <span className="text-xs text-muted-foreground">
          {next.start} 开始{next.course.location ? ` · ${next.course.location}` : ""}
        </span>
      </CountdownRing>
    );
  } else {
    ring = (
      <CountdownRing progress={1}>
        <Coffee className="mb-2 h-8 w-8 text-primary" />
        <span className="text-lg font-bold">
          {timeline.length > 0 ? "今天的课上完啦" : "今天没课"}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">好好休息</span>
      </CountdownRing>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <div className="label-caps text-muted-foreground">
          {now.getMonth() + 1}月{now.getDate()}日 · 第 {week} 周
        </div>
        <h2 className="mt-1 text-2xl font-bold">
          {["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()]}
        </h2>
      </div>

      {ring}

      {/* 今日时间线 */}
      <div className="space-y-2">
        {timeline.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            本周今日无课程安排
          </p>
        )}
        {timeline.map((t) => {
          const col = courseColor(t.course.courseName);
          const state =
            nowMin >= t.startMin && nowMin < t.endMin ? "now" : t.endMin <= nowMin ? "past" : "future";
          return (
            <div
              key={t.course.id}
              className={`flex items-stretch gap-3 rounded-xl border bg-card p-3 ${
                state === "past" ? "opacity-45" : ""
              } ${state === "now" ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex w-14 flex-col justify-center border-r pr-2 text-center">
                <span className="tnum text-sm font-bold">{t.start}</span>
                <span className="tnum text-[10px] text-muted-foreground">{t.end}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{t.course.courseName}</div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="tnum">第 {t.course.startSection}-{t.course.endSection} 节</span>
                  {t.course.location && (
                    <span className="flex items-center gap-0.5 truncate">
                      <MapPin className="h-3 w-3" />
                      {t.course.location}
                    </span>
                  )}
                </div>
              </div>
              <div
                className="w-1.5 self-stretch rounded-full"
                style={{ background: col.border }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
