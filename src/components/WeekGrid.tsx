import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Course, SemesterConfig } from "@contracts/types";
import { courseColor, dayLabel, fmtDate, weekDateRange } from "@/lib/schedule-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = 12;

/** 把 12 节合成 6 大行展示（1-2 / 3-4 / ... / 11-12），块按行跨度放置 */
function rowOf(section: number) {
  return Math.ceil(section / 2);
}

export function WeekGrid({
  courses,
  config,
  week,
  setWeek,
}: {
  courses: Course[];
  config: SemesterConfig;
  week: number;
  setWeek: (w: number) => void;
}) {
  const [selected, setSelected] = useState<Course | null>(null);
  // 周切换方向：决定网格滑入/滑出方向
  const dirRef = useRef(0);
  const goWeek = (target: number) => {
    dirRef.current = target > week ? 1 : -1;
    setWeek(target);
  };
  const todayDow = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  }, []);
  const currentWeek = useMemo(() => {
    const start = new Date(config.startDate + "T00:00:00").getTime();
    return Math.floor((Date.now() - start) / (7 * 24 * 3600 * 1000)) + 1;
  }, [config.startDate]);

  const visible = useMemo(
    () => courses.filter((c) => c.weeks.includes(week)),
    [courses, week],
  );
  const [monday] = weekDateRange(config.startDate, week);

  const gridCourses = useMemo(() => {
    // 同一天同一节次重叠时并列显示
    const bySlot = new Map<string, Course[]>();
    for (const c of visible) {
      const key = `${c.dayOfWeek}-${rowOf(c.startSection)}`;
      if (!bySlot.has(key)) bySlot.set(key, []);
      bySlot.get(key)!.push(c);
    }
    return bySlot;
  }, [visible]);

  return (
    <div className="flex flex-col gap-3">
      {/* 周切换 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => goWeek(Math.max(1, week - 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="relative h-12 w-44 overflow-hidden text-center">
          <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
            <motion.div
              key={week}
              custom={dirRef.current}
              initial={{ opacity: 0, y: 10 * (dirRef.current || 1) }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 * (dirRef.current || 1) }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute inset-0"
            >
              <div className="text-lg font-bold tnum">第 {week} 周</div>
              <div className="text-xs text-muted-foreground tnum">
                {fmtDate(monday)} - {fmtDate(new Date(monday.getTime() + 6 * 86400000))}
                {week === currentWeek && " · 本周"}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <Button variant="ghost" size="icon" onClick={() => goWeek(week + 1)}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* 课表网格：横向可滚动；切周时整体滑动过渡 */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <AnimatePresence mode="popLayout" initial={false} custom={dirRef.current}>
          <motion.div
            key={week}
            custom={dirRef.current}
            initial={{ opacity: 0, x: 48 * (dirRef.current || 1) }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -48 * (dirRef.current || 1) }}
            transition={{ duration: 0.26, ease: "easeOut" }}
            className="overflow-x-auto"
          >
        <div className="min-w-[640px]">
          {/* 表头：星期 */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] border-b">
            <div className="p-1" />
            {Array.from({ length: 7 }, (_, i) => {
              const d = i + 1;
              const date = new Date(monday.getTime() + i * 86400000);
              const isToday = week === currentWeek && d === todayDow;
              return (
                <div
                  key={d}
                  className={`py-2 text-center ${isToday ? "text-primary-foreground" : ""}`}
                >
                  <div
                    className={`mx-auto flex w-12 flex-col rounded-lg py-0.5 ${
                      isToday ? "bg-primary" : ""
                    }`}
                  >
                    <span className="text-[11px] font-semibold">{dayLabel(d)}</span>
                    <span className={`text-[10px] tnum ${isToday ? "opacity-80" : "text-muted-foreground"}`}>
                      {fmtDate(date)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 6 大节行 */}
          {Array.from({ length: SECTIONS / 2 }, (_, r) => {
            const s1 = r * 2 + 1;
            const s2 = r * 2 + 2;
            return (
              <div
                key={r}
                className="grid grid-cols-[44px_repeat(7,1fr)] border-b last:border-b-0"
              >
                {/* 左侧节次/时间 */}
                <div className="flex flex-col items-center justify-center border-r py-1 text-muted-foreground">
                  <span className="text-[11px] font-semibold tnum">
                    {s1}-{s2}
                  </span>
                  <span className="text-[9px] tnum">{config.periodTimes[s1 - 1] ?? ""}</span>
                </div>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = i + 1;
                  const slot = gridCourses.get(`${d}-${r + 1}`) ?? [];
                  return (
                    <div key={d} className="flex min-h-[64px] gap-0.5 border-r p-0.5 last:border-r-0">
                      {slot.map((c) => {
                        const col = courseColor(c.courseName);
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSelected(c)}
                            className="flex-1 rounded-md border-l-[3px] px-1 py-1 text-left transition-transform active:scale-95"
                            style={{ background: col.bg, borderColor: col.border, color: col.text }}
                          >
                            <div className="line-clamp-3 text-[10px] font-semibold leading-tight">
                              {c.courseName}
                            </div>
                            {c.location && (
                              <div className="mt-0.5 line-clamp-1 text-[9px] opacity-75">
                                {c.location}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 课程详情弹窗 */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.courseName}</DialogTitle>
              </DialogHeader>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">时间</dt>
                  <dd className="tnum">
                    {dayLabel(selected.dayOfWeek)} 第 {selected.startSection}-{selected.endSection} 节
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">周次</dt>
                  <dd className="tnum">{selected.weeksText ?? `${selected.weeks[0]}-${selected.weeks.at(-1)}周`}</dd>
                </div>
                {selected.location && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">地点</dt>
                    <dd>{selected.location}</dd>
                  </div>
                )}
                {selected.teacher && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">教师</dt>
                    <dd>{selected.teacher}</dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
