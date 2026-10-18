import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const UI_ORIGIN = "http://127.0.0.1:3000";
const COOKIE_NAME = "sprintboard_approver";

export function createApprovalCode(): string {
  return randomBytes(24).toString("base64url");
}

function matches(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

// One browser approver per running backend. No credential enters board data,
// proposal responses, or the MCP adapter. Restarting invalidates everything.
export function createApproverSession(setupCode: string) {
  let unusedCode: string | undefined = setupCode;
  let session: { token: string; csrfToken: string } | undefined;

  function authenticated(req: Request): boolean {
    const cookie = req.headers.cookie?.split(";").map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAME}=`));
    return !!session && !!cookie && matches(cookie.slice(COOKIE_NAME.length + 1), session.token);
  }

  return {
    establish(code: string, res: Response): { authenticated: true; csrfToken: string } | undefined {
      if (!unusedCode || !matches(code, unusedCode)) return undefined;
      unusedCode = undefined;
      session = { token: createApprovalCode(), csrfToken: createApprovalCode() };
      res.cookie(COOKIE_NAME, session.token, { httpOnly: true, sameSite: "strict", path: "/api" });
      return { authenticated: true, csrfToken: session.csrfToken };
    },
    status(req: Request) {
      return authenticated(req)
        ? { authenticated: true, csrfToken: session!.csrfToken }
        : { authenticated: false };
    },
    authorize(req: Request): boolean {
      const csrf = req.get("X-CSRF-Token");
      return req.get("Origin") === UI_ORIGIN && authenticated(req)
        && typeof csrf === "string" && matches(csrf, session!.csrfToken);
    },
  };
}
