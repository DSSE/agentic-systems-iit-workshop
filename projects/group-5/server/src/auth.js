import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AUTH_DIR } from "./config.js";
import { BookingError, CODES } from "./domain/errors.js";

const derive = promisify(scrypt);
const trustedUsers = new WeakSet();
const SESSION_MS = 8 * 60 * 60 * 1000;
export const SESSION_COOKIE = "campusdesk_session";
export const cookieOptions = {
  httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api",
};

export function requireRole(user, role) {
  if (!user || !trustedUsers.has(user)) {
    throw new BookingError(CODES.UNAUTHENTICATED, "Sign in to continue.");
  }
  if (role && user.role !== role) {
    throw new BookingError(CODES.FORBIDDEN, `This action requires a ${role} account.`);
  }
}

export async function provisionAccount({ id, email, name, role, password }) {
  if (!["student", "staff"].includes(role) || typeof password !== "string" || password.length < 12) {
    throw new Error("Accounts require a student/staff role and a password of at least 12 characters.");
  }
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { id, email: email.trim().toLowerCase(), name, role, salt, hash: hash.toString("hex") };
}

// Principals are created here, never from a submitted role or user ID.
export function createAuth(accounts, { now = Date.now } = {}) {
  const users = new Map(accounts.map((account) => {
    const user = Object.freeze({ id: account.id, email: account.email, name: account.name, role: account.role });
    trustedUsers.add(user);
    return [account.email, { account, user }];
  }));
  const sessions = new Map();
  const failures = new Map();
  const dummySalt = randomBytes(16).toString("hex");
  const digest = (token) => createHash("sha256").update(token).digest("hex");
  function tokenFrom(req) {
    // CLI/MCP clients use the same expiring session token as the browser.
    // Authorization is still resolved from server-owned sessions, not claims.
    const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || "");
    if (bearer) return bearer[1];
    const part = (req.headers.cookie || "").split(";").find((item) => item.trim().startsWith(`${SESSION_COOKIE}=`));
    return part ? part.trim().slice(SESSION_COOKIE.length + 1) : "";
  }
  return {
    async login(email, password, client = "local") {
      const failure = failures.get(client);
      if (failure && failure.until > now() && failure.count >= 10) {
        throw new BookingError(CODES.AUTH_RATE_LIMIT, "Too many failed sign-ins. Try again in 15 minutes.");
      }
      const found = typeof email === "string" ? users.get(email.trim().toLowerCase()) : null;
      const validPassword = typeof password === "string" && password.length <= 256;
      const candidate = await derive(validPassword ? password : "", found?.account.salt || dummySalt, 64,
        { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const expected = found ? Buffer.from(found.account.hash, "hex") : Buffer.alloc(64);
      if (!timingSafeEqual(candidate, expected) || !found || !validPassword) {
        const current = failure && failure.until > now() ? failure : { count: 0, until: now() + 15 * 60 * 1000 };
        current.count += 1;
        failures.set(client, current);
        throw new BookingError(CODES.INVALID_CREDENTIALS, "The email or password is incorrect.");
      }
      failures.delete(client);
      for (const [key, session] of sessions) if (session.expiresAt <= now()) sessions.delete(key);
      const token = randomBytes(32).toString("hex");
      sessions.set(digest(token), { user: found.user, expiresAt: now() + SESSION_MS });
      return { token, user: found.user, maxAge: SESSION_MS };
    },
    userFor(req) {
      const token = tokenFrom(req);
      if (!token) return null;
      const key = digest(token);
      const session = sessions.get(key);
      if (!session || session.expiresAt <= now()) {
        sessions.delete(key);
        return null;
      }
      return session.user;
    },
    logout(req) { sessions.delete(digest(tokenFrom(req))); },
  };
}

// Local workshop accounts have random passwords, kept in an ignored directory.
// Existing accounts are reused. No password or session is shipped in the repo.
export async function loadAuth() {
  await mkdir(AUTH_DIR, { recursive: true });
  const accountFile = path.join(AUTH_DIR, "accounts.json");
  let accounts;
  try {
    accounts = JSON.parse(await readFile(accountFile, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    if (process.env.NODE_ENV === "production") {
      throw new Error("Provision accounts before starting in production; automatic demo setup is development-only.");
    }
    const definitions = [
      { id: "student-demo", email: "student@campusdesk.local", name: "Student Demo", role: "student" },
      { id: "staff-demo", email: "staff@campusdesk.local", name: "Lab Staff", role: "staff" },
    ].map((account) => ({ ...account, password: randomBytes(12).toString("base64url") }));
    accounts = await Promise.all(definitions.map(provisionAccount));
    await writeFile(accountFile, JSON.stringify(accounts, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    await writeFile(path.join(AUTH_DIR, "demo-accounts.txt"),
      "CampusDesk local workshop accounts — keep this file private.\n\n" +
      definitions.map((account) => `${account.role}\nEmail: ${account.email}\nPassword: ${account.password}\n`).join("\n"),
      { mode: 0o600, flag: "wx" });
  }
  return createAuth(accounts);
}
