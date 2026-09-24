import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { trpc } from "@/providers/trpc";
import { WeekGrid } from "@/components/WeekGrid";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";
import { TodayView } from "@/components/TodayView";
import { MinePanel } from "@/components/MinePanel";
import { SquarePanel } from "@/components/SquarePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/Footer";
import { QuipTicker } from "@/components/QuipTicker";
import { QUIPS } from "@/lib/quips";
import { PokeBuddy } from "@/components/PokeBuddy";
import { InstallFab } from "@/components/InstallFab";
import { GuestBanner } from "@/components/GuestBanner";
import { DEMO_COURSES, demoConfig } from "@/lib/demo-data";
import { WeChatGuide } from "@/components/WeChatGuide";
import { CalendarDays, Clock3, Eye, EyeOff, MessagesSquare, UserRound } from "lucide-react";

type Tab = "today" | "week" | "square" | "mine";

const TABS: { key: Tab; label: string; icon: typeof Clock3 }[] = [
  { key: "today", label: "今日", icon: Clock3 },
  { key: "week", label: "课表", icon: CalendarDays },
  { key: "square", label: "广场", icon: MessagesSquare },
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
  // 用户在登录页点了「先看看效果」，进入游客预览
  const [guestPreview, setGuestPreview] = useState(false);

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  // Kimi 管理员身份需显式进入（它没有学号，不能直接当学生用）
  const isStudent = !!me.data?.studentId;
  const needKimiGate = !!me.data && !isStudent && !adminOverride;

  // 未登录：默认看登录页；用户主动点「预览」才进游客模式
  if (!me.data) {
    return guestPreview ? (
      <GuestApp
        onLogin={() => setGuestPreview(false)}
        onBack={() => setGuestPreview(false)}
      />
    ) : (
      <LoginView
        kimiUser={null}
        onEnterAdmin={() => setAdminOverride(true)}
        onPreview={() => setGuestPreview(true)}
      />
    );
  }

  if (needKimiGate) {
    return (
      <LoginView
        kimiUser={me.data && !isStudent ? me.data : null}
        onEnterAdmin={() => setAdminOverride(true)}
        onPreview={() => setGuestPreview(true)}
      />
    );
  }
  return <AuthedApp />;
}

/** 教务账密登录页：进度条 + 轮播梗 */
function LoginView({
  kimiUser,
  onEnterAdmin,
  onPreview,
}: {
  kimiUser: { name: string | null; role: string } | null;
  onEnterAdmin: () => void;
  onPreview: () => void;
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
      const msg = e.message;
      // 账号密码类错误：原样提示，便于用户自行修正
      if (msg.includes("登录失败")) {
        setErrMsg(msg);
        return;
      }
      // 其余情况（教务系统不可达 / 每日会话重置 / 接口变动等）统一用友好文案
      setErrMsg("立信的教务系统太坏了！偷偷吃掉了你的登录请求！等管理员睡醒一定去干掉他！");
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
            {/* 预览入口：给还在犹豫要不要登录的人一个低门槛的「先看看」 */}
            <button
              onClick={onPreview}
              className="mx-auto flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              <Eye className="h-3 w-3" />
              不确定要不要登录？先看看效果
            </button>

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

        <PokeBuddy initialLine={phase === "error" ? errMsg : undefined} />

        <Footer />
      </motion.div>
    </div>
  );
}


/**
 * 游客模式：未登录也能看课表长什么样
 *
 * 用一份虚构的演示课表渲染真实的 TodayView / WeekGrid，
 * 让访客直观了解产品形态，再决定要不要登录。
 * 「我的」标签页在游客模式下不出现，避免暴露账号相关 UI。
 */
function GuestApp({ onLogin, onBack }: { onLogin: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("today");
  const [week, setWeek] = useState<number | null>(null);
  const config = trpc.schedule.config.useQuery();

  const cfg = demoConfig(config.data);
  const currentWeek = Math.floor(
    (Date.now() - new Date(cfg.startDate + "T00:00:00").getTime()) / (7 * 24 * 3600 * 1000),
  ) + 1;
  const w = week ?? currentWeek;

  // 游客只能看「今日 / 课表 / 广场」，没有「我的」
  const guestTabs = TABS.filter((t) => t.key !== "mine");

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col pb-28">
      <header className="sticky top-0 z-30 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-black">
            立信课表<span className="text-primary">.</span>
          </h1>
          <span className="tnum text-xs text-muted-foreground">
            {cfg.semester} · 第 {currentWeek} 周
          </span>
        </div>
      </header>

      <GuestBanner onLogin={onLogin} onBack={onBack} />

      <main className="flex-1 px-4 py-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {tab === "today" && <TodayView courses={DEMO_COURSES} config={cfg} />}
            {tab === "week" && (
              <WeekGrid courses={DEMO_COURSES} config={cfg} week={w} setWeek={setWeek} />
            )}
            {tab === "square" && <SquarePanel readonly onNeedLogin={onLogin} />}

            {/* 游客模式下的引导卡片 */}
            <section className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="text-sm font-semibold">登录后可以做什么</h3>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                <li>· 自动同步你自己的课表，不用手动录</li>
                <li>· 上课前提醒、次日课表推送</li>
                <li>· 调课通知与课程备注</li>
                <li>· 在广场发言、发布和接取代课悬赏</li>
              </ul>
              <Button size="sm" className="mt-3 h-8 w-full text-xs" onClick={onLogin}>
                立即登录
              </Button>
            </section>

            <Footer />
          </motion.div>
        </AnimatePresence>
      </main>

      <WeChatGuide />
      <InstallFab />

      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-lg">
          <QuipTicker />
        </div>
        <nav className="border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-lg px-2 pb-1 pt-0.5">
            {guestTabs.map(({ key, label, icon: Icon }) => {
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
                      layoutId="guest-dock-pill"
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
        </nav>
      </div>
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
      <header className="sticky top-0 z-30 border-b bg-background/90 px-4 py-3 backdrop-blur">
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
            {tab === "square" && <SquarePanel />}
            {tab === "mine" && <MinePanel />}
            <Footer />
            <AnnouncementPopup />
          </motion.div>
        </AnimatePresence>
      </main>

      <WeChatGuide />
      <InstallFab />

      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="mx-auto max-w-lg">
          <QuipTicker />
        </div>
        <nav className="border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-lg px-2 pb-1 pt-0.5">
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
        </nav>
      </div>

    </div>
  );
}
