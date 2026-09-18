import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { trpc } from "@/providers/trpc";
import { WeekGrid } from "@/components/WeekGrid";
import { TodayView } from "@/components/TodayView";
import { MinePanel } from "@/components/MinePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/Footer";
import { QuipTicker } from "@/components/QuipTicker";
import { QUIPS } from "@/lib/quips";
import { CalendarDays, Clock3, Eye, EyeOff, UserRound } from "lucide-react";

type Tab = "today" | "week" | "mine";

const TABS: { key: Tab; label: string; icon: typeof Clock3 }[] = [
  { key: "today", label: "今日", icon: Clock3 },
  { key: "week", label: "课表", icon: CalendarDays },
  { key: "mine", label: "我的", icon: UserRound },
];

/** 登录加载期间的轮播文案：进行中的状态 + 立信段子 */
const LOADING_LINES = [
  "正在验证你的统一身份认证…",
  ...QUIPS,
  "正在把你的课表从教务处薅出来…",
  "正在按单双周把课程码放整齐…",
];

export default function Home() {
  const me = trpc.schedule.me.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const [adminOverride, setAdminOverride] = useState(false);

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  // 只有教务身份（有学号）才能直接进 App；Kimi 管理员身份落在登录页，需显式进入
  const isStudent = !!me.data?.studentId;
  if (!me.data || (!isStudent && !adminOverride)) {
    return (
      <LoginView
        kimiUser={me.data && !isStudent ? me.data : null}
        onEnterAdmin={() => setAdminOverride(true)}
      />
    );
  }
  return <AuthedApp />;
}

/** 教务账密登录页：进度条 + 轮播梗 */
function LoginView({
  kimiUser,
  onEnterAdmin,
}: {
  kimiUser: { name: string | null; role: string } | null;
  onEnterAdmin: () => void;
}) {
  const utils = trpc.useUtils();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  const login = trpc.schedule.login.useMutation({
    onSuccess: async () => {
      setProgress(100);
      timers.current.forEach(clearInterval);
      setTimeout(async () => {
        await utils.schedule.invalidate();
      }, 500);
    },
    onError: (e) => {
      timers.current.forEach(clearInterval);
      setPhase("error");
      setErrMsg(e.message.includes("登录失败") ? e.message : "登录失败，检查学号密码，或稍后再试");
    },
  });

  useEffect(() => () => timers.current.forEach(clearInterval), []);

  function startLogin() {
    if (!studentId || !password || phase === "loading") return;
    setPhase("loading");
    setErrMsg("");
    setProgress(0);
    setLineIdx(0);
    // 进度条：先快后慢，最多爬到 92%，等接口回来再补满
    let p = 0;
    const pt = setInterval(() => {
      p += p < 55 ? 7 : p < 80 ? 2.5 : p < 92 ? 0.6 : 0;
      setProgress(Math.min(92, p));
    }, 220);
    const lt = setInterval(() => setLineIdx((i) => (i + 1) % LOADING_LINES.length), 2600);
    timers.current = [pt, lt];
    login.mutate({ studentId, password });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-xs"
      >
        <div className="text-center">
          <div className="label-caps text-muted-foreground">LIXIN SCHEDULE</div>
          <h1 className="mt-3 text-4xl font-black leading-tight">
            立信课表<span className="text-primary">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">统一身份认证登录，课表自动同步</p>
        </div>

        {phase === "loading" ? (
          <div className="mt-10 space-y-5">
            {/* 进度条 */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="tnum text-xs text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            {/* 轮播文案：淡入切换 */}
            <p
              key={lineIdx}
              className="animate-in fade-in slide-in-from-bottom-1 text-center text-sm text-muted-foreground duration-500"
            >
              {LOADING_LINES[lineIdx]}
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <Input
              value={studentId}
              onChange={(e) => setStudentId(e.target.value.trim())}
              placeholder="学号"
              autoComplete="username"
              className="h-12 text-base"
              onKeyDown={(e) => e.key === "Enter" && startLogin()}
            />
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="统一身份认证密码"
                autoComplete="current-password"
                className="h-12 pr-11 text-base"
                onKeyDown={(e) => e.key === "Enter" && startLogin()}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {phase === "error" && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
                {errMsg}
              </p>
            )}
            <Button
              size="lg"
              className="h-12 w-full text-base font-semibold"
              disabled={!studentId || !password}
              onClick={startLogin}
            >
              登录并同步课表
            </Button>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              密码加密存储，仅用于课表同步
              <br />
              课表只存在你自己的账号下，换设备重新登录
            </p>
            {kimiUser && (
              <button
                onClick={onEnterAdmin}
                className="mx-auto block text-xs text-muted-foreground/70 underline underline-offset-2"
              >
                管理员入口（{kimiUser.name ?? "Kimi"}）
              </button>
            )}
          </div>
        )}
        <Footer />
      </motion.div>
    </div>
  );
}

function AuthedApp() {
  const [tab, setTab] = useState<Tab>("today");
  const status = trpc.schedule.status.useQuery();
  const coursesQuery = trpc.schedule.myCourses.useQuery(undefined, {
    enabled: !!status.data?.bound,
  });
  const [week, setWeek] = useState<number | null>(null);

  const cfg = status.data?.config;
  const currentWeek = cfg
    ? Math.floor(
        (Date.now() - new Date(cfg.startDate + "T00:00:00").getTime()) / (7 * 24 * 3600 * 1000),
      ) + 1
    : 1;
  const w = week ?? currentWeek;
  const courses = coursesQuery.data?.courses ?? [];

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col pb-28">
      <header className="sticky top-0 z-10 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-black">
            立信课表<span className="text-primary">.</span>
          </h1>
          {cfg && (
            <span className="tnum text-xs text-muted-foreground">
              {cfg.semester} · 第 {currentWeek} 周
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {tab === "today" && cfg && <TodayView courses={courses} config={cfg} />}
            {tab === "week" && cfg && (
              <WeekGrid courses={courses} config={cfg} week={w} setWeek={setWeek} />
            )}
            {tab === "mine" && <MinePanel />}
            <Footer />
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <QuipTicker />
          <div className="flex px-2 pb-1 pt-0.5">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <motion.button
                  key={key}
                  onClick={() => setTab(key)}
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="dock-pill"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      className="absolute inset-x-2 inset-y-0.5 rounded-xl bg-primary/10"
                    />
                  )}
                  <motion.span
                    animate={{ scale: active ? 1.12 : 1, y: active ? -1 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    className="relative z-10"
                  >
                    <Icon
                      className={`h-5 w-5 ${active ? "text-primary" : ""}`}
                      strokeWidth={active ? 2.4 : 1.8}
                    />
                  </motion.span>
                  <span className={`relative z-10 ${active ? "font-semibold" : ""}`}>{label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
