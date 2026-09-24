/**
 * 管理员身份预览
 *
 * 目的：管理员想知道「普通用户看到的是什么样」，但又不想真的退出管理员权限。
 *
 * 实现方式：在客户端维护一个「预览开关」，开启后把 isAdmin 一律视为 false。
 * 这是**纯客户端**的显示层开关 —— 服务端仍按真实 role 下发数据，
 * 所以它只影响界面呈现，不会真的降权（也就不存在越权风险）。
 *
 * 注意：为避免管理员误以为权限丢了，开启时界面上必须有明确的提示条。
 */

const KEY = "admin-preview-as-user";

let previewing = false;
let listeners: Array<() => void> = [];
let initialized = false;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  previewing = read();
  // 跨标签页同步
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      previewing = read();
      listeners.forEach((fn) => fn());
    }
  });
}

export function isPreviewingAsUser(): boolean {
  init();
  return previewing;
}

export function setPreviewAsUser(on: boolean) {
  init();
  previewing = on;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* localStorage 不可用时仅本次会话生效 */
  }
  listeners.forEach((fn) => fn());
}

export function subscribePreview(fn: () => void) {
  init();
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((x) => x !== fn);
  };
}

/**
 * 判断「当前是否应以管理员身份呈现」。
 *
 * 所有前端需要判断管理员的地方都应调用它，而不是直接比较 me.role。
 */
export function effectiveIsAdmin(realRole: string | undefined | null): boolean {
  if (realRole !== "admin") return false;
  return !isPreviewingAsUser();
}
