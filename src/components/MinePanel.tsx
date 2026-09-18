import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LogOut, RefreshCw, Trash2 } from "lucide-react";

export function MinePanel() {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const status = trpc.schedule.status.useQuery();
  const reminder = trpc.schedule.reminder.useQuery();
  const logs = trpc.schedule.logs.useQuery();
  const mailConfig = trpc.schedule.mailConfig.useQuery(undefined, {
    retry: false,
    // 非管理员会 403，静默忽略
  });

  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");

  const bind = trpc.schedule.bind.useMutation({
    onSuccess: (r) => {
      if (r.ok) toast.success(`绑定成功，已同步 ${r.count} 条课程`);
      else toast.warning(`账号已保存，但课表抓取未成功：${r.error}`);
      setPassword("");
      utils.schedule.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const unbind = trpc.schedule.unbind.useMutation({
    onSuccess: () => {
      toast.success("已解绑");
      utils.schedule.invalidate();
    },
  });
  const sync = trpc.schedule.sync.useMutation({
    onSuccess: (r) => {
      toast.success(`已同步 ${r.count} 条课程`);
      utils.schedule.invalidate();
    },
    onError: (e) => toast.error(`同步失败：${e.message}`),
  });
  const updateReminder = trpc.schedule.updateReminder.useMutation({
    onSuccess: () => {
      toast.success("提醒设置已保存");
      utils.schedule.reminder.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // 提醒设置本地状态
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
  const isAdmin = user?.role === "admin";

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

        {s?.bound ? (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">学号</span>
              <span className="tnum">{s.studentId}</span>
            </div>
            {s.realName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">姓名</span>
                <span>{s.realName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">上次同步</span>
              <span className="tnum">
                {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("zh-CN") : "从未"}
              </span>
            </div>
            {s.lastError && (
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
                  if (confirm("解绑会删除已同步的课表，确定？")) unbind.mutate();
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                解绑
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              输入教务系统（lxjw.lixin.edu.cn）账号密码，登录验证通过后自动抓取课表。密码加密存储，仅用于课表同步。
            </p>
            <div className="space-y-2">
              <Label htmlFor="sid">学号</Label>
              <Input
                id="sid"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="学号"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd">统一身份认证密码</Label>
              <Input
                id="pwd"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                autoComplete="current-password"
              />
            </div>
            <Button
              className="w-full"
              disabled={bind.isPending || !studentId || !password}
              onClick={() => bind.mutate({ studentId, password })}
            >
              {bind.isPending ? "正在登录教务系统…" : "绑定并同步课表"}
            </Button>
          </div>
        )}
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

      {isAdmin && <AdminPanel mailConfigured={!!mailConfig.data?.user} />}

      {/* 同步日志（调试用） */}
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

      <Button variant="ghost" className="w-full text-muted-foreground" onClick={logout}>
        <LogOut className="mr-1 h-4 w-4" />
        退出登录（{user?.name ?? "Kimi 用户"}）
      </Button>
    </div>
  );
}

function AdminPanel({ mailConfigured }: { mailConfigured: boolean }) {
  const utils = trpc.useUtils();
  const config = trpc.schedule.config.useQuery();
  const mailConfig = trpc.schedule.mailConfig.useQuery();
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
      <p className="mb-3 text-xs text-muted-foreground">全站学期与发信设置</p>
      <div className="space-y-3">
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
            placeholder="08:20,09:15,..."
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
