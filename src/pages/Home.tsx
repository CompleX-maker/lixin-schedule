import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { WeekGrid } from "@/components/WeekGrid";
import { TodayView } from "@/components/TodayView";
import { MinePanel } from "@/components/MinePanel";
import { Button } from "@/components/ui/button";
import { LOGIN_PATH } from "@/const";
import { CalendarDays, Clock3, UserRound } from "lucide-react";

type Tab = "today" | "week" | "mine";

const TABS: { key: Tab; label: string; icon: typeof Clock3 }[] = [
  { key: "today", label: "今日", icon: Clock3 },
  { key: "week", label: "课表", icon: CalendarDays },
  { key: "mine", label: "我的", icon: UserRound },
];

export default function Home() {
  const { user, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("today");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Landing />;

  return <AuthedApp tab={tab} setTab={setTab} />;
}

function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="label-caps text-muted-foreground">LIXIN SCHEDULE</div>
      <h1 className="mt-3 text-4xl font-black leading-tight">
        立信课表
        <span className="text-primary">.</span>
      </h1>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
        绑定教务系统账号，自动同步课表。
        <br />
        下一节课倒计时、上课提醒、每晚明日课表推送。
      </p>
      <Button size="lg" className="mt-8 w-full max-w-xs" onClick={() => (window.location.href = LOGIN_PATH)}>
        使用 Kimi 账号登录
      </Button>
      <p className="mt-4 text-xs text-muted-foreground">
        教务密码加密存储 · 仅用于课表同步
      </p>
    </div>
  );
}

function AuthedApp({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
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
  const needBind = status.data && !status.data.bound;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col pb-20">
      {/* 顶栏 */}
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
        {needBind ? (
          <div className="mt-16 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              还没有绑定教务账号，去「我的」页面绑定后自动同步课表
            </p>
            <Button onClick={() => setTab("mine")}>去绑定</Button>
          </div>
        ) : (
          <>
            {tab === "today" && cfg && <TodayView courses={courses} config={cfg} />}
            {tab === "week" && cfg && (
              <WeekGrid courses={courses} config={cfg} week={w} setWeek={setWeek} />
            )}
            {tab === "mine" && <MinePanel />}
          </>
        )}
      </main>

      {/* 底部 Tab */}
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                tab === key ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${tab === key ? "text-primary" : ""}`}
                strokeWidth={tab === key ? 2.4 : 1.8}
              />
              <span className={tab === key ? "font-semibold" : ""}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
