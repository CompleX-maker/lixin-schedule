import crypto from "node:crypto";
import { CookieJar, followChain, rawFetch, type StepLog } from "./http";

/**
 * 立信统一身份认证登录（CAS at cas.paas.lixin.edu.cn）。
 * 与电费监测站（ykt，走 aTrust）相比，教务系统 lxjw 是纯 CAS：
 *   1. GET /cas/login 取 execution
 *   2. GET /cas/jwt/publicKey 取 RSA 公钥（PEM 文本）
 *   3. 密码 PKCS1v15 加密 → base64，加 "__RSA__" 前缀（不要额外 URL 编码，交给表单编码）
 *   4. POST /cas/login（字段须与页面 JS 一致）→ 得 TGC cookie 即成功
 *   5. 带 TGC 访问 lxjw /cas/login → ticket 换 lxjw 会话 cookie
 */

const CAS_BASE = "https://cas.paas.lixin.edu.cn";

export interface LixinSession {
  jar: CookieJar;
  log: StepLog[];
}

export class LixinAuthError extends Error {
  readonly log: StepLog[];
  constructor(message: string, log: StepLog[]) {
    super(message);
    this.log = log;
  }
}

function encryptPassword(publicKeyPem: string, password: string): string {
  let pem = publicKeyPem.trim();
  if (!pem.includes("BEGIN PUBLIC KEY")) {
    pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
  }
  const enc = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password, "utf8"),
  );
  return "__RSA__" + enc.toString("base64");
}

export async function loginLixin(studentId: string, password: string): Promise<LixinSession> {
  const jar = new CookieJar();
  const log: StepLog[] = [];

  // 1. 登录页 → execution
  const loginPage = await rawFetch(jar, `${CAS_BASE}/cas/login`);
  log.push({ step: "cas-login-page", url: `${CAS_BASE}/cas/login`, status: loginPage.status });
  const exec =
    loginPage.body.match(/name="execution"\s+value="([^"]+)"/)?.[1] ??
    loginPage.body.match(/value="([^"]+)"\s+name="execution"/)?.[1];
  if (!exec) throw new LixinAuthError("CAS 登录页未找到 execution 字段", log);

  // 2. RSA 公钥
  const pubRes = await rawFetch(jar, `${CAS_BASE}/cas/jwt/publicKey`, {
    headers: { accept: "application/json" },
  });
  log.push({ step: "cas-publickey", url: `${CAS_BASE}/cas/jwt/publicKey`, status: pubRes.status });
  let publicKey = "";
  try {
    const j = JSON.parse(pubRes.body);
    publicKey = j.publicKey ?? j.data ?? j.key ?? "";
  } catch {
    publicKey = pubRes.body.trim();
  }
  if (!publicKey) throw new LixinAuthError("获取 RSA 公钥失败", log);
  const encPwd = encryptPassword(publicKey, password);

  // 3. 提交登录（字段与页面 doLogin/fm1 逻辑一致）
  const form = new URLSearchParams({
    username: studentId,
    password: encPwd,
    captcha: "",
    mfaState: "",
    currentMenu: "1",
    failN: "-1",
    execution: exec,
    _eventId: "submit",
    geolocation: "",
    fpVisitorId: "",
    submit: "Login1",
  });
  const loginRes = await rawFetch(jar, `${CAS_BASE}/cas/login`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer: `${CAS_BASE}/cas/login`,
    },
    body: form.toString(),
  });
  log.push({ step: "cas-submit", url: `${CAS_BASE}/cas/login`, status: loginRes.status });

  if (!jar.getCookie("TGC")) {
    const errMsg =
      loginRes.body.match(/id="loginErrorsPanel"[\s\S]{0,600}?<span[^>]*>([^<]+)</)?.[1] ??
      loginRes.body.match(/class="errors?"[^>]*>([^<]+)</i)?.[1];
    throw new LixinAuthError(
      `登录失败：${errMsg?.trim() || "账号或密码错误，或触发了验证码"}`,
      log,
    );
  }

  return { jar, log };
}

/** 携带 TGC 进入教务系统（ticket 换 lxjw 会话），返回会话本身 */
export async function enterJw(session: LixinSession): Promise<void> {
  await followChain(session.jar, "https://lxjw.lixin.edu.cn/cas/login", session.log);
}
