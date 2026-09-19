import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Course, SemesterConfig } from "@contracts/types";
import {
  courseColor,
  courseKey,
  dayLabel,
  fmtDate,
  periodEnd,
  weekDateRange,
  weeksBadge,
} from "@/lib/schedule-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import { ChevronLeft, ChevronRight, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  // 课程备注
  const utils = trpc.useUtils();
  const notesQuery = trpc.schedule.notes.useQuery();
  const noteMap = useMemo(
    () => new Map((notesQuery.data ?? []).map((n) => [n.courseKey, n.note])),
    [notesQuery.data],
  );
  const saveNote = trpc.schedule.saveNote.useMutation({
    onSuccess: () => utils.schedule.notes.invalidate(),
  });
  const [draft, setDraft] = useState("");
  // 打开弹窗时装载该课已有备注
  useEffect(() => {
    setDraft(selected ? (noteMap.get(courseKey(selected)) ?? "") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
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
  const [monday] = weekDateRange(config.startDate, Math.max(week, 1));

  /** 课程总览：按「课程名+教师」分组，列出全部上课安排 */
  const overview = useMemo(() => {
    const groups = new Map<string, { name: string; teacher: string | null; items: Course[] }>();
    for (const c of courses) {
      const key = `${c.courseName}|${c.teacher ?? ""}`;
      if (!groups.has(key))
        groups.set(key, { name: c.courseName, teacher: c.teacher ?? null, items: [] });
      groups.get(key)!.items.push(c);
    }
    const arr = [...groups.values()];
    for (const g of arr)
      g.items.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startSection - b.startSection);
    arr.sort(
      (a, b) =>
        (a.items[0]?.dayOfWeek ?? 9) - (b.items[0]?.dayOfWeek ?? 9) ||
        (a.items[0]?.startSection ?? 9) - (b.items[0]?.startSection ?? 9),
    );
    return arr;
  }, [courses]);

  const periodCount = config.periodTimes.length;

  /** 按（星期, 起始节）分组：同槽多门课并列显示；块按节次跨行 */
  const slotMap = useMemo(() => {
    const m = new Map<string, Course[]>();
    for (const c of visible) {
      const key = `${c.dayOfWeek}-${c.startSection}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return m;
  }, [visible]);

  return (
    <div className="flex flex-col gap-3">
      {/* 周切换（第 1 周左边是课程总览） */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          disabled={week === 0}
          onClick={() => goWeek(Math.max(0, week - 1))}
        >
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
              {week === 0 ? (
                <>
                  <div className="text-lg font-bold">课程总览</div>
                  <div className="text-xs text-muted-foreground">
                    全部 {overview.length} 门课 · 右滑返回周视图
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold tnum">第 {week} 周</div>
                  <div className="text-xs text-muted-foreground tnum">
                    {fmtDate(monday)} - {fmtDate(new Date(monday.getTime() + 6 * 86400000))}
                    {week === currentWeek && " · 本周"}
                  </div>
                </>
              )}
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
            className={week === 0 ? "" : "overflow-x-auto"}
          >
        {week === 0 ? (
          /* 课程总览：按课程分组的全部安排 */
          <div className="divide-y">
            {overview.map((g) => {
              const col = courseColor(g.name);
              return (
                <div key={`${g.name}|${g.teacher ?? ""}`} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: col.border }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</span>
                    {g.teacher && (
                      <span className="shrink-0 text-xs text-muted-foreground">{g.teacher}</span>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {g.items.map((c) => {
                      const start = config.periodTimes[c.startSection - 1] ?? "";
                      const endBase = config.periodTimes[c.endSection - 1] ?? start;
                      const badge = weeksBadge(c.weeks);
                      const hasNote = noteMap.has(courseKey(c));
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelected(c)}
                          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/60 active:bg-muted"
                        >
                          <span className="shrink-0 tnum text-muted-foreground">
                            {dayLabel(c.dayOfWeek)} {c.startSection}-{c.endSection}节
                          </span>
                          <span className="shrink-0 tnum text-muted-foreground/70">
                            {start}-{periodEnd(endBase)}
                          </span>
                          {c.location && (
                            <span className="min-w-0 flex-1 truncate">{c.location}</span>
                          )}
                          <span className="ml-auto flex shrink-0 items-center gap-1">
                            {badge && (
                              <span className="rounded-sm bg-black/10 px-0.5 text-[9px] font-bold leading-3.5">
                                {badge}
                              </span>
                            )}
                            <span className="tnum text-muted-foreground">
                              {c.weeksText ?? `${c.weeks[0]}-${c.weeks.at(-1)}周`}
                            </span>
                            {hasNote && (
                              <StickyNote className="h-3 w-3 opacity-70" strokeWidth={2.5} />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {overview.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                本学期还没有同步到课程
              </div>
            )}
          </div>
        ) : (
        <div className="min-w-[680px]">
          {/* 表头：星期 */}
          <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b">
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

          {/* 网格主体：每一小节一行，课程块按节次跨行 */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: "52px repeat(7, 1fr)",
              gridTemplateRows: `repeat(${periodCount}, 54px)`,
            }}
          >
            {/* 左侧节次 + 起止时间 */}
            {Array.from({ length: periodCount }, (_, i) => {
              const start = config.periodTimes[i] ?? "";
              return (
                <div
                  key={`t${i}`}
                  style={{ gridColumn: 1, gridRow: i + 1 }}
                  className="flex flex-col items-center justify-center border-b border-r text-muted-foreground"
                >
                  <span className="text-[11px] font-semibold tnum">{i + 1}</span>
                  <span className="text-[9px] leading-tight tnum">{start}</span>
                  <span className="text-[9px] leading-tight tnum opacity-60">
                    {start ? periodEnd(start) : ""}
                  </span>
                </div>
              );
            })}
            {/* 背景空格子（边框） */}
            {Array.from({ length: periodCount * 7 }, (_, i) => {
              const row = Math.floor(i / 7) + 1;
              const col = (i % 7) + 2;
              return (
                <div
                  key={`c${i}`}
                  style={{ gridColumn: col, gridRow: row }}
                  className={col === 8 ? "border-b" : "border-b border-r"}
                />
              );
            })}
            {/* 课程块：跨行放置 */}
            {[...slotMap.entries()].map(([key, slot]) => {
              const [d, s] = key.split("-").map(Number);
              const span = Math.max(...slot.map((c) => c.endSection)) - s + 1;
              return (
                <div
                  key={key}
                  style={{ gridColumn: d + 1, gridRow: `${s} / span ${span}` }}
                  className="z-10 flex gap-0.5 p-0.5"
                >
                  {slot.map((c) => {
                    const col = courseColor(c.courseName);
                    const hasNote = noteMap.has(courseKey(c));
                    const badge = weeksBadge(c.weeks);
                    const start = config.periodTimes[c.startSection - 1] ?? "";
                    const endBase = config.periodTimes[c.endSection - 1] ?? start;
                    const cspan = c.endSection - c.startSection + 1;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className="relative min-w-0 flex-1 overflow-hidden rounded-md border-l-[3px] px-1 py-1 text-left transition-transform active:scale-95"
                        style={{ background: col.bg, borderColor: col.border, color: col.text }}
                      >
                        <span className="absolute right-0.5 top-0.5 flex items-center gap-0.5">
                          {badge && (
                            <span className="rounded-sm bg-black/10 px-0.5 text-[8px] font-bold leading-3">
                              {badge}
                            </span>
                          )}
                          {hasNote && (
                            <StickyNote className="h-2.5 w-2.5 opacity-70" strokeWidth={2.5} />
                          )}
                        </span>
                        <div
                          className={`text-[10px] font-semibold leading-tight ${
                            cspan >= 2 ? "line-clamp-3" : "line-clamp-2"
                          }`}
                        >
                          {c.courseName}
                        </div>
                        <div className="mt-0.5 text-[9px] tnum opacity-80">
                          {start}-{periodEnd(endBase)}
                        </div>
                        {c.location && cspan >= 2 && (
                          <div className="line-clamp-1 text-[9px] opacity-75">{c.location}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        )}
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
                    {config.periodTimes[selected.startSection - 1] &&
                      ` · ${config.periodTimes[selected.startSection - 1]}-${periodEnd(config.periodTimes[selected.endSection - 1] ?? "")}`}
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
              {/* 备注：跨同步保留，清空即删除 */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <StickyNote className="h-3.5 w-3.5" />
                  备注
                </div>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="比如：作业 DDL、考试范围、要带的东西…"
                  rows={3}
                  maxLength={500}
                  className="resize-none text-sm"
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={
                    saveNote.isPending ||
                    draft.trim() === (noteMap.get(courseKey(selected)) ?? "")
                  }
                  onClick={() =>
                    saveNote.mutate({ courseKey: courseKey(selected), note: draft })
                  }
                >
                  {saveNote.isPending ? "保存中…" : draft.trim() ? "保存备注" : "清除备注"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
