export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(url.endsWith("/chat") ? 90000 : 15000) });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new Error(timeout
      ? "The board took too long to respond. Please try again."
      : "Cannot reach the board. Check that the backend is running, then retry.");
  }
}

export interface Task {
  id: string;
  title: string;
  description: string;
  points: number;
  assignee: string | null;
}

export interface Member {
  id: string;
  name: string;
  points: number;
}

export interface Board {
  tasks: Task[];
  members: Member[];
}

export interface CapacityPreview {
  ok: boolean;
  current: number;
  projected: number;
  max: number;
}

export interface PendingProposal {
  status: "pending_approval";
  proposalId: string;
  taskId: string;
  memberId: string;
  taskTitle: string;
  memberName: string;
  points: number;
  current: number;
  projected: number;
  max: number;
  approvalUrl: string;
}

export type ApprovalSession =
  | { authenticated: false }
  | { authenticated: true; csrfToken: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly proposal?: PendingProposal,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readResponse<T>(res: Response): Promise<T> {
  let body;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`The board returned an unexpected response (${res.status}). Please retry.`, res.status);
  }
  if (!body || typeof body !== "object") {
    throw new ApiError("The board returned an invalid response. Please retry.", res.status);
  }
  if (!res.ok || body.ok === false) {
    throw new ApiError(body.reason ?? `Request failed (${res.status})`, res.status, body.code, body.proposal);
  }
  return body;
}

export async function fetchBoard(): Promise<Board> {
  return readResponse<Board>(await apiFetch(`${API_URL}/tasks`, { cache: "no-store" }));
}

// Read-only: safe to call for a live preview before anyone clicks Approve.
export async function previewCapacity(memberId: string, additionalPoints: number): Promise<CapacityPreview> {
  const res = await apiFetch(`${API_URL}/check-capacity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId, additionalPoints }),
  });
  // Insufficient capacity is a valid preview, rather than a failed request.
  if (!res.ok) return readResponse<CapacityPreview>(res);
  return res.json();
}

export async function fetchApprovalSession(): Promise<ApprovalSession> {
  return readResponse<ApprovalSession>(await apiFetch(`${API_URL}/approval-session`, {
    credentials: "include",
    cache: "no-store",
  }));
}

export async function startApprovalSession(code: string): Promise<ApprovalSession> {
  return readResponse<ApprovalSession>(await apiFetch(`${API_URL}/approval-session`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }));
}

export async function fetchProposals(): Promise<PendingProposal[]> {
  const result = await readResponse<{ proposals: PendingProposal[] }>(
    await apiFetch(`${API_URL}/proposals`, { cache: "no-store" }),
  );
  return result.proposals;
}

// Creates a pending request only; the board remains unchanged.
export async function proposeAssignment(taskId: string, memberId: string): Promise<PendingProposal> {
  return readResponse<PendingProposal>(await apiFetch(`${API_URL}/proposals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, memberId }),
  }));
}

// Only a human's Approve click sends the session and the displayed snapshot.
export async function approveProposal(proposal: PendingProposal, csrfToken: string): Promise<{ ok: true; task: Task }> {
  return readResponse<{ ok: true; task: Task }>(await apiFetch(
    `${API_URL}/proposals/${encodeURIComponent(proposal.proposalId)}/approve`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ expectedCurrent: proposal.current, expectedPoints: proposal.points }),
    },
  ));
}

export async function rejectProposal(proposalId: string, csrfToken: string): Promise<{ ok: true }> {
  return readResponse<{ ok: true }>(await apiFetch(
    `${API_URL}/proposals/${encodeURIComponent(proposalId)}/reject`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: "{}",
    },
  ));
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatReply {
  message: string;
  mode: "local" | "llm";
  proposals: PendingProposal[];
  refusals: { taskTitle: string; memberName: string; reason: string; code: string }[];
}

export async function fetchChatStatus(): Promise<{ mode: "local" | "llm"; model: string | null }> {
  return readResponse(await apiFetch(`${API_URL}/chat/status`, { cache: "no-store" }));
}

export async function sendChat(message: string, history: ChatMessage[]): Promise<ChatReply> {
  return readResponse<ChatReply>(await apiFetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: history.slice(-12) }),
  }));
}
