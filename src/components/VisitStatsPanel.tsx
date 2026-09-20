import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Eye, CalendarDays, RefreshCw } from "lucide-react";

/** 管理员：访问统计（仅管理员可见，不记录 IP） */
export function VisitStatsPanel() {
  const [tab, setTab] = useState<"people" | "recent">("people");
  const stats = trpc.schedule.visitStats.useQuery(undefined, {
    retry: false, // 非管理员 403，静默忽略
    refetchInterval: 60_000, // 每分钟刷新
  });

  if (stats.isError || !stats.data) return null;

  const { overview, periods, users, recent } = stats.data;

  const fmt = (d: string | Date | null | undefined) =>
    d
      ? new Date(d).toLocaleString("zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <section className="rounded-xl border border-primary/40 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold">
            <Users className="h-4 w-4" />
            访问统计
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            仅管理员可见 · 同一人 5 分钟内去重 · 不记录 IP
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={stats.isFetching}
          onClick={() => stats.refetch()}
        >
          <RefreshCw className={`h-3 w-3 ${stats.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* 总体数据 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            累计访问人数
          </div>
          <div className="tnum mt-1 text-xl font-bold">{overview.uniqueUsers}</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-2.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" />
            累计访问次数
          </div>
          <div className="tnum mt-1 text-xl font-bold">{overview.totalVisits}</div>
        </div>
      </div>

      {/* 时间维度 */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(
          [
            ["今日", periods.today],
            ["近 7 天", periods.week],
            ["近 30 天", periods.month],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-lg border p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {label}
            </div>
            <div className="tnum mt-0.5 text-sm font-semibold">
              {v.users}
              <span className="text-xs font-normal text-muted-foreground"> 人</span>
            </div>
            <div className="tnum text-[11px] text-muted-foreground">{v.visits} 次</div>
          </div>
        ))}
      </div>

      {/* 切换名单 / 流水 */}
      <div className="mt-3 flex gap-1.5">
        <Button
          size="sm"
          variant={tab === "people" ? "default" : "outline"}
          className="h-7 flex-1 px-2 text-xs"
          onClick={() => setTab("people")}
        >
          访问名单（{users.length}）
        </Button>
        <Button
          size="sm"
          variant={tab === "recent" ? "default" : "outline"}
          className="h-7 flex-1 px-2 text-xs"
          onClick={() => setTab("recent")}
        >
          最近流水（{recent.length}）
        </Button>
      </div>

      {tab === "people" ? (
        <div className="mt-2 max-h-72 overflow-y-auto">
          {users.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">暂无访问记录</p>
          ) : (
            <ul className="space-y-1.5">
              {users.map((u) => (
                <li
                  key={u.userId}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">
                        {u.realName || "（未知姓名）"}
                      </span>
                      <span className="tnum shrink-0 text-muted-foreground">
                        {u.studentId || "—"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {u.college || "—"} · 首次 {fmt(u.firstVisit)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant="secondary" className="tnum h-5 px-1.5 text-[11px]">
                      {u.visits} 次
                    </Badge>
                    <div className="tnum mt-1 text-[10px] text-muted-foreground">
                      {fmt(u.lastVisit)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-2 max-h-72 overflow-y-auto">
          {recent.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">暂无访问记录</p>
          ) : (
            <ul className="space-y-1">
              {recent.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-2 border-b border-dashed px-1 py-1.5 text-xs last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {v.realName || "（未知）"}
                    <span className="tnum ml-1.5 text-muted-foreground">{v.studentId || "—"}</span>
                  </span>
                  <span className="tnum shrink-0 text-[11px] text-muted-foreground">
                    {fmt(v.visitedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        说明：访问记录在用户打开网页时写入，同一账号 5 分钟内只记一次。仅保存学号、姓名、学院，
        <span className="text-foreground/70">不记录 IP 与设备信息</span>。
      </p>
    </section>
  );
}
