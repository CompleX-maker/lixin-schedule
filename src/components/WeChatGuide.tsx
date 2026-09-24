import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreHorizontal, X, ExternalLink } from "lucide-react";
import { isWeChat, isStandalone } from "@/lib/pwa";

const SEEN_KEY = "wechat-guide-seen-at";
const COOLDOWN_HOURS = 12;

/**
 * 微信内置浏览器引导
 *
 * 微信的 WebView 不支持「添加到主屏幕」，也没有 beforeinstallprompt，
 * 用户在微信里永远装不了。而实测本站在微信内的访问占比很高，
 * 所以这里主动提示「用浏览器打开」。
 *
 * 不用遮罩挡住全屏（那样很招人烦），而是做成顶部下滑的轻提示条。
 */
export function WeChatGuide() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isWeChat() || isStandalone()) return;

    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw && Date.now() - Number(raw) < COOLDOWN_HOURS * 3600 * 1000) return;
    } catch {
      /* localStorage 不可用时照常提示 */
    }

    // 稍等一会儿再弹，避免一进页面就打断
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      /* 忽略 */
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-x-0 top-0 z-50 px-3 pt-3"
        >
          <div className="mx-auto flex max-w-lg items-start gap-2.5 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">建议用浏览器打开</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] leading-relaxed text-muted-foreground">
                点右上角
                <MoreHorizontal className="inline h-3 w-3" />
                选择「在浏览器打开」，就能把课表装到桌面，以后不用再翻链接
              </p>
            </div>

            <button
              onClick={close}
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
