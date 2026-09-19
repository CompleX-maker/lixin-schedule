import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";

const DISMISS_KEY = "dismissedAnnouncementId";

/** 全站通知弹窗：有新的生效通知时弹出，关闭后同一条不再打扰；到期自动消失 */
export function AnnouncementPopup() {
  const q = trpc.announcement.active.useQuery(undefined, {
    refetchInterval: 60_000, // 每分钟看一眼有没有新通知
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
      <DialogContent className="max-w-sm">
        {ann && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="h-4.5 w-4.5 text-primary" />
                {ann.title}
              </DialogTitle>
            </DialogHeader>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{ann.content}</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="tnum">
                发布于 {new Date(ann.createdAt).toLocaleString("zh-CN")}
              </div>
              {ann.expiresAt && (
                <div className="tnum">
                  将于 {new Date(ann.expiresAt).toLocaleString("zh-CN")} 自动关闭
                </div>
              )}
            </div>
            <Button className="w-full" onClick={dismiss}>
              我知道了
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
