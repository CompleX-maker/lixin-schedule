import nodemailer from "nodemailer";
import { getSetting } from "../queries/schedule";

/**
 * 邮件 / Server酱 通知。
 *
 * Server酱 有两代产品，SendKey 不通用，但可以用格式区分：
 *   - Server酱 Turbo（sct.ftqq.com）：SendKey 形如 `SCT1234Txxxxx`，主打**微信推送**
 *   - Server酱³（sc3.ft07.com）  ：SendKey 形如 `sctp1234txxxxx`，主打 APP 推送
 *
 * 本站在「我的」页面引导用户使用 **Turbo 版**（因为它直接推到微信，最符合学生习惯）。
 * 但如果用户填了 Server酱³ 的 key，也自动走它自己的官方入口 ——
 * 否则会被官方那个「临时转发」接管，而转发**会往消息里插广告**。
 *
 * 官方 API 文档：
 *   Turbo: https://sct.ftqq.com/
 *   ³    : https://doc2.ft07.com/zh/serverchan3/server/api
 */

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string; // QQ邮箱授权码
  from?: string;
}

export async function loadMailConfig(): Promise<MailConfig | null> {
  const raw = await getSetting("mailConfig");
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!j.host || !j.user || !j.pass) return null;
    return { port: 465, ...j };
  } catch {
    return null;
  }
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const cfg = await loadMailConfig();
  if (!cfg) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10000,
    });
    await transporter.sendMail({ from: cfg.from ?? cfg.user, to, subject, text });
    return true;
  } catch (e) {
    console.error("[notify] mail failed:", e);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Server酱
 * ------------------------------------------------------------------ */

export type SendKeyKind = "turbo" | "sc3" | "unknown";

/** 判断 SendKey 属于哪一代 */
export function sendKeyKind(key: string): SendKeyKind {
  const k = key.trim();
  if (/^sctp\d+t/i.test(k)) return "sc3";
  if (/^SCT[a-zA-Z0-9]+$/i.test(k) && k.length >= 20) return "turbo";
  return "unknown";
}

/** 构造官方 API 地址（不依赖那个会插广告的转发层） */
export function sendKeyUrl(key: string): string | null {
  const k = key.trim();
  const kind = sendKeyKind(k);

  if (kind === "sc3") {
    // 从 sctp{uid}t... 中提取 uid
    const m = /^sctp(\d+)t/i.exec(k);
    if (!m) return null;
    return `https://${m[1]}.push.ft07.com/send/${k}.send`;
  }

  if (kind === "turbo") {
    return `https://sctapi.ftqq.com/${k}.send`;
  }

  return null;
}

export interface ServerChanResult {
  ok: boolean;
  /** 面向用户的中文提示 */
  message: string;
  /** 官方返回的错误码，便于排查 */
  code?: number;
}

/**
 * 发送 Server酱 推送。
 *
 * Server酱 的特点：**HTTP 200 不代表成功**，必须看 body 里的 code。
 * 所以这里解析 JSON，把 code!==0 也当作失败，并把官方提示翻译成人话。
 */
export async function sendServerChan(
  key: string,
  title: string,
  desp: string,
): Promise<ServerChanResult> {
  const k = (key ?? "").trim();
  if (!k) return { ok: false, message: "未配置 SendKey" };

  const url = sendKeyUrl(k);
  if (!url) {
    return {
      ok: false,
      message: "SendKey 格式不对，应形如 SCT 开头的字符串（Server酱 Turbo）",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title, desp }).toString(),
      signal: AbortSignal.timeout(12000),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON 响应 */
    }

    if (!json) {
      return { ok: false, message: `推送服务返回异常（HTTP ${res.status}）` };
    }

    // Turbo: { code: 0, data: { error: "SUCCESS" } }
    // ³    : { code: 0, data: { ... } }
    const code = Number(json.code ?? -1);
    if (code === 0) return { ok: true, message: "推送成功", code };

    const raw = String(json.message || json.info || "").trim();

    // 把常见错误翻译成人话
    let friendly = raw || "推送失败";
    if (/错误的Key|invalid.*key/i.test(raw)) {
      friendly = "SendKey 无效，请到 Server酱 重新复制（注意 Turbo 与³的 Key 不通用）";
    } else if (/超过.*限制|上限|quota/i.test(raw)) {
      friendly = "今天的推送次数用完了，明天再试（免费版每天有额度）";
    } else if (/未关注|没有关注/i.test(raw)) {
      friendly = "还没有扫码关注，请先到 Server酱 网站完成微信绑定";
    }

    return { ok: false, message: friendly, code };
  } catch (e: any) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    console.error("[notify] serverchan failed:", e);
    return {
      ok: false,
      message: timeout ? "请求超时，请稍后重试" : "网络异常，无法连接推送服务",
    };
  }
}

export async function notifyUser(
  target: { email?: string | null; serverChanKey?: string | null },
  title: string,
  body: string,
) {
  const results: string[] = [];
  if (target.email) results.push((await sendMail(target.email, title, body)) ? "mail✓" : "mail✗");
  if (target.serverChanKey) {
    const r = await sendServerChan(target.serverChanKey, title, body);
    results.push(r.ok ? "sct✓" : `sct✗(${r.message})`);
  }
  return results;
}
