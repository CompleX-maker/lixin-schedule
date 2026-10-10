import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

/**
 * 会话 cookie 选项
 *
 * `COOKIE_DOMAIN` 用于把会话共享给子域名（例如 epower.stellaura.tech 复用
 * 本站的登录状态）。留空则为「主机专属」cookie，只有当前域名能读到。
 *
 * 注意事项：
 *   - 设了 Domain 就不要再依赖 host-only，否则子域名读不到
 *   - SameSite=None 必须搭配 Secure，因此仅在非 localhost 下启用
 */
export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);
  const domain = process.env.COOKIE_DOMAIN?.trim();

  return {
    httpOnly: true,
    path: "/",
    sameSite: localhost ? "Lax" : "None",
    secure: !localhost,
    // 仅在生产且显式配置时带上 Domain；localhost 下不设，避免本地调试异常
    ...(domain && !localhost ? { domain } : {}),
  };
}
