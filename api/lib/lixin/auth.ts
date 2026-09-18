import crypto from "node:crypto";
import { CookieJar, followChain, rawFetch, type StepLog } from "./http";

/**
 * 立信统一身份认证登录链（CAS + 深信服 aTrust 零信任）。
 * 与电费监测站（ykt.lixin.edu.cn）验证过的链路一致：
 *   1. GET CAS 登录页取 execution
 *   2. GET /cas/jwt/publicKey 取 RSA 公钥，密码 PKCS1v15 加密后加 "__RSA__" 前缀
 *   3. POST 登录表单 → aTrust sid cookie
 *   4. POST /controller/v1/public/reportEnv（必做，否则 authCheck 不过）
 *   5. GET /passport/v1/auth/authCheck 返回 code:0 即就绪
 *   6. 携带 cookie 访问目标系统（跟随 30x + 页面内跳转）
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

function encryptPassword(publicKeyBody: string, password: string): string {
  // 公钥可能是纯 base64，也可能带 PEM 头
  let pem = publicKeyBody.trim();
  if (!pem.includes("BEGIN PUBLIC KEY")) {
    pem = `-----BEGIN PUBLIC KEY-----\n${pem}\n-----END PUBLIC KEY-----`;
  }
  const enc = crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password, "utf8"),
  );
  return "__RSA__" + encodeURIComponent(enc.toString("base64"));
}

/** 登录 CAS + aTrust，返回携带会话 cookie 的 LixinSession */
export async function loginLixin(studentId: string, password: string): Promise<LixinSession> {
  const jar = new CookieJar();
  const log: StepLog[] = [];

  // 1. CAS 登录页 → execution
  const loginPage = await rawFetch(jar, `${CAS_BASE}/cas/login`);
  log.push({ step: "cas-login-page", url: `${CAS_BASE}/cas/login`, status: loginPage.status });
  const execution = loginPage.body.match(/name="execution"\s+value="([^"]+)"/)?.[1];
  if (!execution) {
    // 有些版本藏在别的字段名里，兜底再试一次 value 在前的写法
    const alt = loginPage.body.match(/value="([^"]+)"\s+name="execution"/)?.[1];
    if (!alt) throw new LixinAuthError("CAS 登录页未找到 execution 字段", log);
  }
  const exec = execution ?? loginPage.body.match(/value="([^"]+)"\s+name="execution"/)![1];

  // 2. RSA 公钥 → 加密密码
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

  // 3. POST 登录表单
  const form = new URLSearchParams({
    username: studentId,
    password: encPwd,
    execution: exec,
    _eventId: "submit",
    captcha: "",
  });
  const loginRes = await rawFetch(jar, `${CAS_BASE}/cas/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  log.push({ step: "cas-submit", url: `${CAS_BASE}/cas/login`, status: loginRes.status });

  const sid = jar.getCookie("sid");
  if (!sid) {
    const errMatch = loginPage.body.match(/class="errors?"[^>]*>([^<]+)</i);
    throw new LixinAuthError(
      `登录失败：未获得 aTrust sid（${errMatch?.[1]?.trim() || "账号或密码可能错误"}）`,
      log,
    );
  }

  // 4. reportEnv（aTrust 设备环境上报，必做）
  const deviceId = crypto.randomBytes(32).toString("hex"); // 64位hex
  const reportBody = {
    ticket: sid,
    deviceId,
    env: { endpoint: { device_id: deviceId } },
    device: { type: "browser" },
  };
  const reportRes = await rawFetch(jar, `${CAS_BASE}/controller/v1/public/reportEnv`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(reportBody),
  });
  log.push({
    step: "reportEnv",
    url: `${CAS_BASE}/controller/v1/public/reportEnv`,
    status: reportRes.status,
  });

  // 5. authCheck
  const checkRes = await rawFetch(jar, `${CAS_BASE}/passport/v1/auth/authCheck`, {
    headers: { accept: "application/json" },
  });
  log.push({
    step: "authCheck",
    url: `${CAS_BASE}/passport/v1/auth/authCheck`,
    status: checkRes.status,
    note: checkRes.body.slice(0, 200),
  });
  if (!/"code"\s*:\s*0/.test(checkRes.body)) {
    throw new LixinAuthError(`authCheck 未通过：${checkRes.body.slice(0, 120)}`, log);
  }

  return { jar, log };
}

/** 携带会话访问教务系统，跟随完整跳转链直到拿到真实页面 */
export async function openJw(session: LixinSession, path = "/cas/login") {
  const url = `https://lxjw.lixin.edu.cn${path}`;
  const res = await followChain(session.jar, url, session.log);
  return res;
}
