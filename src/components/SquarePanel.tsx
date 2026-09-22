import { PokeBuddy } from "@/components/PokeBuddy";
import { WallPanel } from "@/components/WallPanel";

/**
 * 广场：互动区
 *  - 最上：戳一戳（Q 版形象 + 立信文段）
 *  - 下方：留言墙（公开的需求 / 建议 / 吐槽）
 */
export function SquarePanel() {
  return (
    <div className="space-y-4">
      {/* 戳一戳：置顶 */}
      <section className="rounded-xl border bg-card px-4 pb-4 pt-2">
        <PokeBuddy compact />
      </section>

      {/* 留言墙 */}
      <WallPanel />
    </div>
  );
}
