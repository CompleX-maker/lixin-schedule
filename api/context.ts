import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import * as cookie from "cookie";
import type { User } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";
import { JW_SESSION_COOKIE, verifyJwSession } from "./lib/jw-session";
import { findUserByUnionId } from "./queries/users";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    // 1. 教务账密登录会话（学生主路径）
    const cookies = cookie.parse(opts.req.headers.get("cookie") ?? "");
    const jwToken = cookies[JW_SESSION_COOKIE];
    if (jwToken) {
      const studentId = await verifyJwSession(jwToken);
      if (studentId) {
        ctx.user = await findUserByUnionId(`jw:${studentId}`);
        if (ctx.user) return ctx;
      }
    }
    // 2. Kimi OAuth（管理员后台入口）
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Authentication is optional here
  }
  return ctx;
}
