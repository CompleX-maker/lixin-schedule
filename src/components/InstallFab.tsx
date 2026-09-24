import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Smartphone, MoreVertical, Share, Plus } from "lucide-react";
import {
  getInstallVariant,
  getPlatform,
  initInstallPrompt,
  isDismissed,
  promptInstall,
  dismissInstall,
  manualSteps,
  subscribeInstall,
  type Platform,
} from "@/lib/pwa";
import { toast } from "sonner";

/**
 * 安装到桌面：悬浮按钮
 *
 * 覆盖所有环境：
 *   - native（Chromium 系）：点击直接唤起系统安装弹窗
 *   - ios / android-manual / desktop-manual：点击展开对应平台的手动步骤
 * 已安装、微信内、或用户忽略后 14 天内不显示。
 */
export function InstallFab() {
  const [variant, setVariant] = useState(() => getInstallVariant());
  const [dismissed, setDismissed] = useState(() => isDismissed());
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>(() => getPlatform());

  useEffect(() => {
    initInstallPrompt();
    setPlatform(getPlatform());
    return subscribeInstall(() => {
      setVariant(getInstallVariant());
      setPlatform(getPlatform());
    });
  }, []);

  if (dismissed || !variant) return null;

  const handleClick = async () => {
    if (variant === "native") {
      const ok = await promptInstall();
      if (ok) toast.success("已添加到桌面～");
      else setOpen(true); // 用户取消或失败时，给出手动步骤兜底
      return;
    }
    setOpen((v) => !v);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    dismissInstall();
    setDismissed(true);
  };

  const guide = manualSteps(platform);
  const isNative = variant === "native";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[86px] z-40">
      <div className="mx-auto flex max-w-lg justify-end px-4">
        <AnimatePresence>
          {open && !isNative && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto absolute bottom-14 right-4 w-64 rounded-xl border bg-card p-3 shadow-lg"
            >
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                <Smartphone className="h-3.5 w-3.5 text-primary" />
                {guide.title}
              </p>
              <ol className="space-y-1.5 text-[11px] leading-relaxed">
                {guide.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-medium text-primary">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      {renderStep(step, platform)}
                    </span>
                  </li>
                ))}
              </ol>
              {platform === "ios" && (
                <p className="mt-2 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                  苹果限制：必须用 Safari 才能添加；微信内打开无法添加
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
          onClick={handleClick}
          className="pointer-events-auto relative flex items-center gap-1.5 rounded-full bg-primary py-2 pl-3 pr-2.5 text-xs font-medium text-primary-foreground shadow-lg shadow-primary/25"
        >
          <Download className="h-3.5 w-3.5" />
          安装到桌面
          <span
            onClick={handleDismiss}
            role="button"
            tabIndex={0}
            aria-label="不再提示"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                dismissInstall();
                setDismissed(true);
              }
            }}
            className="-mr-0.5 ml-0.5 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </span>
        </motion.button>
      </div>
    </div>
  );
}

/** 在步骤文字里把关键操作词换成图标，便于识别 */
function renderStep(step: string, platform: Platform) {
  if (platform === "ios") {
    if (step.includes("分享")) {
      return (
        <>
          点底部工具栏的
          <Share className="mx-0.5 inline h-3 w-3" />
          分享按钮
        </>
      );
    }
    if (step.includes("添加到主屏幕")) {
      return (
        <>
          在列表里找到
          <Plus className="mx-0.5 inline h-3 w-3" />
          「添加到主屏幕」
        </>
      );
    }
  }
  if (platform === "android" && step.includes("⋮")) {
    return (
      <>
        点浏览器右上角的
        <MoreVertical className="mx-0.5 inline h-3 w-3" />
        菜单
      </>
    );
  }
  return <>{step}</>;
}
