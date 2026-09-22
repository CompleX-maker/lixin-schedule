import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QUIPS } from "@/lib/quips";

/**
 * 戳一戳：登录页的 Q 版形象（八千代）。
 * 点一下换一句话（立信相关文段 / 自嘲 / 吐槽），带按压反馈动画。
 * 素材：/static/yachiyo.gif（240x240，透明背景，49 帧）
 */

/** 戳一戳专属文案：比底部轮播更"互动"一些，回应式口吻 */
const POKE_LINES: string[] = [
  "戳我干嘛，我又不会帮你写作业",
  "别戳了别戳了，课表就在下面等着你呢",
  "同学，你是来查课表的还是来玩我的",
  "教务系统今天心情如何？看运气",
  "潘校长说过：民无信不立。我说：民无课不立",
  "早八人你好，早八人再见",
  "会计人，会计魂，借贷平衡是人生",
  "立信不是银行，真的不是银行",
  "二教五楼的同学，你的腿还好吗",
  "如果卡住了，那是教务处在打盹",
  ...QUIPS,
];

interface Props {
  /** 外部可传入文案（例如登录失败时显示提示） */
  initialLine?: string;
  /** 紧凑模式：用于内嵌面板（如「广场」标签页） */
  compact?: boolean;
}

export function PokeBuddy({ initialLine, compact = false }: Props) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * POKE_LINES.length));
  const [poking, setPoking] = useState(false);
  const [custom, setCustom] = useState<string | null>(initialLine ?? null);

  // 外部文案变化时优先展示
  useEffect(() => {
    if (initialLine) setCustom(initialLine);
  }, [initialLine]);

  const poke = useCallback(() => {
    setPoking(true);
    setCustom(null);
    setIdx((i) => {
      // 避免连续重复同一条
      let next = i;
      while (next === i && POKE_LINES.length > 1) {
        next = Math.floor(Math.random() * POKE_LINES.length);
      }
      return next;
    });
    setTimeout(() => setPoking(false), 360);
  }, []);

  const line = custom ?? POKE_LINES[idx];

  return (
    <div className={`flex flex-col items-center ${compact ? "mt-2" : "mt-8"}`}>
      {/* 气泡 */}
      <div className="relative mb-1 w-full max-w-[17rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={line}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="rounded-2xl border bg-card px-3.5 py-2.5 text-center text-xs leading-relaxed text-foreground shadow-sm"
          >
            {line}
          </motion.div>
        </AnimatePresence>
        {/* 气泡小尾巴 */}
        <div className="mx-auto h-2 w-2 -translate-y-1 rotate-45 border-b border-r bg-card" />
      </div>

      {/* Q 版形象：八千代 GIF（透明背景） */}
      <motion.button
        type="button"
        onClick={poke}
        aria-label="戳一戳"
        animate={
          poking
            ? { scale: [1, 1.16, 0.95, 1], rotate: [0, -6, 6, 0] }
            : { scale: 1, rotate: 0 }
        }
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 420, damping: 18 }}
        className="select-none"
      >
        <img
          src="/static/yachiyo.gif"
          alt="戳一戳"
          width={110}
          height={110}
          className={`${compact ? "h-[96px] w-[96px]" : "h-[110px] w-[110px]"} object-contain drop-shadow-sm`}
          draggable={false}
        />
      </motion.button>
      <p className="-mt-1 text-[11px] text-muted-foreground">戳一戳我</p>
    </div>
  );
}
