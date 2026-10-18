import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

const directory = await mkdtemp(path.join(os.tmpdir(), "campusdesk-roles-"));
const dataFile = path.join(directory, "data.json");
process.env.CAMPUSDESK_DATA_FILE = dataFile;
await writeFile(dataFile, JSON.stringify({ rooms: [{ id: "lab-1", name: "Lab 1", capacity: 8 }], bookings: [] }));
const { createAuth, provisionAccount, SESSION_COOKIE } = await import("../src/auth.js");
const { createApp } = await import("../src/app.js");
const service = await import("../src/service.js");
const { withData } = await import("../src/data/store.js");
const password = "test-only-password-not-a-secret";
const accounts = await Promise.all([
  { id: "student-a", email: "a@test.invalid", name: "Student A", role: "student" },
  { id: "student-b", email: "b@test.invalid", name: "Student B", role: "student" },
  { id: "staff-a", email: "staff@test.invalid", name: "Staff A", role: "staff" },
].map((account) => provisionAccount({ ...account, password })));
const auth = createAuth(accounts);
const server = createApp({ auth }).listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
async function http(route, { cookie, body, method = body === undefined ? "GET" : "POST", headers = {} } = {}) {
  const response = await fetch(base + route, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie"), headers: response.headers };
}
async function signIn(email) {
  const result = await http("/api/auth/login", { body: { email, password } });
  assert.equal(result.status, 200);
  return result.cookie.split(";")[0];
}
const studentCookie = await signIn("a@test.invalid");
const otherCookie = await signIn("b@test.invalid");
const staffCookie = await signIn("staff@test.invalid");
const slot = (day, minutes = 60) => ({ room_id: "lab-1", start_at: `2030-01-${String(day).padStart(2, "0")}T09:00:00+06:00`,
  end_at: `2030-01-${String(day).padStart(2, "0")}T${String(9 + Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+06:00`, group_size: 3 });
async function submit(day, cookie = studentCookie, extra = {}) {
  const input = slot(day);
  const preview = await http("/api/availability", { cookie, body: input });
  assert.equal(preview.status, 200);
  const body = { ...input, proposal_id: preview.body.proposal.proposal_id, purpose: "Group project meeting", ...extra };
  const response = await http("/api/requests", { cookie, body });
  assert.equal(response.status, 201);
  return { request: response.body.request, body };
}
const data = async () => JSON.parse(await readFile(dataFile, "utf8"));

test("the public health route and credentialed loopback-port support are preserved in development", async () => {
  assert.deepEqual((await http("/")).body, { service: "campusdesk-api", ok: true });
  const response = await http("/api/auth/login", { body: { email: "a@test.invalid", password }, headers: { Origin: "http://localhost:3001" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3001");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.equal((await http("/api/auth/session", { headers: { Origin: "http://localhost.evil.test:3001" } })).status, 403);
});

test("production CORS requires the configured frontend origin", async () => {
  const previous = process.env.NODE_ENV;
  let production;
  try { process.env.NODE_ENV = "production"; production = createApp({ auth }); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
  const instance = production.listen(0, "127.0.0.1");
  await once(instance, "listening");
  try {
    const url = `http://127.0.0.1:${instance.address().port}/api/auth/session`;
    assert.equal((await fetch(url, { headers: { Origin: "http://localhost:3001" } })).status, 403);
    assert.equal((await fetch(url, { headers: { Origin: "http://localhost:3000" } })).status, 200);
  } finally { instance.closeAllConnections(); await new Promise((resolve) => instance.close(resolve)); }
});

test("protected endpoints reject anonymous and forged cookies; roles come from the session", async () => {
  assert.equal((await http("/api/requests")).status, 401);
  assert.equal((await http("/api/rooms", { cookie: `${SESSION_COOKIE}=forged` })).status, 401);
  assert.equal((await http("/api/auth/session")).body.user, null);
  const result = await http("/api/auth/login", { body: { email: "a@test.invalid", password, role: "staff", id: "staff-a" } });
  assert.equal(result.body.user.role, "student");
  assert.match(result.cookie, /HttpOnly/i);
  assert.match(result.cookie, /SameSite=Strict/i);
  assert.equal(JSON.stringify(result.body).includes(password), false);
});

test("wrong passwords, cross-origin writes, non-JSON forms and malformed JSON are refused", async () => {
  assert.equal((await http("/api/auth/login", { body: { email: "staff@test.invalid", password: "wrong" } })).status, 401);
  assert.equal((await http("/api/auth/login", { body: { email: "staff@test.invalid", password }, headers: { Origin: "http://evil.test" } })).status, 403);
  const form = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  assert.equal(form.status, 415);
  const malformed = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(malformed.status, 400);
});

test("a student submits an immutable pending request, without creating a booking", async () => {
  const before = (await data()).bookings;
  const { request, body } = await submit(1, studentCookie, { requested_by: "staff-a", status: "approved", role: "staff", approved: true });
  assert.equal(request.status, "pending");
  assert.equal(request.requested_by, "student-a");
  assert.deepEqual((await data()).bookings, before);
  const retried = await http("/api/requests", { cookie: studentCookie, body });
  assert.equal(retried.body.request.id, request.id);
  assert.equal((await data()).requests.filter((item) => item.id === request.id).length, 1);
});

test("students cannot approve, reject, or use the original create-booking endpoint", async () => {
  const { request } = await submit(2);
  const before = await readFile(dataFile, "utf8");
  for (const action of ["approve", "reject"]) {
    const response = await http(`/api/requests/${request.id}/${action}`, { cookie: studentCookie, body: { note: "I approve" } });
    assert.equal(response.status, 403);
  }
  const direct = await http("/api/bookings", { cookie: studentCookie, body: { ...slot(2), request_id: request.id, approved: true, role: "staff" } });
  assert.equal(direct.status, 403);
  assert.equal(await readFile(dataFile, "utf8"), before);
});

test("only the requester can view or cancel their request; staff cannot submit as a student", async () => {
  const { request } = await submit(3);
  const otherRequests = await http("/api/requests", { cookie: otherCookie });
  assert.equal(otherRequests.body.requests.some((item) => item.id === request.id), false);
  assert.equal((await http(`/api/requests/${request.id}/cancel`, { cookie: otherCookie, body: {} })).status, 404);
  assert.equal((await http("/api/availability", { cookie: staffCookie, body: slot(3) })).status, 403);
  assert.equal((await http("/api/requests", { cookie: staffCookie, body: slot(3) })).status, 403);
  const before = (await data()).bookings;
  assert.equal((await http(`/api/requests/${request.id}/cancel`, { cookie: studentCookie, body: {} })).body.request.status, "cancelled");
  assert.equal((await http(`/api/requests/${request.id}/approve`, { cookie: staffCookie, body: {} })).status, 409);
  assert.deepEqual((await data()).bookings, before);
});

test("staff approves the exact pending request once, with requester/reviewer audit metadata", async () => {
  const { request } = await submit(4);
  const before = await readFile(dataFile, "utf8");
  assert.equal((await http(`/api/requests/${request.id}/approve`, { cookie: staffCookie, body: { group_size: 8 } })).status, 400);
  assert.equal(await readFile(dataFile, "utf8"), before);
  const result = await http(`/api/requests/${request.id}/approve`, { cookie: staffCookie, body: { note: "Have a good session" } });
  assert.equal(result.status, 200);
  assert.equal(result.body.request.status, "approved");
  assert.equal(result.body.booking.requested_by, "student-a");
  assert.equal(result.body.booking.approved_by, "staff-a");
  assert.equal(result.body.booking.group_size, request.group_size);
  const committed = await readFile(dataFile, "utf8");
  assert.equal((await http(`/api/requests/${request.id}/approve`, { cookie: staffCookie, body: {} })).status, 409);
  assert.equal(await readFile(dataFile, "utf8"), committed);
  const schedule = await http("/api/bookings?room_id=lab-1", { cookie: otherCookie });
  assert.equal(schedule.body.bookings.some((item) => "requested_by" in item || "approved_by" in item), false);
});

test("rejection requires a reason, does not create bookings and is visible to the student", async () => {
  const { request } = await submit(5);
  const before = (await data()).bookings;
  assert.equal((await http(`/api/requests/${request.id}/reject`, { cookie: staffCookie, body: {} })).status, 400);
  const result = await http(`/api/requests/${request.id}/reject`, { cookie: staffCookie, body: { note: "Lab needed for class" } });
  assert.equal(result.body.request.status, "rejected");
  const visible = await http("/api/requests", { cookie: studentCookie });
  assert.equal(visible.body.requests.find((item) => item.id === request.id).review_note, "Lab needed for class");
  assert.equal((await http(`/api/requests/${request.id}/approve`, { cookie: staffCookie, body: {} })).status, 409);
  assert.deepEqual((await data()).bookings, before);
});

test("concurrent overlapping approvals create only one booking; the other stays pending", async () => {
  const first = await submit(6);
  const second = await submit(6, otherCookie);
  const results = await Promise.all([first, second].map(({ request }) => http(`/api/requests/${request.id}/approve`, { cookie: staffCookie, body: {} })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const saved = await data();
  assert.equal(saved.bookings.filter((item) => item.start_at === slot(6).start_at).length, 1);
  const statuses = saved.requests.filter((item) => [first.request.id, second.request.id].includes(item.id)).map((item) => item.status).sort();
  assert.deepEqual(statuses, ["approved", "pending"]);
});

test("previews cannot be stolen or altered; missing staff approval cannot create a booking", async () => {
  const preview = await http("/api/availability", { cookie: studentCookie, body: slot(7) });
  const body = { ...slot(7), proposal_id: preview.body.proposal.proposal_id, purpose: "Other group session" };
  const before = await readFile(dataFile, "utf8");
  assert.equal((await http("/api/requests", { cookie: otherCookie, body })).status, 400);
  assert.equal((await http("/api/requests", { cookie: studentCookie, body: { ...body, group_size: 4 } })).status, 400);
  assert.equal((await http("/api/bookings", { cookie: staffCookie, body: { ...slot(7), approved: true, proposal_id: body.proposal_id } })).body.error.code, "APPROVAL_REQUIRED");
  assert.equal(await readFile(dataFile, "utf8"), before);
});

test("staff cannot review their own request, even if they acquired staff privileges later", async () => {
  const { request } = await submit(8);
  await withData((stored) => { stored.requests.find((item) => item.id === request.id).requested_by = "staff-a"; });
  const before = await readFile(dataFile, "utf8");
  for (const action of ["approve", "reject"]) assert.equal((await http(`/api/requests/${request.id}/${action}`, { cookie: staffCookie, body: { note: "Self review" } })).status, 403);
  assert.equal(await readFile(dataFile, "utf8"), before);
});

test("approval revalidates the live capacity and duration rather than trusting persisted requests", async () => {
  const { request } = await submit(9);
  await withData((stored) => { stored.rooms[0].capacity = 2; });
  let before = await readFile(dataFile, "utf8");
  assert.equal((await http(`/api/requests/${request.id}/approve`, { cookie: staffCookie, body: {} })).body.error.code, "CAPACITY_EXCEEDED");
  assert.equal(await readFile(dataFile, "utf8"), before);
  await withData((stored) => { stored.rooms[0].capacity = 8; stored.requests.find((item) => item.id === request.id).end_at = slot(9, 300).end_at; });
  before = await readFile(dataFile, "utf8");
  assert.equal((await http(`/api/requests/${request.id}/approve`, { cookie: staffCookie, body: {} })).body.error.code, "DURATION_LIMIT_EXCEEDED");
  assert.equal(await readFile(dataFile, "utf8"), before);
});

test("180 minutes works, 181 and 300 minutes fail, and pending requests survive a new app instance", async () => {
  for (const duration of [181, 300]) assert.equal((await http("/api/availability", { cookie: studentCookie, body: slot(10, duration) })).body.error.code, "DURATION_LIMIT_EXCEEDED");
  const preview = await http("/api/availability", { cookie: studentCookie, body: slot(10, 180) });
  const result = await http("/api/requests", { cookie: studentCookie, body: { ...slot(10, 180), proposal_id: preview.body.proposal.proposal_id, purpose: "Three hour workshop" } });
  assert.equal(result.status, 201);
  assert.equal((await http(`/api/requests/${result.body.request.id}/approve`, { cookie: staffCookie, body: {} })).status, 200);
  const { request } = await submit(11);
  const reloaded = createAuth(JSON.parse(JSON.stringify(accounts)));
  const staff = (await reloaded.login("staff@test.invalid", password)).user;
  assert.ok((await service.listRequestsTool(staff)).some((item) => item.id === request.id && item.status === "pending"));
  await assert.rejects(() => service.createBookingTool(slot(11), { approved: true, request_id: request.id, reviewer: { id: "staff-a", role: "staff" } }), { code: "UNAUTHENTICATED" });
});

test("logout revokes the cookie, expired sessions fail, and sign-in failures are rate limited", async () => {
  const cookie = await signIn("b@test.invalid");
  assert.equal((await http("/api/auth/logout", { cookie, body: {} })).status, 200);
  assert.equal((await http("/api/requests", { cookie })).status, 401);
  let clock = Date.now();
  const isolatedAuth = createAuth(accounts, { now: () => clock });
  const session = await isolatedAuth.login("b@test.invalid", password);
  const req = { headers: { cookie: `${SESSION_COOKIE}=${session.token}` } };
  assert.ok(isolatedAuth.userFor(req));
  clock += 8 * 60 * 60 * 1000 + 1;
  assert.equal(isolatedAuth.userFor(req), null);
  for (let i = 0; i < 10; i++) await assert.rejects(() => isolatedAuth.login("no-user@test.invalid", "bad", "test-ip"), { code: "INVALID_CREDENTIALS" });
  await assert.rejects(() => isolatedAuth.login("b@test.invalid", password, "test-ip"), { code: "AUTH_RATE_LIMIT" });
});
