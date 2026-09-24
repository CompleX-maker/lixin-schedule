import { Button } from "@/components/ui/button";
import { Eye, LogIn } from "lucide-react";

/**
 * 游客模式横幅
 *
 * 未登录用户浏览演示课表时，顶部常驻这条提示，
 * 一是说明当前是示例数据，二是提供醒目（但不打扰）的登录入口。
 */
export function GuestBanner({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
      <div className="mx-auto flex max-w-lg items-center gap-2.5">
        <Eye className="h-4 w-4 shrink-0 text-amber-600" />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
            预览模式
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            下面是示例课表，登录后会同步你自己的真实课程
          </p>
        </div>

        <Button
          size="sm"
          className="h-7 shrink-0 px-2.5 text-xs"
          onClick={onLogin}
        >
          <LogIn className="mr-1 h-3 w-3" />
          登录
        </Button>
      </div>
    </div>
  );
}

/**
 * 游客在写操作处看到的提示
 *
 * 用于留言墙 / 代课悬赏等只读区块的底部。
 */
export function GuestReadonlyHint({ onLogin }: { onLogin: () => void }) {
  return (
    <p className="mt-2 text-center text-[11px] text-muted-foreground">
      预览模式下只能查看，
      <button
        onClick={onLogin}
        className="mx-0.5 font-medium text-primary underline"
      >
        登录
      </button>
      后可以发言和接单
    </p>
  );
}
