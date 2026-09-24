import { useState } from "react";
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
import { useIsAdmin } from "@/components/AdminPreviewToggle";
import {
  MessageSquarePlus,
  ThumbsUp,
  Trash2,
  MessagesSquare,
  Reply,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";

const CATEGORIES = ["需求", "建议", "吐槽", "其他"] as const;

const CATEGORY_STYLE: Record<string, string> = {
  需求: "bg-primary/15 text-primary border-primary/30",
  建议: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  吐槽: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  其他: "bg-muted text-muted-foreground",
};

type Identity = { studentId: string | null; name: string | null } | null;

/** 管理员可见的真实身份徽标；普通用户渲染为空 */
function IdentityTag({ identity }: { identity?: Identity }) {
  if (!identity) return null;
  const { studentId, name } = identity;
  if (!studentId && !name) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1 py-0 text-[10px] font-medium text-destructive"
      title="仅管理员可见的真实身份"
    >
      <ShieldAlert className="h-2.5 w-2.5" />
      {name ?? "?"}
      {studentId ? ` · ${studentId}` : ""}
    </span>
  );
}

/** 相对时间：刚刚 / N分钟前 / N小时前 / 日期 */
function relTime(d: string | Date) {
  const t = new Date(d).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(d).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 留言墙：公开的需求 / 建议 / 吐槽，支持回复 */
export function WallPanel() {
  const utils = trpc.useUtils();
  const me = trpc.schedule.me.useQuery(undefined, { retry: false });
  // 轮询：让别人的新留言/回复能自动出现（页面不可见时 react-query 会自动暂停）
  const list = trpc.schedule.wallList.useQuery(undefined, {
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  const [scope, setScope] = useState<"all" | "mine">("all");
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    nickname: "",
    content: "",
    category: "需求" as (typeof CATEGORIES)[number],
  });

  // 回复框状态：记录正在回复哪条留言、以及是否在回复某条回复
  const [replyTarget, setReplyTarget] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; nickname: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // 默认昵称取当前用户姓名
  const defaultNickname = me.data?.realName || me.data?.name || "";
  // 注意：用 ?? 而非 ||，否则用户清空昵称后会被默认值自动回填（删不掉）
  const [nicknameTouched, setNicknameTouched] = useState(false);
  const effectiveNickname = nicknameTouched ? form.nickname : defaultNickname;

  // 回复框昵称，独立维护一份，避免与主表单互相干扰
  const [replyNickname, setReplyNickname] = useState("");
  const [replyNicknameTouched, setReplyNicknameTouched] = useState(false);
  const effectiveReplyNickname = replyNicknameTouched ? replyNickname : defaultNickname;

  const post = trpc.schedule.wallPost.useMutation({
    onSuccess: async () => {
      toast.success("留言已发布～");
      setForm({ ...form, content: "" });
      setExpanded(false);
      await utils.schedule.wallList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleLike = trpc.schedule.wallToggleLike.useMutation({
    onSuccess: () => utils.schedule.wallList.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const del = trpc.schedule.wallDelete.useMutation({
    onSuccess: async () => {
      toast.success("已删除");
      await utils.schedule.wallList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reply = trpc.schedule.wallReply.useMutation({
    onSuccess: async () => {
      toast.success("回复已发出～");
      setReplyText("");
      setReplyTarget(null);
      setReplyTo(null);
      await utils.schedule.wallList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const delReply = trpc.schedule.wallReplyDelete.useMutation({
    onSuccess: async () => {
      toast.success("已删除");
      await utils.schedule.wallList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const all = list.data?.list ?? [];
  const shown = scope === "mine" ? all.filter((m) => m.isMine) : all;
  const { isAdmin: realIsAdmin } = useIsAdmin();
  const isAdmin = !!list.data?.isAdmin && realIsAdmin;

  const openReply = (messageId: number, to?: { id: number; nickname: string }) => {
    setReplyTarget(messageId);
    setReplyTo(to ?? null);
    setReplyText("");
    setReplyNicknameTouched(false);
    setReplyNickname("");
  };

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  type Msg = (typeof all)[number];
  type Rep = Msg["replies"][number];

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold">
            <MessagesSquare className="h-4 w-4" />
            留言墙
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            想要什么功能？哪里不好用？说一声 · 共 {list.data?.total ?? 0} 条
          </p>
        </div>
        <Button
          size="sm"
          variant={expanded ? "outline" : "default"}
          className="h-7 px-2 text-xs"
          onClick={() => {
            setExpanded(!expanded);
            // 展开时重置"已修改"标记，让默认昵称生效（用户可自行清空）
            setNicknameTouched(false);
          }}
        >
          <MessageSquarePlus className="mr-1 h-3 w-3" />
          {expanded ? "收起" : "写留言"}
        </Button>
      </div>

      {/* 发布区 */}
      {expanded && (
        <div className="mb-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex gap-2">
            <Input
              value={effectiveNickname}
              onChange={(e) => {
                setNicknameTouched(true);
                setForm({ ...form, nickname: e.target.value });
              }}
              placeholder="昵称"
              maxLength={32}
              className="h-8 flex-1 text-xs"
            />
            <Select
              value={form.category}
              onValueChange={(v) =>
                setForm({ ...form, category: v as (typeof CATEGORIES)[number] })
              }
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="例如：希望能导出课表到日历 / 提醒能不能提前 30 分钟 / 手机端字号有点小…"
            rows={3}
            maxLength={500}
            className="resize-none text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="tnum text-[11px] text-muted-foreground">
              {form.content.length}/500
            </span>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={post.isPending || !form.content.trim() || !effectiveNickname.trim()}
              onClick={() =>
                post.mutate({
                  nickname: effectiveNickname.trim(),
                  content: form.content.trim(),
                  category: form.category,
                })
              }
            >
              {post.isPending ? "发布中…" : "发布"}
            </Button>
          </div>
        </div>
      )}

      {/* 筛选 */}
      <div className="mb-2 flex gap-1.5">
        <Button
          size="sm"
          variant={scope === "all" ? "secondary" : "ghost"}
          className="h-6 px-2 text-[11px]"
          onClick={() => setScope("all")}
        >
          全部 ({all.length})
        </Button>
        <Button
          size="sm"
          variant={scope === "mine" ? "secondary" : "ghost"}
          className="h-6 px-2 text-[11px]"
          onClick={() => setScope("mine")}
        >
          我的 ({all.filter((m) => m.isMine).length})
        </Button>
      </div>

      {/* 列表 */}
      {list.isLoading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">加载中…</p>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {scope === "mine" ? "你还没留过言" : "还没有人留言，来做第一个吧～"}
        </p>
      ) : (
        <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
          {shown.map((m) => {
            const replies: Rep[] = m.replies ?? [];
            const isCollapsed = collapsed.has(m.id);
            return (
              <li key={m.id} className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{m.nickname}</span>
                  <IdentityTag identity={m.identity} />
                  <Badge
                    variant="outline"
                    className={`shrink-0 px-1 py-0 text-[10px] ${CATEGORY_STYLE[m.category] ?? ""}`}
                  >
                    {m.category}
                  </Badge>
                  <span
                    className="tnum ml-auto shrink-0 text-[10px] text-muted-foreground"
                    title={fmt(m.createdAt)}
                  >
                    {relTime(m.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{m.content}</p>

                {/* 操作条 */}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    className={`flex items-center gap-1 text-[11px] transition-colors ${
                      m.liked ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                    disabled={!me.data || toggleLike.isPending}
                    onClick={() => toggleLike.mutate({ id: m.id })}
                  >
                    <ThumbsUp className={`h-3 w-3 ${m.liked ? "fill-current" : ""}`} />
                    <span className="tnum">{m.likeCount}</span>
                  </button>

                  <button
                    className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    disabled={!me.data}
                    onClick={() =>
                      replyTarget === m.id ? setReplyTarget(null) : openReply(m.id)
                    }
                  >
                    <Reply className="h-3 w-3" />
                    回复
                    {replies.length > 0 && <span className="tnum">({replies.length})</span>}
                  </button>

                  {replies.length > 0 && (
                    <button
                      className="flex items-center gap-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => toggleCollapse(m.id)}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      {isCollapsed ? "展开回复" : "收起回复"}
                    </button>
                  )}

                  {(m.isMine || isAdmin) && (
                    <button
                      className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                      disabled={del.isPending}
                      onClick={() => del.mutate({ id: m.id })}
                    >
                      <Trash2 className="h-3 w-3" />
                      删除
                    </button>
                  )}
                </div>

                {/* 回复列表 */}
                {replies.length > 0 && !isCollapsed && (
                  <ul className="mt-2 space-y-1.5 border-l-2 border-muted pl-2.5">
                    {replies.map((r) => (
                      <li key={r.id} className="rounded bg-muted/40 px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[11px] font-medium">{r.nickname}</span>
                          <IdentityTag identity={r.identity} />
                          {r.replyToNickname && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              回复 @{r.replyToNickname}
                            </span>
                          )}
                          <span
                            className="tnum ml-auto shrink-0 text-[10px] text-muted-foreground"
                            title={fmt(r.createdAt)}
                          >
                            {relTime(r.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed">
                          {r.content}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            className="text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            disabled={!me.data}
                            onClick={() =>
                              openReply(m.id, { id: r.id, nickname: r.nickname })
                            }
                          >
                            回复
                          </button>
                          {(r.isMine || isAdmin) && (
                            <button
                              className="text-[10px] text-muted-foreground transition-colors hover:text-destructive"
                              disabled={delReply.isPending}
                              onClick={() => delReply.mutate({ id: r.id })}
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* 回复输入框 */}
                {replyTarget === m.id && me.data && (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 p-2">
                    {replyTo && (
                      <p className="text-[10px] text-muted-foreground">
                        正在回复 <span className="font-medium">@{replyTo.nickname}</span>
                        <button
                          className="ml-1 underline hover:text-foreground"
                          onClick={() => setReplyTo(null)}
                        >
                          取消
                        </button>
                      </p>
                    )}
                    <Input
                      value={effectiveReplyNickname}
                      onChange={(e) => {
                        setReplyNicknameTouched(true);
                        setReplyNickname(e.target.value);
                      }}
                      placeholder="昵称"
                      maxLength={32}
                      className="h-7 text-[11px]"
                    />
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="友善一点，别吵架～"
                      rows={2}
                      maxLength={500}
                      className="resize-none text-[11px]"
                    />
                    <div className="flex items-center justify-between">
                      <span className="tnum text-[10px] text-muted-foreground">
                        {replyText.length}/500
                      </span>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            setReplyTarget(null);
                            setReplyTo(null);
                          }}
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          disabled={
                            reply.isPending ||
                            !replyText.trim() ||
                            !effectiveReplyNickname.trim()
                          }
                          onClick={() =>
                            reply.mutate({
                              messageId: m.id,
                              nickname: effectiveReplyNickname.trim(),
                              content: replyText.trim(),
                              replyToId: replyTo?.id ?? null,
                            })
                          }
                        >
                          {reply.isPending ? "发送中…" : "发送"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!me.data && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          登录后才能留言、回复和点赞
        </p>
      )}
      {isAdmin && (
        <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-destructive">
          <ShieldAlert className="h-3 w-3" />
          管理员视角：已显示留言者的真实姓名与学号
        </p>
      )}
    </section>
  );
}
