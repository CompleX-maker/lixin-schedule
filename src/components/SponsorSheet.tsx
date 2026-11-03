import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

/**
 * 赞赏码弹层（彩蛋 / 「我的」页低调入口共用）。
 *
 * 挂到 document.body：本组件的调用方可能位于带动画的 motion.div 内，
 * transform 会生成新的包含块，fixed 与 z-index 都会被关住。
 */
export function SponsorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-xs overflow-hidden rounded-3xl border bg-card shadow-2xl"
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src="/static/sponsor.jpg" alt="赞赏码" className="block w-full" draggable={false} />
            <div className="px-4 pb-4 pt-3 text-center">
              <p className="text-sm font-bold">扫这个就行</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                打赏完全自愿，不解锁任何功能。
                <br />
                你的每一分都用来交服务器的钱。
              </p>
              <button
                className="mt-3 w-full rounded-xl border py-2 text-xs text-muted-foreground"
                onClick={onClose}
              >
                收下，关了
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
