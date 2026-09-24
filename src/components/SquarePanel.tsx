import { useState } from "react";
import { PokeBuddy } from "@/components/PokeBuddy";
import { WallPanel } from "@/components/WallPanel";
import { SubstitutePanel } from "@/components/SubstitutePanel";
import { MessagesSquare, HandCoins } from "lucide-react";

/**
 * 广场：互动区
 *  - 最上：戳一戳（Q 版形象 + 立信文段）
 *  - 下方分两个板块：留言墙 / 代课悬赏（各自独立划分，互不混排）
 */
export function SquarePanel({
  readonly = false,
  onNeedLogin,
}: {
  /** 游客模式：只读，任何写操作都提示登录 */
  readonly?: boolean;
  onNeedLogin?: () => void;
} = {}) {
  const [board, setBoard] = useState<"wall" | "substitute">("wall");

  return (
    <div className="space-y-4">
      {/* 戳一戳：置顶 */}
      <section className="rounded-xl border bg-card px-4 pb-4 pt-2">
        <PokeBuddy compact />
      </section>

      {/* 板块切换 */}
      <div className="flex gap-1.5 rounded-xl border bg-card p-1.5">
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
            board === "wall"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => setBoard("wall")}
        >
          <MessagesSquare className="h-3.5 w-3.5" />
          留言墙
        </button>
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
            board === "substitute"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => setBoard("substitute")}
        >
          <HandCoins className="h-3.5 w-3.5" />
          代课悬赏
        </button>
      </div>

      {board === "wall" ? (
        <WallPanel readonly={readonly} onNeedLogin={onNeedLogin} />
      ) : (
        <SubstitutePanel readonly={readonly} onNeedLogin={onNeedLogin} />
      )}
    </div>
  );
}
