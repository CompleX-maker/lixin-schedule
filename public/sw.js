/* 立信课表 Service Worker
 *
 * 目标：
 *   1. 让站点可安装（PWA 要求有 fetch 事件的 SW）
 *   2. 静态资源走缓存，打开更快、弱网可用
 *   3. 课表数据走网络优先，保证不显示过期信息
 *
 * 策略：
 *   - 导航请求：网络优先，失败回退缓存（离线可打开上次页面）
 *   - /assets/、/static/：缓存优先（带 hash 的文件名，内容不会变）
 *   - API 请求：完全不缓存，始终走网络
 */

const VERSION = "v1";
const STATIC_CACHE = `lixin-static-${VERSION}`;
const PAGE_CACHE = `lixin-page-${VERSION}`;

/* 预缓存的核心资源（安装时拉取） */
const PRECACHE = [
  "/",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png",
  "/static/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // 逐个添加，单个失败不影响整体安装
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch(() => {
            /* 忽略单个资源失败 */
          }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 清理旧版本缓存
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("lixin-") && !k.endsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 只处理 GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 只处理同源
  if (url.origin !== self.location.origin) return;

  // API 一律不缓存：课表、留言等数据必须实时
  if (url.pathname.startsWith("/api/")) return;

  // 带 hash 的静态资源：缓存优先
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/static/")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;

        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          return hit ?? Response.error();
        }
      })(),
    );
    return;
  }

  // 页面导航：网络优先，离线回退缓存
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(PAGE_CACHE);
          if (res.ok) cache.put("/", res.clone());
          return res;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          const cached = await cache.match("/");
          if (cached) return cached;

          return new Response(
            `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
             <meta name="viewport" content="width=device-width,initial-scale=1">
             <title>暂时离线</title>
             <body style="font-family:system-ui;padding:2rem;text-align:center;color:#333">
               <h2>暂时连不上网络</h2>
               <p style="color:#666">请检查网络后重试</p>
               <button onclick="location.reload()"
                 style="padding:.6rem 1.4rem;border:0;border-radius:.5rem;
                        background:#d9e84a;font-size:1rem;cursor:pointer">
                 重新加载
               </button>
             </body></html>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  }
});
