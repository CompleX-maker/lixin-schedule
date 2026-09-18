/**
 * 极简 Cookie Jar + 带跳转链控制的 fetch 封装。
 * 立信 CAS/aTrust 的登录依赖：浏览器 UA、手动跟随 30x、以及页面内 locationUrl 二次跳转。
 */

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export class CookieJar {
  private jar = new Map<string, Map<string, string>>(); // domain -> name -> value

  setFromHeaders(url: string, headers: Headers) {
    const host = new URL(url).hostname;
    const setCookies: string[] =
      typeof (headers as any).getSetCookie === "function"
        ? (headers as any).getSetCookie()
        : headers.get("set-cookie")
          ? [headers.get("set-cookie")!]
          : [];
    for (const sc of setCookies) {
      const [pair, ...attrs] = sc.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      let domain = host;
      for (const a of attrs) {
        const [k, v] = a.split("=").map((s) => s.trim());
        if (k.toLowerCase() === "domain" && v) domain = v.replace(/^\./, "");
      }
      if (!this.jar.has(domain)) this.jar.set(domain, new Map());
      this.jar.get(domain)!.set(name, value);
    }
  }

  get(url: string): string {
    const host = new URL(url).hostname;
    const out: string[] = [];
    for (const [domain, cookies] of this.jar) {
      if (host === domain || host.endsWith("." + domain) || domain.endsWith("." + host)) {
        for (const [n, v] of cookies) out.push(`${n}=${v}`);
      }
    }
    return out.join("; ");
  }

  getCookie(name: string): string | undefined {
    for (const cookies of this.jar.values()) {
      if (cookies.has(name)) return cookies.get(name);
    }
    return undefined;
  }
}

export interface StepLog {
  step: string;
  url: string;
  status?: number;
  note?: string;
}

export interface FetchResult {
  status: number;
  url: string;
  headers: Headers;
  body: string;
}

export async function rawFetch(
  jar: CookieJar,
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<FetchResult> {
  const headers = new Headers(init.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", BROWSER_UA);
  headers.set(
    "accept",
    headers.get("accept") ??
      "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  );
  const cookie = jar.get(url);
  if (cookie) headers.set("cookie", cookie);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers, redirect: "manual", signal: ctrl.signal });
    jar.setFromHeaders(url, res.headers);
    const body = await res.text();
    return { status: res.status, url, headers: res.headers, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 跟随跳转链：既跟随 30x Location，也跟随页面内的
 * locationUrl / location.href / window.location 二次跳转（aTrust 特征）。
 */
export async function followChain(
  jar: CookieJar,
  startUrl: string,
  log: StepLog[],
  maxHops = 12,
): Promise<FetchResult> {
  let url = startUrl;
  for (let i = 0; i < maxHops; i++) {
    const res = await rawFetch(jar, url);
    log.push({ step: "GET", url, status: res.status });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = new URL(loc, url).toString();
      continue;
    }
    // 页面内 JS 跳转
    const m =
      res.body.match(/locationUrl\s*[:=]\s*["']([^"']+)["']/i) ||
      res.body.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i) ||
      res.body.match(/location\.replace\(["']([^"']+)["']\)/i);
    if (m && res.status === 200 && res.body.length < 20000) {
      const next = new URL(m[1], url).toString();
      if (next !== url) {
        url = next;
        continue;
      }
    }
    return res;
  }
  throw new Error("跳转链过长（疑似循环）");
}
