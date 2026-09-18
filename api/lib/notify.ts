import nodemailer from "nodemailer";
import { getSetting } from "../queries/schedule";

/**
 * 邮件/Server酱 通知。
 * SMTP 配置存 appSettings["mailConfig"]（管理员在设置页填，QQ邮箱 + 授权码），
 * 避免改动 .env。
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
    await transporter.sendMail({
      from: cfg.from ?? cfg.user,
      to,
      subject,
      text,
    });
    return true;
  } catch (e) {
    console.error("[notify] mail failed:", e);
    return false;
  }
}

export async function sendServerChan(key: string, title: string, desp: string): Promise<boolean> {
  if (!key) return false;
  try {
    const url = key.startsWith("sctp")
      ? `https://sctapi.ftqq.com/${key}.send`
      : `https://sctapi.ftqq.com/${key}.send`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title, desp }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (e) {
    console.error("[notify] serverchan failed:", e);
    return false;
  }
}

export async function notifyUser(
  target: { email?: string | null; serverChanKey?: string | null },
  title: string,
  body: string,
) {
  const results: string[] = [];
  if (target.email) results.push((await sendMail(target.email, title, body)) ? "mail✓" : "mail✗");
  if (target.serverChanKey)
    results.push((await sendServerChan(target.serverChanKey, title, body)) ? "sct✓" : "sct✗");
  return results;
}
