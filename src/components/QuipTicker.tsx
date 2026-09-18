import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QUIPS } from "@/lib/quips";

const INTERVAL = 5000;

/** dock 栏上方的段子轮播条：每 5 秒一条，上滑淡入切换 */
export function QuipTicker() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUIPS.length));

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % QUIPS.length), INTERVAL);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-7 items-center justify-center overflow-hidden border-b border-border/60">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="truncate px-6 text-[11px] text-muted-foreground/80"
        >
          {QUIPS[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
