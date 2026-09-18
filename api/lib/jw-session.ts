import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/**
 * 教务账密登录的会话管理：
 * 登录成功（CAS 验证通过）后签发 JWT，写入 httpOnly cookie。
 * 不跨设备同步——新设备没有 cookie，就得重新登录。
 */

export const JW_SESSION_COOKIE = "lixin_jw_sid";
export const JW_SESSION_MAX_AGE_S = 30 * 24 * 3600; // 30 天

function key(): Uint8Array {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET missing");
  return crypto.scryptSync(secret, "lixin-jw-session-v1", 32);
}

export async function signJwSession(studentId: string): Promise<string> {
  return new SignJWT({ sid: studentId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${JW_SESSION_MAX_AGE_S}s`)
    .sign(key());
}

export async function verifyJwSession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}
