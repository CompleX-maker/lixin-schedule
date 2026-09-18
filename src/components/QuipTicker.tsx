import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QUIPS } from "@/lib/quips";

const INTERVAL = 5000;

/** dock 栏上方悬浮的段子药丸：每 5 秒一条，上滑淡入切换 */
export function QuipTicker() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUIPS.length));

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % QUIPS.length), INTERVAL);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pointer-events-none flex justify-center px-6 pb-2.5">
      <div className="flex h-9 max-w-full items-center overflow-hidden rounded-full border border-border/70 bg-card/90 px-4 shadow-sm backdrop-blur">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="truncate text-[13px] text-muted-foreground"
          >
            {QUIPS[idx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
