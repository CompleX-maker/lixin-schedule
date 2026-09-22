import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LogOut, Megaphone, RefreshCw, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { VisitStatsPanel } from "@/components/VisitStatsPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MinePanel() {
  const utils = trpc.useUtils();
  const me = trpc.schedule.me.useQuery(undefined, { retry: false });
  const status = trpc.schedule.status.useQuery();
  const reminder = trpc.schedule.reminder.useQuery();
  const logs = trpc.schedule.logs.useQuery();
  const mailConfig = trpc.schedule.mailConfig.useQuery(undefined, {
    retry: false, // 非管理员 403，静默忽略
  });

  const sync = trpc.schedule.sync.useMutation({
    onSuccess: (r) => {
      toast.success(`已同步 ${r.count} 条课程`);
      utils.schedule.invalidate();
    },
    onError: (e) => {
      const msg = e.message;
      // 账号/会话类错误原样显示，其余（教务系统不可达等）用友好文案
      if (msg.includes("登录失败") || msg.includes("尚未登录") || msg.includes("同步过于频繁")) {
        toast.error(msg);
        return;
      }
      toast.error("立信的教务系统太坏了！偷偷吃掉了你的同步请求！等管理员睡醒一定去干掉他！");
    },
  });
  const wipe = trpc.schedule.wipeMe.useMutation({
    onSuccess: () => {
      toast.success("已清除课表数据");
      utils.schedule.invalidate();
    },
  });
  const logout = trpc.schedule.logout.useMutation({
    onSuccess: async () => {
      await utils.schedule.invalidate();
    },
  });
  const updateReminder = trpc.schedule.updateReminder.useMutation({
    onSuccess: () => {
      toast.success("提醒设置已保存");
      utils.schedule.reminder.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [remForm, setRemForm] = useState({
    email: "",
    enableClassReminder: false,
    minutesBefore: 15,
    enableDailyDigest: false,
    digestHour: 21,
    serverChanKey: "",
  });
  useEffect(() => {
    if (reminder.data) {
      setRemForm({
        email: reminder.data.email ?? "",
        enableClassReminder: reminder.data.enableClassReminder,
        minutesBefore: reminder.data.minutesBefore,
        enableDailyDigest: reminder.data.enableDailyDigest,
        digestHour: reminder.data.digestHour,
        serverChanKey: reminder.data.serverChanKey ?? "",
      });
    }
  }, [reminder.data]);

  const s = status.data;
  const isAdmin = me.data?.role === "admin";

  return (
    <div className="space-y-6">
      {/* 账号区 */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">教务账号</h3>
          {s?.bound && (
            <Badge variant={s.status === "active" ? "default" : "destructive"}>
              {s.status === "active" ? "正常" : "异常"}
            </Badge>
          )}
        </div>
        <div className="space-y-3 text-sm">
          {s?.realName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">姓名</span>
              <span>{s.realName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">学号</span>
            <span className="tnum">{s?.studentId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">本学期课程</span>
            <span className="tnum">{s?.courseCount} 条</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">上次同步</span>
            <span className="tnum">
              {s?.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("zh-CN") : "从未"}
            </span>
          </div>
          {s?.lastError && (
            <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{s.lastError}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
              立即同步
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => {
                if (confirm("清除已同步的课表数据？（不影响教务系统本身）")) wipe.mutate();
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              清除数据
            </Button>
          </div>
        </div>
      </section>

      {/* 提醒设置 */}
      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 font-semibold">提醒</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">接收邮箱</Label>
            <Input
              id="email"
              type="email"
              value={remForm.email}
              onChange={(e) => setRemForm({ ...remForm, email: e.target.value })}
              placeholder="you@qq.com"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">上课前提醒</div>
              <div className="text-xs text-muted-foreground">通过邮件/Server酱推送</div>
            </div>
            <Switch
              checked={remForm.enableClassReminder}
              onCheckedChange={(v) => setRemForm({ ...remForm, enableClassReminder: v })}
            />
          </div>
          {remForm.enableClassReminder && (
            <div className="space-y-2">
              <Label>提前分钟数</Label>
              <Input
                type="number"
                min={5}
                max={120}
                value={remForm.minutesBefore}
                onChange={(e) => setRemForm({ ...remForm, minutesBefore: +e.target.value || 15 })}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">每晚推送明日课表</div>
              <div className="text-xs text-muted-foreground">默认 21:00</div>
            </div>
            <Switch
              checked={remForm.enableDailyDigest}
              onCheckedChange={(v) => setRemForm({ ...remForm, enableDailyDigest: v })}
            />
          </div>
          {remForm.enableDailyDigest && (
            <div className="space-y-2">
              <Label>推送时间（点）</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={remForm.digestHour}
                onChange={(e) => setRemForm({ ...remForm, digestHour: +e.target.value || 21 })}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sct">Server酱 SendKey（可选）</Label>
            <Input
              id="sct"
              value={remForm.serverChanKey}
              onChange={(e) => setRemForm({ ...remForm, serverChanKey: e.target.value })}
              placeholder="SCT..."
            />
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={updateReminder.isPending}
            onClick={() =>
              updateReminder.mutate({
                email: remForm.email || null,
                enableClassReminder: remForm.enableClassReminder,
                minutesBefore: remForm.minutesBefore,
                enableDailyDigest: remForm.enableDailyDigest,
                digestHour: remForm.digestHour,
                serverChanKey: remForm.serverChanKey || null,
              })
            }
          >
            保存提醒设置
          </Button>
        </div>
      </section>

      {isAdmin && <VisitStatsPanel />}

      {isAdmin && <AdminPanel mailConfigured={!!mailConfig.data?.user} />}

      {logs.data && logs.data.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-2 font-semibold">最近同步记录</h3>
          <ul className="space-y-1.5 text-xs">
            {logs.data.map((l) => (
              <li key={l.id} className="flex gap-2">
                <span className={l.ok ? "text-primary" : "text-destructive"}>{l.ok ? "✓" : "✗"}</span>
                <span className="tnum shrink-0 text-muted-foreground">
                  {new Date(l.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 break-all">{l.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        <LogOut className="mr-1 h-4 w-4" />
        退出登录（{me.data?.realName ?? me.data?.name ?? ""}）
      </Button>
      <p className="pb-2 text-center text-xs text-muted-foreground">
        换设备需重新登录 · 密码加密存储
      </p>
    </div>
  );
}

function AdminPanel({ mailConfigured }: { mailConfigured: boolean }) {
  const utils = trpc.useUtils();
  const config = trpc.schedule.config.useQuery();
  const mailConfig = trpc.schedule.mailConfig.useQuery();
  const annList = trpc.announcement.list.useQuery();
  const publishAnn = trpc.announcement.publish.useMutation({
    onSuccess: () => {
      toast.success("通知已发布，全站用户打开即弹窗");
      setAnnForm({ title: "", content: "", ttl: "72" });
      utils.announcement.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const closeAnn = trpc.announcement.close.useMutation({
    onSuccess: () => {
      toast.success("通知已关闭");
      utils.announcement.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [annForm, setAnnForm] = useState({ title: "", content: "", ttl: "72" });
  const activeAnn = annList.data?.find(
    (a) => a.status === "active" && (!a.expiresAt || new Date(a.expiresAt) > new Date()),
  );
  const updateConfig = trpc.schedule.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("学期配置已保存");
      utils.schedule.config.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMail = trpc.schedule.updateMailConfig.useMutation({
    onSuccess: () => {
      toast.success("邮件配置已保存");
      utils.schedule.mailConfig.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [cfg, setCfg] = useState({ semester: "", startDate: "", periodTimes: "" });
  useEffect(() => {
    if (config.data) {
      setCfg({
        semester: config.data.semester,
        startDate: config.data.startDate,
        periodTimes: config.data.periodTimes.join(","),
      });
    }
  }, [config.data]);

  const [mail, setMail] = useState({ host: "smtp.qq.com", port: 465, user: "", pass: "" });
  useEffect(() => {
    const mc = mailConfig.data;
    if (mc) {
      setMail((m) => ({ ...m, host: mc.host, port: mc.port, user: mc.user }));
    }
  }, [mailConfig.data]);

  return (
    <section className="rounded-xl border border-primary/40 bg-card p-4">
      <h3 className="mb-1 font-semibold">管理员配置</h3>
      <p className="mb-3 text-xs text-muted-foreground">全站通知、学期与发信设置</p>
      <div className="space-y-3">
        {/* 全站通知（调课提醒）：发布后用户打开网页即弹窗，可定时自动关闭 */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5" />
            全站通知（调课提醒）
          </Label>
          {activeAnn ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{activeAnn.title}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  disabled={closeAnn.isPending}
                  onClick={() => closeAnn.mutate({ id: activeAnn.id })}
                >
                  立即关闭
                </Button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{activeAnn.content}</p>
              <div className="mt-1 tnum text-muted-foreground/70">
                {activeAnn.expiresAt
                  ? `${new Date(activeAnn.expiresAt).toLocaleString("zh-CN")} 自动关闭`
                  : "不自动关闭（需手动关闭）"}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">当前没有生效中的通知</p>
          )}
          <Input
            value={annForm.title}
            onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
            placeholder="标题，如：调课通知"
            maxLength={120}
          />
          <Textarea
            value={annForm.content}
            onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
            placeholder="内容，如：第4周周四的概率论调到周五3-4节，教室二教313…"
            rows={3}
            maxLength={2000}
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Select
              value={annForm.ttl}
              onValueChange={(v) => setAnnForm({ ...annForm, ttl: v })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">1 天后自动关闭</SelectItem>
                <SelectItem value="72">3 天后自动关闭</SelectItem>
                <SelectItem value="168">7 天后自动关闭</SelectItem>
                <SelectItem value="manual">不自动关闭</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={publishAnn.isPending || !annForm.title.trim() || !annForm.content.trim()}
              onClick={() =>
                publishAnn.mutate({
                  title: annForm.title.trim(),
                  content: annForm.content.trim(),
                  ttlHours: annForm.ttl === "manual" ? null : Number(annForm.ttl),
                })
              }
            >
              {publishAnn.isPending ? "发布中…" : "发布"}
            </Button>
          </div>
          {annList.data && annList.data.length > 0 && (
            <ul className="space-y-1 pt-1 text-xs text-muted-foreground">
              {annList.data.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center gap-1.5">
                  <span
                    className={
                      a.status === "active" && (!a.expiresAt || new Date(a.expiresAt) > new Date())
                        ? "text-primary"
                        : "opacity-50"
                    }
                  >
                    ●
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <span className="tnum shrink-0 opacity-70">
                    {new Date(a.createdAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>学期代码</Label>
            <Input
              value={cfg.semester}
              onChange={(e) => setCfg({ ...cfg, semester: e.target.value })}
              placeholder="2026-2027-1"
            />
          </div>
          <div className="space-y-1">
            <Label>第一周周一</Label>
            <Input
              type="date"
              value={cfg.startDate}
              onChange={(e) => setCfg({ ...cfg, startDate: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>节次时间（逗号分隔，从第1节开始）</Label>
          <Input
            value={cfg.periodTimes}
            onChange={(e) => setCfg({ ...cfg, periodTimes: e.target.value })}
            placeholder="08:30,09:20,..."
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            updateConfig.mutate({
              semester: cfg.semester,
              startDate: cfg.startDate,
              periodTimes: cfg.periodTimes.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
            })
          }
        >
          保存学期配置
        </Button>

        <Separator />

        <div className="space-y-2">
          <Label>SMTP 发信（QQ邮箱授权码）{mailConfigured && "· 已配置"}</Label>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <Input
              value={mail.host}
              onChange={(e) => setMail({ ...mail, host: e.target.value })}
              placeholder="smtp.qq.com"
            />
            <Input
              type="number"
              value={mail.port}
              onChange={(e) => setMail({ ...mail, port: +e.target.value || 465 })}
            />
          </div>
          <Input
            value={mail.user}
            onChange={(e) => setMail({ ...mail, user: e.target.value })}
            placeholder="发信邮箱 xxx@qq.com"
          />
          <Input
            type="password"
            value={mail.pass}
            onChange={(e) => setMail({ ...mail, pass: e.target.value })}
            placeholder="授权码（留空则保持不变）"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateMail.mutate({ ...mail, pass: mail.pass || undefined })}
          >
            保存邮件配置
          </Button>
        </div>
      </div>
    </section>
  );
}
