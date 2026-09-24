import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import {
  getInstallVariant,
  initInstallPrompt,
  isDismissed,
  promptInstall,
  dismissInstall,
  subscribeInstall,
} from "@/lib/pwa";
import { toast } from "sonner";

/**
 * 安装到桌面引导条
 *
 * - 安卓/Chrome：显示「安装」按钮，点击唤起系统安装弹窗
 * - iOS Safari：显示「分享 → 添加到主屏幕」图文指引
 * - 已安装 / 已忽略过：不渲染
 */
export function InstallBanner() {
  const [variant, setVariant] = useState(() => getInstallVariant());
  const [dismissed, setDismissed] = useState(() => isDismissed());
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    initInstallPrompt();
    return subscribeInstall(() => setVariant(getInstallVariant()));
  }, []);

  if (dismissed || !variant) return null;

  const handleInstall = async () => {
    const ok = await promptInstall();
    if (ok) toast.success("已添加到桌面～");
  };

  const handleDismiss = () => {
    dismissInstall();
    setDismissed(true);
  };

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Smartphone className="h-4 w-4 text-primary" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">把课表装到桌面</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            像 App 一样一键打开，不用每次翻网址
          </p>

          {variant === "native" ? (
            <Button
              size="sm"
              className="mt-2 h-7 px-3 text-xs"
              onClick={handleInstall}
            >
              <Download className="mr-1 h-3 w-3" />
              安装到桌面
            </Button>
          ) : (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs"
                onClick={() => setShowIosSteps((v) => !v)}
              >
                {showIosSteps ? "收起步骤" : "查看安装步骤"}
              </Button>

              {showIosSteps && (
                <ol className="mt-2 space-y-1.5 rounded-lg bg-background/70 p-2.5 text-[11px] leading-relaxed">
                  <li className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-medium text-primary">
                      1
                    </span>
                    点底部工具栏的
                    <Share className="inline h-3 w-3" />
                    分享按钮
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-medium text-primary">
                      2
                    </span>
                    选择
                    <Plus className="inline h-3 w-3" />
                    「添加到主屏幕」
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-medium text-primary">
                      3
                    </span>
                    右上角点「添加」
                  </li>
                  <li className="pl-5 text-muted-foreground">
                    注意：必须用 <strong>Safari</strong> 打开，微信内置浏览器不支持
                  </li>
                </ol>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="不再提示"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
