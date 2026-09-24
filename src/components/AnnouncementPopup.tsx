import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";

const DISMISS_KEY = "dismissedAnnouncementId";

/**
 * 全站通知弹窗。
 *
 * 布局要点（避免长文案把关闭按钮挤出屏幕）：
 *   - 弹窗整体限高 `max-h-[85vh]`，标题与底部按钮固定，中间正文区独立滚动
 *   - 正文用 `overflow-y-auto` + `min-h-0`（flex 子项必须给 min-h-0 才能正确收缩）
 *   - 内容区留出右侧内边距，避免与右上角关闭按钮重叠
 */
export function AnnouncementPopup() {
  const q = trpc.announcement.active.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const [dismissed, setDismissed] = useState<number | null>(null);
  useEffect(() => {
    const v = localStorage.getItem(DISMISS_KEY);
    if (v) setDismissed(Number(v));
  }, []);

  const ann = q.data;
  const open = !!ann && ann.id !== dismissed;
  const dismiss = () => {
    if (!ann) return;
    localStorage.setItem(DISMISS_KEY, String(ann.id));
    setDismissed(ann.id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="flex max-h-[85vh] max-w-sm flex-col gap-3">
        {ann && (
          <>
            {/* 标题固定：右侧留出关闭按钮的位置 */}
            <DialogHeader className="shrink-0 pr-6">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Megaphone className="h-4 w-4 shrink-0 text-primary" />
                <span className="leading-snug">{ann.title}</span>
              </DialogTitle>
            </DialogHeader>

            {/* 正文：唯一可滚动区域 */}
            <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{ann.content}</p>

              <div className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
                <div className="tnum">
                  发布于 {new Date(ann.createdAt).toLocaleString("zh-CN")}
                </div>
                {ann.expiresAt && (
                  <div className="tnum">
                    将于 {new Date(ann.expiresAt).toLocaleString("zh-CN")} 自动关闭
                  </div>
                )}
              </div>
            </div>

            {/* 底部按钮固定 */}
            <Button className="shrink-0 w-full" onClick={dismiss}>
              我知道了
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
