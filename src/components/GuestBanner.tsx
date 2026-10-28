import { Button } from "@/components/ui/button";
import { Eye, LogIn, ArrowLeft } from "lucide-react";

/**
 * 游客预览横幅
 *
 * 用户是从登录页主动点「先看看效果」进来的，所以这里的重点是：
 *   1. 明确告知「这是示例数据」
 *   2. 提供显眼的登录入口
 *   3. 提供「返回登录页」出口，避免用户困在预览里不知道怎么回去
 */
export function GuestBanner({
  onLogin,
  onBack,
}: {
  onLogin: () => void;
  /** 返回登录页 */
  onBack?: () => void;
}) {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
      <div className="mx-auto flex max-w-lg items-center gap-2.5">
        <Eye className="h-4 w-4 shrink-0 text-amber-600" />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
            预览模式 · 示例数据
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            登录后会同步你自己的真实课表
          </p>
        </div>

        {onBack && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={onBack}
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            返回
          </Button>
        )}

        <Button size="sm" className="h-7 shrink-0 px-2.5 text-xs" onClick={onLogin}>
          <LogIn className="mr-1 h-3 w-3" />
          登录
        </Button>
      </div>
    </div>
  );
}

/**
 * 游客在写操作处看到的提示
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
