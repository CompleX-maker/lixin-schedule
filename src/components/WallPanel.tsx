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
import { MessageSquarePlus, ThumbsUp, Trash2, MessagesSquare } from "lucide-react";

const CATEGORIES = ["需求", "建议", "吐槽", "其他"] as const;

const CATEGORY_STYLE: Record<string, string> = {
  需求: "bg-primary/15 text-primary border-primary/30",
  建议: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  吐槽: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  其他: "bg-muted text-muted-foreground",
};

/** 留言墙：公开的需求 / 建议 / 吐槽，帮助了解大家想要什么 */
export function WallPanel() {
  const utils = trpc.useUtils();
  const me = trpc.schedule.me.useQuery(undefined, { retry: false });
  const list = trpc.schedule.wallList.useQuery();

  const [scope, setScope] = useState<"all" | "mine">("all");
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    nickname: "",
    content: "",
    category: "需求" as (typeof CATEGORIES)[number],
  });

  // 默认昵称取当前用户姓名
  const defaultNickname = me.data?.realName || me.data?.name || "";
  // 注意：用 ?? 而非 ||，否则用户清空昵称后会被默认值自动回填（删不掉）
  const [nicknameTouched, setNicknameTouched] = useState(false);
  const effectiveNickname = nicknameTouched ? form.nickname : defaultNickname;

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

  const all = list.data?.list ?? [];
  const shown = scope === "mine" ? all.filter((m) => m.isMine) : all;

  const fmt = (d: string | Date) =>
    new Date(d).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

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
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {shown.map((m) => (
            <li key={m.id} className="rounded-lg border px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium">{m.nickname}</span>
                <Badge
                  variant="outline"
                  className={`shrink-0 px-1 py-0 text-[10px] ${CATEGORY_STYLE[m.category] ?? ""}`}
                >
                  {m.category}
                </Badge>
                <span className="tnum ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {fmt(m.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed">{m.content}</p>
              <div className="mt-1.5 flex items-center gap-2">
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
                {(m.isMine || me.data?.role === "admin") && (
                  <button
                    className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                    disabled={del.isPending}
                    onClick={() => del.mutate({ id: m.id })}
                  >
                    <Trash2 className="h-3 w-3" />
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!me.data && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          登录后才能留言和点赞
        </p>
      )}
    </section>
  );
}
