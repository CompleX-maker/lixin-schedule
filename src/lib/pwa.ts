/**
 * PWA 安装引导
 *
 * 关键背景（重要）：
 *   `beforeinstallprompt` **只有 Chromium 系浏览器**（Chrome / Edge / 三星浏览器 /
 *   部分国产浏览器）才会触发。以下环境不会触发：
 *     - iOS 全系（Safari / Chrome 都一样，苹果只允许手动「添加到主屏幕」）
 *     - Android 上的 Via、Firefox、UC 等非 Chromium 内核浏览器
 *     - 桌面 Safari / Firefox
 *
 *   所以不能只靠 deferredPrompt 判断，否则这些浏览器会「什么都不显示」。
 *   现在的策略是：只要没安装，就一律给出引导 ——
 *     - 有原生安装能力 → 一键安装按钮
 *     - 没有 → 给出对应平台的手动步骤
 */

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 14;

export type Variant = "native" | "ios" | "android-manual" | "desktop-manual" | null;
export type Platform = "ios" | "android" | "desktop";

let deferredPrompt: any = null;
let listeners: Array<() => void> = [];
let lastVariant: Variant = null;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches === true ||
    window.matchMedia?.("(display-mode: minimal-ui)")?.matches === true ||
    (navigator as any).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPhoneiPad = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ 用户代理伪装成 Macintosh，用触摸点数量区分
  const iPadOS = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
  return iPhoneiPad || iPadOS;
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** 是否微信内置浏览器：微信里既不能安装，也不能唤起安装弹窗 */
export function isWeChat(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

export function getPlatform(): Platform {
  if (isIOS()) return "ios";
  if (isAndroid()) return "android";
  return "desktop";
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

function currentVariant(): Variant {
  if (isStandalone()) return null;

  // 微信内置浏览器：不能安装，交给专门的遮罩层处理
  if (isWeChat()) return null;

  // Chromium 系：可以直接唤起安装弹窗
  if (deferredPrompt) return "native";

  // 其余情况一律给出「手动添加」引导，避免什么都不显示
  if (isIOS()) return "ios";
  if (isAndroid()) return "android-manual";
  return "desktop-manual";
}

function notify() {
  const v = currentVariant();
  if (v !== lastVariant) {
    lastVariant = v;
    listeners.forEach((fn) => fn());
  }
}

export function subscribeInstall(fn: () => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((x) => x !== fn);
  };
}

export function getInstallVariant(): Variant {
  return currentVariant();
}

export function isDismissed() {
  return dismissedRecently();
}

/** 触发原生安装弹窗；返回是否成功唤起 */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice?.outcome === "accepted";
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* localStorage 不可用时忽略 */
  }
  notify();
}

/** 针对不同平台给出「怎么手动添加」的说明 */
export function manualSteps(platform: Platform): { title: string; steps: string[] } {
  if (platform === "ios") {
    return {
      title: "Safari 添加到主屏幕",
      steps: [
        "点底部工具栏的「分享」按钮（方框+箭头）",
        "在列表里找到「添加到主屏幕」",
        "右上角点「添加」",
      ],
    };
  }
  if (platform === "android") {
    return {
      title: "添加到主屏幕",
      steps: [
        "点浏览器右上角的「⋮」菜单",
        "选择「添加到主屏幕」或「安装应用」",
        "确认添加",
      ],
    };
  }
  return {
    title: "安装到桌面",
    steps: [
      "点地址栏右侧的「安装」图标（⊕ 或显示器图标）",
      "若没有该图标，打开浏览器菜单找「安装立信课表」",
      "推荐使用 Chrome / Edge 等 Chromium 内核浏览器",
    ],
  };
}

export function initInstallPrompt() {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* 忽略 */
    }
    notify();
  });

  window
    .matchMedia?.("(display-mode: standalone)")
    ?.addEventListener?.("change", notify);

  notify();
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* 注册失败不影响主流程 */
    });
  });
}
