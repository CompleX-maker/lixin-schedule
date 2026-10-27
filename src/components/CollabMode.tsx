import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { trpc } from "@/providers/trpc";
import { resolvePeriodGroup } from "@/lib/campus-timetable";
import { toast } from "sonner";

/** 每天节数（用于计算空闲区间） */
const SECTIONS_PER_DAY = 12;
const DAY_LABEL = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

type Course = {
  courseName: string;
  dayOfWeek: number;
  startSection: number;
  endSection: number;
  location?: string | null;
};



/** 生成齿轮路径：梯形齿 + evenodd 挖空中心 */
function gearPath(cx: number, cy: number, teeth: number, rOuter: number, rInner: number, rHole: number) {
  const step = (Math.PI * 2) / teeth;
  const half = step * 0.26;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    pts.push([a - half * 1.9, rInner]);
    pts.push([a - half, rOuter]);
    pts.push([a + half, rOuter]);
    pts.push([a + half * 1.9, rInner]);
  }
  const body = pts
    .map(([a, r], i) =>
      `${i === 0 ? "M" : "L"}${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`,
    )
    .join(" ");
  const hole = `M${cx - rHole},${cy} a${rHole},${rHole} 0 1,0 ${rHole * 2},0 a${rHole},${rHole} 0 1,0 ${-rHole * 2},0`;
  return `${body} Z ${hole} Z`;
}

/** 全屏齿轮动画：切入协作模式（大齿轮 + 小齿轮反向咬合） */
export function GearTransition({ show }: { show: boolean }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!show) {
      setGo(false);
      return;
    }
    const t = window.setTimeout(() => setGo(true), 30);
    return () => window.clearTimeout(t);
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <svg width="176" height="176" viewBox="0 0 120 120" className="text-primary">
            <g
              style={{
                transformBox: "view-box", transformOrigin: "46px 46px",
                transform: go ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 1.15s cubic-bezier(.45,.05,.55,.95)",
              }}
            >
              <path d={gearPath(46, 46, 12, 30, 23.5, 8.5)} fill="currentColor" fillRule="evenodd" />
            </g>
            <g
              style={{
                transformBox: "view-box", transformOrigin: "80px 80px",
                transform: go ? "rotate(-284deg)" : "rotate(0deg)",
                transition: "transform 1.15s cubic-bezier(.45,.05,.55,.95)",
                opacity: 0.5,
              }}
            >
              <path d={gearPath(80, 80, 9, 19, 14, 5)} fill="currentColor" fillRule="evenodd" />
            </g>
          </svg>
          <motion.p
            className="mt-8 text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            正在切换到协作模式…
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 全屏钟表动画：切回个人模式（指针先慢、中间加速、末尾减速） */
export function ClockTransition({ show }: { show: boolean }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!show) {
      setGo(false);
      return;
    }
    const t = window.setTimeout(() => setGo(true), 30);
    return () => window.clearTimeout(t);
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <svg width="168" height="168" viewBox="0 0 100 100" className="text-primary">
            <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.8" />
            {Array.from({ length: 12 }).map((_, i) => (
              <line
                key={i}
                x1="50"
                y1="8"
                x2="50"
                y2={i % 3 === 0 ? 15 : 12}
                stroke="currentColor"
                strokeWidth={i % 3 === 0 ? 2.2 : 1.1}
                opacity={i % 3 === 0 ? 0.9 : 0.4}
                transform={`rotate(${i * 30} 50 50)`}
              />
            ))}
            <g
              style={{
                transformBox: "view-box", transformOrigin: "50px 50px",
                transform: go ? "rotate(360deg)" : "rotate(0deg)",
                transition: "transform 1.6s cubic-bezier(.75,0,.25,1)",
              }}
            >
              <line
                x1="50"
                y1="50"
                x2="50"
                y2="21"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
            </g>
            <circle cx="50" cy="50" r="3.2" fill="currentColor" />
          </svg>
          <motion.p
            className="mt-8 text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            回到我的课表…
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type Partner = { inviteId: number; userId: number; name: string | null; studentId: string | null };

/** 通用二次确认弹层 */
function ConfirmDialog({
  open, title, description, confirmText = "确认", danger = false, pending = false, onCancel, onConfirm,
}: {
  open: boolean; title: string; description?: string; confirmText?: string;
  danger?: boolean; pending?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}
        >
          <motion.div
            className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 16, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">{title}</h3>
            {description && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>}
            <div className="mt-5 flex gap-2">
              <button className="flex-1 rounded-xl border py-2.5 text-sm font-medium" onClick={onCancel} disabled={pending}>取消</button>
              <button
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${danger ? "bg-red-500" : "bg-primary"}`}
                onClick={onConfirm} disabled={pending}
              >
                {pending ? "处理中…" : confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Initial({ name }: { name: string }) {
  const ch = (name || "?").trim().charAt(0);
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
      {ch}
    </span>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <h3 className="text-sm font-semibold tracking-tight">{children}</h3>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/* ===== 课程手动配置（本地保存）===== */

type Override = { skip?: boolean; dayOfWeek?: number; startSection?: number; endSection?: number };
const OV_KEY = "lixin:course-overrides:v1";

function keyOf(c: Course) {
  return `${c.courseName}|${c.dayOfWeek}|${c.startSection}|${c.endSection}`;
}

function courseKey(c: Course) {
  return keyOf(c);
}

function useOverrides() {
  const [map, setMap] = useState<Record<string, Override>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OV_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const update = (next: Record<string, Override>) => {
    setMap(next);
    try {
      localStorage.setItem(OV_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式下写入失败，忽略 */
    }
  };

  const setOne = (c: Course, patch: Override | null) => {
    const k = courseKey(c);
    const next = { ...map };
    if (patch === null) delete next[k];
    else next[k] = { ...(next[k] || {}), ...patch };
    update(next);
  };

  /** 应用配置：过滤水课、改写调课后的时间 */
  const apply = (list: Course[]): Course[] =>
    list
      .filter((c) => !map[courseKey(c)]?.skip)
      .map((c) => {
        const ov = map[courseKey(c)];
        if (!ov) return c;
        return {
          ...c,
          dayOfWeek: ov.dayOfWeek ?? c.dayOfWeek,
          startSection: ov.startSection ?? c.startSection,
          endSection: ov.endSection ?? c.endSection,
        };
      });

  /** 调课/可跳过的课程清单（含水课，供设置区展示） */
  const annotate = (list: Course[]) =>
    list.map((c) => ({ course: c, ov: map[courseKey(c)] || {} }));

  return { map, setOne, apply, annotate };
}

/** 某门课在当前周的真实时间（考虑调课与作息差异） */
function courseClock(c: Course, week: number) {
  const weeks = (c as any).weeks as number[] | undefined;
  if (Array.isArray(weeks) && weeks.length > 0 && !weeks.includes(week)) return null;
  const times = resolvePeriodGroup(c.location).periodTimes;
  const startStr = times[c.startSection - 1] ?? "08:30";
  const endBase = times[c.endSection - 1] ?? startStr;
  const [eh, em] = endBase.split(":").map(Number);
  const endMin = eh * 60 + em + 45;
  const endStr = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  return { startStr, endStr };
}

/** 多人共同空闲：返回每一天的 {section 区间, 起始/结束时刻} */
function commonFree(
  mine: Course[],
  others: Course[][],
  week: number,
  day: number,
  tolerance = 0,
): Array<{ s: number; e: number; from: string; to: string; conflicts: number }> {
  // 数每个节次有多少人忙，容忍 N 人冲突时仍算空
  const busyCount = Array(SECTIONS_PER_DAY + 2).fill(0);
  const mark = (list: Course[]) => {
    list
      .filter((c) => c.dayOfWeek === day && courseClock(c, week))
      .forEach((c) => {
        for (let k = c.startSection; k <= c.endSection; k++) {
          if (k >= 1 && k <= SECTIONS_PER_DAY) busyCount[k] += 1;
        }
      });
  };
  mark(mine);
  others.forEach(mark);

  const okSlot = (k: number) => busyCount[k] <= tolerance;
  const out: Array<{ s: number; e: number; from: string; to: string; conflicts: number }> = [];
  let startSec: number | null = null;
  for (let k = 1; k <= SECTIONS_PER_DAY; k++) {
    const freeNow = okSlot(k);
    if (freeNow && startSec === null) startSec = k;
    const last = k === SECTIONS_PER_DAY;
    if (startSec !== null && (!freeNow || last)) {
      const endSec = freeNow && last ? k : k - 1;
      if (endSec >= startSec) {
        const probe: Course = {
          courseName: "",
          dayOfWeek: day,
          startSection: startSec,
          endSection: endSec,
          location: null,
        } as Course;
        const clock = courseClock(probe, week);
        if (clock) {
          let worst = 0;
          for (let x = startSec; x <= endSec; x++) worst = Math.max(worst, busyCount[x]);
          out.push({ s: startSec, e: endSec, from: clock.startStr, to: clock.endStr, conflicts: worst });
        }
      }
      startSec = null;
    }
  }
  return out;
}

/** 协作面板（全屏） */
export function CollabPanel({
  open, onClose, myCourses, week,
}: {
  open: boolean; onClose: () => void; myCourses: Course[]; week: number;
}) {
  const utils = trpc.useUtils();
  const state = trpc.collab.state.useQuery(undefined, { enabled: open });
  const [studentId, setStudentId] = useState("");
  const [selected, setSelected] = useState<number[] | null>(null);
  const [mode, setMode] = useState<"overlay" | "theirs">("overlay");
  const [lastInvite, setLastInvite] = useState<{ link: string; studentId: string } | null>(null);
  const [confirmInvite, setConfirmInvite] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Partner | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [tolerance, setTolerance] = useState(0);
  const [editing, setEditing] = useState<Course | null>(null);

  const { setOne, apply, annotate } = useOverrides();
  const myApplied = apply(myCourses);

  const invite = trpc.collab.invite.useMutation({
    onSuccess: (r: any) => {
      setConfirmInvite(false);
      if (r?.ok === false && r.reason === "self") {
        toast.error("不能和自己协作啦");
        return;
      }
      utils.collab.state.invalidate();
      if (r?.registered === false) {
        setLastInvite({ link: r.shareLink, studentId });
        toast("对方还没有注册哦", { description: "把链接发给 ta，注册后就能一起看课表" });
      } else if (r?.already) {
        toast("你们已经在协作中");
      } else {
        toast.success("邀请已送出", { description: "等对方在首页确认后即可查看共同空闲" });
      }
      setStudentId("");
    },
    onError: (e) => {
      setConfirmInvite(false);
      toast.error(e.message);
    },
  });

  const accept = trpc.collab.accept.useMutation({
    onSuccess: () => { utils.collab.state.invalidate(); toast.success("已接受邀请"); },
  });
  const decline = trpc.collab.decline.useMutation({ onSuccess: () => utils.collab.state.invalidate() });
  const remove = trpc.collab.remove.useMutation({
    onSuccess: () => {
      utils.collab.state.invalidate();
      setConfirmRemove(null);
      toast.success("已解除协作");
    },
  });

  const partners: Partner[] = (state.data?.partners as Partner[]) ?? [];
  const inbox: any[] = (state.data?.inbox as any[]) ?? [];
  // 默认全选；用户改动后以用户选择为准
  const chosen = selected ?? partners.map((p) => p.userId);
  const chosenPartners = partners.filter((p) => chosen.includes(p.userId));

  const multi = trpc.collab.partnerCourses.useQuery(
    { userIds: chosen.length > 0 ? chosen : [0] },
    { enabled: open && chosen.length > 0 },
  );
  const othersCourses: Course[][] = ((multi.data?.partners as any[]) ?? []).map(
    (p: any) => (p.courses ?? []) as Course[],
  );

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("链接已复制");
    } catch {
      toast.error("复制失败，请长按选择");
    }
  };

  const MAX_PICK = 30;
  const toggle = (id: number) => {
    const base = selected ?? partners.map((p) => p.userId);
    if (base.includes(id)) {
      setSelected(base.filter((x) => x !== id));
    } else if (base.length >= MAX_PICK) {
      toast.error(`最多同时选 ${MAX_PICK} 人`);
    } else {
      setSelected([...base, id]);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 overflow-y-auto bg-background pb-24"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
            <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
              <div>
                <h2 className="text-lg font-black tracking-tight">协作</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">多人对齐空闲时间</p>
              </div>
              <button className="rounded-xl border px-3.5 py-1.5 text-sm text-muted-foreground" onClick={onClose}>
                收起
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-lg space-y-5 px-4 py-5">
            {inbox.length > 0 && (
              <section className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <p className="text-sm font-semibold">您有一条协作邀请，快来看看吧！</p>
                </div>
                <div className="space-y-2">
                  {inbox.map((iv) => (
                    <div key={iv.token} className="flex items-center gap-3 rounded-xl bg-background/70 p-2.5">
                      <Initial name={iv.fromName ?? "同学"} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{iv.fromName ?? "同学"}</p>
                        <p className="text-[11px] text-muted-foreground">{iv.fromStudentId}</p>
                      </div>
                      <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white" onClick={() => accept.mutate({ token: iv.token })}>接受</button>
                      <button className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => decline.mutate({ token: iv.token })}>忽略</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border p-4">
              <SectionTitle hint="输入对方学号">添加同学</SectionTitle>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/60"
                  placeholder="请输入对方学号"
                  inputMode="numeric"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  className="shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-40"
                  disabled={studentId.length < 6 || invite.isPending}
                  onClick={() => setConfirmInvite(true)}
                >
                  邀请
                </button>
              </div>

              {lastInvite && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-xl border border-dashed bg-muted/30 p-3">
                  <p className="text-sm font-medium">对方还没有注册哦</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">分享链接邀请 ta 一起来吧！注册后会自动看到这条邀请。</p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">{lastInvite.link}</code>
                    <button className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium" onClick={() => copy(lastInvite.link)}>复制链接</button>
                  </div>
                </motion.div>
              )}
            </section>

            <section className="rounded-2xl border p-4">
              <button className="flex w-full items-center justify-between" onClick={() => setCfgOpen((v) => !v)}>
                <div className="text-left">
                  <h3 className="text-sm font-semibold tracking-tight">我的课程设置</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">标记水课或手动调课，计算空闲时会按设置来</p>
                </div>
                <span className="text-xs text-muted-foreground">{cfgOpen ? "收起" : "展开"}</span>
              </button>

              <AnimatePresence initial={false}>
                {cfgOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-3 divide-y rounded-xl border">
                      {annotate(myCourses).length === 0 && <p className="p-4 text-sm text-muted-foreground">还没有同步到课程</p>}
                      {annotate(myCourses).map(({ course, ov }) => {
                        const day = ov.dayOfWeek ?? course.dayOfWeek;
                        const st = ov.startSection ?? course.startSection;
                        const en = ov.endSection ?? course.endSection;
                        const moved = day !== course.dayOfWeek || st !== course.startSection || en !== course.endSection;
                        return (
                          <div key={courseKey(course)} className={`flex items-center gap-2 px-3 py-2.5 ${ov.skip ? "opacity-50" : ""}`}>
                            <span className="w-9 shrink-0 text-[11px] text-muted-foreground">{DAY_LABEL[day - 1]}</span>
                            <span className="w-11 shrink-0 text-[11px] font-medium text-primary">{st}-{en}</span>
                            <span className="min-w-0 flex-1 truncate text-sm">{course.courseName}</span>
                            {moved && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600">已调课</span>}
                            <button className={`shrink-0 rounded-md border px-2 py-1 text-[11px] ${ov.skip ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`} onClick={() => setOne(course, { skip: !ov.skip })}>水课</button>
                            <button className="shrink-0 rounded-md border px-2 py-1 text-[11px] text-muted-foreground" onClick={() => setEditing(course)}>调课</button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">标记为「水课」后不计入忙碌时段；「调课」会改写这门课的星期与节次。</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <section className="rounded-2xl border p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight">协作对象</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">已选 {chosen.length}/{partners.length}</span>
                  <button
                    className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground"
                    onClick={() => setSelected(partners.slice(0, MAX_PICK).map((p) => p.userId))}
                  >
                    全选
                  </button>
                  <button
                    className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground"
                    onClick={() => setSelected([])}
                  >
                    清空
                  </button>
                </div>
              </div>
              {partners.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">还没有协作对象，邀请一位同学后就能看到共同空闲</p>
              ) : (
                <>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {partners.map((p) => {
                      const on = chosen.includes(p.userId);
                      return (
                        <button
                          key={p.userId}
                          onClick={() => toggle(p.userId)}
                          className={`flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 transition-colors ${on ? "border-primary bg-primary/10" : "bg-background opacity-60"}`}
                        >
                          <Initial name={p.name ?? p.studentId ?? "?"} />
                          <span className={`text-sm ${on ? "font-semibold text-primary" : ""}`}>{p.name ?? p.studentId}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    点选要一起约的人（可多选），下方按所有人共同的空闲时间计算
                  </p>
                </>
              )}
            </section>

            {chosen.length > 0 && (
              <section className="rounded-2xl border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">
                      {chosen.length === 1 ? "两人共同空闲" : `${chosen.length + 1} 人共同空闲`}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {tolerance === 0 ? "所有人都没课的时间段" : `最多允许 ${tolerance} 人有课`}
                    </p>
                  </div>
                  {chosen.length === 1 && (
                    <div className="flex shrink-0 gap-0.5 rounded-xl border p-0.5 text-xs">
                      <button className={`rounded-lg px-2.5 py-1 ${mode === "overlay" ? "bg-primary text-white" : "text-muted-foreground"}`} onClick={() => setMode("overlay")}>空闲</button>
                      <button className={`rounded-lg px-2.5 py-1 ${mode === "theirs" ? "bg-primary text-white" : "text-muted-foreground"}`} onClick={() => setMode("theirs")}>看 ta 的</button>
                    </div>
                  )}
                </div>

                  <div className="mb-2 flex items-center gap-1 rounded-xl border p-0.5 text-[11px]">
                    {[0, 1, 2].map((t) => (
                      <button
                        key={t}
                        className={`flex-1 rounded-lg px-2 py-1 ${tolerance === t ? "bg-primary text-white" : "text-muted-foreground"}`}
                        onClick={() => setTolerance(t)}
                      >
                        {t === 0 ? "严格（都要空）" : `容忍 ${t} 人有课`}
                      </button>
                    ))}
                  </div>
                {mode === "theirs" && chosen.length === 1 ? (
                  <div className="divide-y rounded-xl border">
                    {othersCourses[0]?.length ? (
                      othersCourses[0]
                        .slice()
                        .filter((c) => courseClock(c, week))
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startSection - b.startSection)
                        .map((c, i) => {
                          const clk = courseClock(c, week)!;
                          return (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                              <span className="w-9 shrink-0 text-xs text-muted-foreground">{DAY_LABEL[c.dayOfWeek - 1]}</span>
                              <span className="text-xs font-medium text-primary">{clk.startStr}–{clk.endStr}</span>
                            </div>
                          );
                        })
                    ) : (
                      <p className="p-4 text-sm text-muted-foreground">ta 这周没有课表数据</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {DAY_LABEL.map((label, idx) => {
                      const day = idx + 1;
                      const slots = commonFree(myApplied, othersCourses, week, day, tolerance);
                      return (
                        <div key={label} className="rounded-xl border bg-muted/25 p-2.5">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 w-9 shrink-0 text-xs font-semibold">{label}</span>
                            <span className="flex flex-1 flex-wrap gap-1">
                              {slots.length === 0 ? (
                                <span className="text-[11px] text-muted-foreground">没有共同空闲</span>
                              ) : (
                                slots.map((w) => (
                                  <span key={w.s} className="rounded-md bg-primary/12 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                                    {w.from}–{w.to}
                                    {w.conflicts > 0 && (
                                      <span className="ml-1 text-[10px] text-muted-foreground">·{w.conflicts}人忙</span>
                                    )}
                                  </span>
                                ))
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {chosenPartners.length === 1 && (
                  <button
                    className="mt-3.5 w-full rounded-xl border border-dashed py-2 text-xs text-muted-foreground"
                    onClick={() => setConfirmRemove(chosenPartners[0])}
                  >
                    解除与 {chosenPartners[0].name ?? chosenPartners[0].studentId} 的协作
                  </button>
                )}
              </section>
            )}
          </div>

          <ConfirmDialog
            open={confirmInvite}
            title={`向 ${studentId} 发起协作邀请？`}
            description="对方同意后，你们可以互相查看课表并计算共同空闲时间。"
            confirmText="发起邀请"
            pending={invite.isPending}
            onCancel={() => setConfirmInvite(false)}
            onConfirm={() => invite.mutate({ studentId })}
          />

          <ConfirmDialog
            open={!!confirmRemove}
            title={`解除与 ${confirmRemove?.name ?? confirmRemove?.studentId ?? ""} 的协作？`}
            description="解除后双方将无法再查看对方的课表，可以随时重新邀请。"
            confirmText="解除协作"
            danger
            pending={remove.isPending}
            onCancel={() => setConfirmRemove(null)}
            onConfirm={() => confirmRemove && remove.mutate({ inviteId: confirmRemove.inviteId })}
          />

          <AnimatePresence>
            {editing && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setEditing(null)}
              >
                <motion.div
                  className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl"
                  initial={{ y: 24, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-base font-semibold">调课 · {editing.courseName}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    原时间：{DAY_LABEL[editing.dayOfWeek - 1]} 第 {editing.startSection}-{editing.endSection} 节
                  </p>
                  <EditForm
                    course={editing}
                    onCancel={() => setEditing(null)}
                    onSave={(patch) => { setOne(editing, patch); setEditing(null); toast.success("已更新这门课的时间"); }}
                    onReset={() => { setOne(editing, null); setEditing(null); toast.success("已恢复原时间"); }}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 调课表单 */
function EditForm({
  course, onCancel, onSave, onReset,
}: {
  course: Course;
  onCancel: () => void;
  onSave: (patch: Override) => void;
  onReset: () => void;
}) {
  const [day, setDay] = useState(course.dayOfWeek);
  const [start, setStart] = useState(course.startSection);
  const [end, setEnd] = useState(course.endSection);
  const sections = Array.from({ length: SECTIONS_PER_DAY }, (_, i) => i + 1);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-12 text-xs text-muted-foreground">星期</span>
        <select className="flex-1 rounded-lg border bg-background px-2 py-2 text-sm" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {DAY_LABEL.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-xs text-muted-foreground">节次</span>
        <select className="flex-1 rounded-lg border bg-background px-2 py-2 text-sm" value={start} onChange={(e) => setStart(Number(e.target.value))}>
          {sections.map((x) => <option key={x} value={x}>第 {x} 节</option>)}
        </select>
        <span className="text-xs text-muted-foreground">到</span>
        <select className="flex-1 rounded-lg border bg-background px-2 py-2 text-sm" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
          {sections.filter((x) => x >= start).map((x) => <option key={x} value={x}>第 {x} 节</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button className="flex-1 rounded-xl border py-2.5 text-sm" onClick={onCancel}>取消</button>
        <button className="flex-1 rounded-xl border border-amber-500/40 py-2.5 text-sm text-amber-600" onClick={onReset}>恢复原时间</button>
        <button className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white" onClick={() => onSave({ dayOfWeek: day, startSection: start, endSection: Math.max(start, end) })}>保存</button>
      </div>
    </div>
  );
}
