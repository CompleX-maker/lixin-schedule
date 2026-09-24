import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  HandCoins,
  Plus,
  Trash2,
  Clock,
  MapPin,
  UserCheck,
  Users,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * 作息表（与 src/lib/campus-timetable.ts 保持一致，用于前端即时换算）
 * ------------------------------------------------------------------ */

const SJ_A = [
  "08:30", "09:20", "10:20", "11:10", "12:55",
  "13:45", "14:40", "15:30", "16:45", "17:35",
  "18:30", "19:20", "20:10",
];
const SJ_B = [
  "08:30", "09:20", "10:30", "11:20", "12:55",
  "13:45", "14:40", "15:30", "16:45", "17:35",
  "18:30", "19:20", "20:10",
];
const PD_A = SJ_A;
const PD_B = SJ_B;

const SJ_A_BUILDINGS = ["学验楼", "育才楼", "体育馆"];
const SJ_B_BUILDINGS = ["吉祥楼", "北碚楼", "徐汇楼", "云间楼"];
const PD_A_BUILDINGS = ["六教", "浦东体育馆", "气膜馆", "健身房", "形体房", "体操房", "击剑房", "瑜伽房", "乒乓球"];
const PD_B_BUILDINGS = ["二教", "五教", "实验中心", "学生活动中心"];

const CODED_MAP: Record<string, string> = {
  "2": "学验楼", "3": "育才楼", "4": "吉祥楼",
  "5": "北碚楼", "6": "徐汇楼", "7": "云间楼",
};

function resolveTimes(location: string): { times: string[]; campus: string; label: string } {
  const l = location.trim();
  const has = (arr: string[]) => arr.some((b) => l.includes(b));

  if (has(PD_A_BUILDINGS)) return { times: PD_A, campus: "浦东", label: "浦东 · 六教 / 体育馆" };
  if (has(PD_B_BUILDINGS)) return { times: PD_B, campus: "浦东", label: "浦东 · 二教 / 五教 / 实验中心" };
  if (has(SJ_A_BUILDINGS)) return { times: SJ_A, campus: "松江", label: "松江 · 学验楼 / 育才楼 / 体育馆" };
  if (has(SJ_B_BUILDINGS)) return { times: SJ_B, campus: "松江", label: "松江 · 吉祥楼 / 北碚楼 / 徐汇楼 / 云间楼" };

  const m = /^(\d)\s*(?:D)?\s*([A-Z])/i.exec(l);
  if (m) {
    const b = CODED_MAP[m[1]];
    if (b) {
      return SJ_A_BUILDINGS.includes(b)
        ? { times: SJ_A, campus: "松江", label: "松江 · 学验楼 / 育才楼 / 体育馆" }
        : { times: SJ_B, campus: "松江", label: "松江 · 吉祥楼 / 北碚楼 / 徐汇楼 / 云间楼" };
    }
  }
  return { times: SJ_A, campus: "松江", label: "松江 · 学验楼 / 育才楼 / 体育馆" };
}

function toHHMM(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function sectionRange(location: string, start: number, end: number) {
  const { times } = resolveTimes(location);
  const startBase = times[start - 1];
  if (!startBase) return null;
  const endBase = times[end - 1] ?? startBase;
  const [eh, em] = endBase.split(":").map(Number);
  return { start: startBase, end: toHHMM(eh * 60 + em + 45) };
}

const DAY_LABEL = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const STATUS_STYLE: Record<string, { text: string; cls: string }> = {
  open: { text: "招募中", cls: "bg-primary/15 text-primary border-primary/30" },
  taken: { text: "已接单", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  done: { text: "已完成", cls: "bg-muted text-muted-foreground" },
  closed: { text: "已取消", cls: "bg-muted text-muted-foreground line-through" },
};

type Identity = { studentId: string | null; name: string | null } | null;

function IdentityTag({ identity }: { identity?: Identity }) {
  if (!identity) return null;
  const { studentId, name } = identity;
  if (!studentId && !name) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1 py-0 text-[10px] font-medium text-destructive">
      <ShieldAlert className="h-2.5 w-2.5" />
      {name ?? "?"}
      {studentId ? ` · ${studentId}` : ""}
    </span>
  );
}

const relTime = (d: string | Date) => {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(d).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
};

export function SubstitutePanel() {
  const utils = trpc.useUtils();
  const me = trpc.schedule.me.useQuery(undefined, { retry: false });

  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "taken" | "done">("all");
  const list = trpc.schedule.subList.useQuery({ status: statusFilter });

  const [expanded, setExpanded] = useState(false);
  const [openDetail, setOpenDetail] = useState<number | null>(null);

  const defaultNickname = me.data?.realName || me.data?.name || "";
  const [nickTouched, setNickTouched] = useState(false);
  const [form, setForm] = useState({
    nickname: "",
    courseName: "",
    location: "",
    dayOfWeek: 1,
    startSection: 1,
    endSection: 2,
    classDate: "",
    price: 0,
    priceNegotiable: false,
    note: "",
  });
  const effectiveNickname = nickTouched ? form.nickname : defaultNickname;

  // 实时按教学楼作息算出时间
  const preview = useMemo(() => {
    if (!form.location.trim()) return null;
    const r = sectionRange(form.location, form.startSection, form.endSection);
    const { campus, label } = resolveTimes(form.location);
    return r ? { ...r, campus, label } : null;
  }, [form.location, form.startSection, form.endSection]);

  const create = trpc.schedule.subCreate.useMutation({
    onSuccess: async () => {
      toast.success("悬赏已发布～");
      setForm({ ...form, courseName: "", note: "", classDate: "" });
      setExpanded(false);
      await utils.schedule.subList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = trpc.schedule.subDelete.useMutation({
    onSuccess: async () => {
      toast.success("已删除");
      await utils.schedule.subList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [applyNick, setApplyNick] = useState("");
  const [applyNickTouched, setApplyNickTouched] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");
  const [applyTarget, setApplyTarget] = useState<number | null>(null);
  const effectiveApplyNick = applyNickTouched ? applyNick : defaultNickname;

  const apply = trpc.schedule.subApply.useMutation({
    onSuccess: async () => {
      toast.success("已报名，等待发布者挑选～");
      setApplyTarget(null);
      setApplyMsg("");
      await Promise.all([
        utils.schedule.subList.invalidate(),
        utils.schedule.subDetail.invalidate(),
      ]);
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelApply = trpc.schedule.subCancelApply.useMutation({
    onSuccess: async () => {
      toast.success("已取消报名");
      await Promise.all([
        utils.schedule.subList.invalidate(),
        utils.schedule.subDetail.invalidate(),
      ]);
    },
    onError: (e) => toast.error(e.message),
  });

  const accept = trpc.schedule.subAccept.useMutation({
    onSuccess: async () => {
      toast.success("已选定接单者");
      await Promise.all([
        utils.schedule.subList.invalidate(),
        utils.schedule.subDetail.invalidate(),
      ]);
    },
    onError: (e) => toast.error(e.message),
  });

  const all = list.data?.list ?? [];
  const isAdmin = !!list.data?.isAdmin;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold">
            <HandCoins className="h-4 w-4" />
            代课悬赏
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            课程时间与价格自定义 · 招募中 {list.data?.openCount ?? 0} 单
          </p>
        </div>
        <Button
          size="sm"
          variant={expanded ? "outline" : "default"}
          className="h-7 px-2 text-xs"
          onClick={() => {
            setExpanded(!expanded);
            setNickTouched(false);
          }}
        >
          <Plus className="mr-1 h-3 w-3" />
          {expanded ? "收起" : "发布悬赏"}
        </Button>
      </div>

      {/* 发布表单 */}
      {expanded && (
        <div className="mb-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex gap-2">
            <Input
              value={effectiveNickname}
              onChange={(e) => {
                setNickTouched(true);
                setForm({ ...form, nickname: e.target.value });
              }}
              placeholder="昵称"
              maxLength={32}
              className="h-8 flex-1 text-xs"
            />
          </div>

          <Input
            value={form.courseName}
            onChange={(e) => setForm({ ...form, courseName: e.target.value })}
            placeholder="课程名称，如：高等数学"
            maxLength={128}
            className="h-8 text-xs"
          />

          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="上课地点（填教室，如 六教202 / 3DM52 / 二教413）"
            maxLength={64}
            className="h-8 text-xs"
          />

          {/* 校区/作息自动识别提示 */}
          {preview && (
            <p className="rounded bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
              识别为 <span className="font-medium text-foreground">{preview.label}</span>
              {preview.campus ? `（${preview.campus}校区）` : ""}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">星期</label>
              <Select
                value={String(form.dayOfWeek)}
                onValueChange={(v) => setForm({ ...form, dayOfWeek: Number(v) })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <SelectItem key={d} value={String(d)} className="text-xs">
                      {DAY_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">起始节</label>
              <Select
                value={String(form.startSection)}
                onValueChange={(v) => {
                  const s = Number(v);
                  setForm({
                    ...form,
                    startSection: s,
                    endSection: Math.max(s, form.endSection),
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 13 }, (_, i) => i + 1).map((s) => (
                    <SelectItem key={s} value={String(s)} className="text-xs">
                      第 {s} 节
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">结束节</label>
              <Select
                value={String(form.endSection)}
                onValueChange={(v) => setForm({ ...form, endSection: Number(v) })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 13 }, (_, i) => i + 1)
                    .filter((s) => s >= form.startSection)
                    .map((s) => (
                      <SelectItem key={s} value={String(s)} className="text-xs">
                        第 {s} 节
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 时间预览 */}
          {preview && (
            <p className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[11px] text-primary">
              <Clock className="h-3 w-3" />
              {DAY_LABEL[form.dayOfWeek]} 第 {form.startSection}-{form.endSection} 节 ·
              <span className="tnum font-medium">
                {preview.start}-{preview.end}
              </span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                悬赏价格（元）
              </label>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })}
                placeholder="0"
                className="h-8 text-xs"
                disabled={form.priceNegotiable}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                具体日期（可选）
              </label>
              <Input
                type="date"
                value={form.classDate}
                onChange={(e) => setForm({ ...form, classDate: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={form.priceNegotiable}
              onChange={(e) => setForm({ ...form, priceNegotiable: e.target.checked })}
              className="h-3 w-3"
            />
            价格面议
          </label>

          <Textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="补充说明：是否点名、作业要求、联系方式提示等（选填）"
            rows={2}
            maxLength={500}
            className="resize-none text-xs"
          />

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              代课有风险，请自行判断；平台仅提供信息发布
            </span>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={
                create.isPending ||
                !form.courseName.trim() ||
                !form.location.trim() ||
                !effectiveNickname.trim()
              }
              onClick={() =>
                create.mutate({
                  nickname: effectiveNickname.trim(),
                  courseName: form.courseName.trim(),
                  location: form.location.trim(),
                  dayOfWeek: form.dayOfWeek,
                  startSection: form.startSection,
                  endSection: form.endSection,
                  classDate: form.classDate || null,
                  price: form.priceNegotiable ? 0 : form.price,
                  priceNegotiable: form.priceNegotiable,
                  note: form.note.trim() || null,
                })
              }
            >
              {create.isPending ? "发布中…" : "发布悬赏"}
            </Button>
          </div>
        </div>
      )}

      {/* 状态筛选 */}
      <div className="mb-2 flex gap-1.5">
        {(["all", "open", "taken", "done"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "secondary" : "ghost"}
            className="h-6 px-2 text-[11px]"
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "全部" : STATUS_STYLE[s].text}
          </Button>
        ))}
      </div>

      {/* 列表 */}
      {list.isLoading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">加载中…</p>
      ) : all.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          还没有悬赏单，点右上角发布一个吧～
        </p>
      ) : (
        <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
          {all.map((p) => {
            const st = STATUS_STYLE[p.status];
            const isOpen = openDetail === p.id;
            return (
              <li key={p.id} className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{p.courseName}</span>
                  <Badge
                    variant="outline"
                    className={`shrink-0 px-1 py-0 text-[10px] ${st.cls}`}
                  >
                    {st.text}
                  </Badge>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {relTime(p.createdAt)}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span className="tnum">
                      {DAY_LABEL[p.dayOfWeek]} 第 {p.startSection}-{p.endSection} 节{" "}
                      {p.startTime}-{p.endTime}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {p.location}
                    <span className="text-[10px]">（{p.campus}）</span>
                  </span>
                  {p.classDate && <span className="tnum">{p.classDate}</span>}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold text-primary">
                    {p.priceNegotiable ? "价格面议" : `¥${p.price}`}
                  </span>
                  <span className="truncate text-muted-foreground">
                    发布者 {p.nickname}
                  </span>
                  <IdentityTag identity={p.identity} />
                  {p.takerNickname && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <UserCheck className="h-3 w-3" />
                      接单 {p.takerNickname}
                    </span>
                  )}
                  {p.takerIdentity && <IdentityTag identity={p.takerIdentity} />}
                </div>

                {p.note && (
                  <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                    {p.note}
                  </p>
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    className="flex items-center gap-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setOpenDetail(isOpen ? null : p.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <Users className="h-3 w-3" />
                    报名 {p.applyCount}
                    {p.isMine && " · 我发布的"}
                  </button>

                  {/* 接单入口：自己发的单不显示；已报名显示可取消；其余显示「我接单」 */}
                  {!p.isMine &&
                    (p.myApplyStatus ? (
                      <button
                        className="flex items-center gap-1 text-[11px] text-primary disabled:opacity-50"
                        disabled={cancelApply.isPending}
                        onClick={() => cancelApply.mutate({ postId: p.id })}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        已报名（点击取消）
                      </button>
                    ) : p.status === "open" ? (
                      me.data ? (
                        <button
                          className="flex items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                          onClick={() => {
                            setApplyTarget(applyTarget === p.id ? null : p.id);
                            setApplyNickTouched(false);
                          }}
                        >
                          <HandCoins className="h-3 w-3" />
                          我接单
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          登录后可接单
                        </span>
                      )
                    ) : null)}

                  {(p.isMine || isAdmin) && (
                    <button
                      className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                      disabled={del.isPending}
                      onClick={() => del.mutate({ postId: p.id })}
                    >
                      <Trash2 className="h-3 w-3" />
                      删除
                    </button>
                  )}
                </div>

                {/* 报名输入 */}
                {applyTarget === p.id && (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2">
                    <Input
                      value={effectiveApplyNick}
                      onChange={(e) => {
                        setApplyNickTouched(true);
                        setApplyNick(e.target.value);
                      }}
                      placeholder="昵称"
                      maxLength={32}
                      className="h-7 text-[11px]"
                    />
                    <Textarea
                      value={applyMsg}
                      onChange={(e) => setApplyMsg(e.target.value)}
                      placeholder="说一句：什么时候有空、能不能胜任…（选填）"
                      rows={2}
                      maxLength={200}
                      className="resize-none text-[11px]"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setApplyTarget(null)}
                      >
                        取消
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        disabled={apply.isPending || !effectiveApplyNick.trim()}
                        onClick={() =>
                          apply.mutate({
                            postId: p.id,
                            nickname: effectiveApplyNick.trim(),
                            message: applyMsg.trim() || null,
                          })
                        }
                      >
                        {apply.isPending ? "提交中…" : "确认接单"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* 详情：报名列表 */}
                {isOpen && (
                  <SubDetail
                    postId={p.id}
                    onAccept={(id) => accept.mutate({ postId: p.id, applicationId: id })}
                    accepting={accept.isPending}
                    myApplyStatus={p.myApplyStatus}
                    canApply={!p.isMine && !!me.data && p.status === "open" && !p.myApplyStatus}
                    onApply={() => {
                      setApplyTarget(p.id);
                      setApplyNickTouched(false);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!me.data && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          登录后才能发布悬赏和接单
        </p>
      )}
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        本板块仅提供信息发布，不参与交易与担保，请双方自行核实
      </p>
    </section>
  );
}

/** 单条悬赏的报名详情 */
type Applicant = {
  id: number;
  userId: number;
  nickname: string;
  message: string | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: string | Date;
  isMine: boolean;
  identity: Identity;
};

function SubDetail({
  postId,
  onAccept,
  accepting,
  onApply,
  myApplyStatus,
  canApply,
}: {
  postId: number;
  onAccept: (applicationId: number) => void;
  accepting: boolean;
  onApply: () => void;
  myApplyStatus: string | null;
  canApply: boolean;
}) {
  const detail = trpc.schedule.subDetail.useQuery({ id: postId });

  if (detail.isLoading)
    return <p className="mt-2 text-[11px] text-muted-foreground">加载报名中…</p>;
  if (!detail.data) return null;

  const iAmApplied = detail.data.applications.some(
    (a) => a.isMine && a.status !== "rejected",
  );

  if (detail.data.applicantsHidden) {
    return (
      <p className="mt-2 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
        报名名单仅发布者与管理员可见
      </p>
    );
  }

  if (iAmApplied && !detail.data.isMine) {
    return (
      <p className="mt-2 rounded bg-primary/10 px-2 py-1.5 text-[11px] text-primary">
        你已报名，等待发布者挑选（状态：{myApplyStatus === "accepted" ? "已选中" : "待挑选"}）
      </p>
    );
  }

  if (detail.data.applications.length === 0) {
    return (
      <div className="mt-2 flex items-center justify-between rounded bg-muted px-2 py-1.5">
        <span className="text-[11px] text-muted-foreground">还没有人报名</span>
        {canApply && (
          <button
            className="flex items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
            onClick={onApply}
          >
            <HandCoins className="h-3 w-3" />
            我接单
          </button>
        )}
      </div>
    );
  }

  const canPick = detail.data.isMine && detail.data.status === "open";

  return (
    <ul className="mt-2 space-y-1.5 border-l-2 border-muted pl-2.5">
      {(detail.data.applications as Applicant[]).map((a) => (
        <li key={a.id} className="rounded bg-muted/40 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[11px] font-medium">{a.nickname}</span>
            <IdentityTag identity={a.identity} />
            {a.status === "accepted" && (
              <Badge
                variant="outline"
                className="shrink-0 border-emerald-500/30 bg-emerald-500/15 px-1 py-0 text-[10px] text-emerald-600"
              >
                已选中
              </Badge>
            )}
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {relTime(a.createdAt)}
            </span>
          </div>
          {a.message && (
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed">{a.message}</p>
          )}
          {canPick && a.status === "pending" && (
            <button
              className="mt-1 text-[10px] text-primary hover:underline disabled:opacity-50"
              disabled={accepting}
              onClick={() => onAccept(a.id)}
            >
              选 TA 接单
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
