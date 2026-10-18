export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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

export type AssignResult = { ok: true; task: Task } | { ok: false; reason: string };

export async function fetchBoard(): Promise<Board> {
  const res = await fetch(`${API_URL}/tasks`);
  if (!res.ok) throw new Error(`Failed to load the board (${res.status})`);
  return res.json();
}

// Read-only: safe to call for a live preview before anyone clicks Approve.
export async function previewCapacity(memberId: string, additionalPoints: number): Promise<CapacityPreview> {
  const res = await fetch(`${API_URL}/check-capacity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId, additionalPoints }),
  });
  if (!res.ok) throw new Error(`Failed to check capacity (${res.status})`);
  return res.json();
}

// The only call that writes to data.json. Call this only after the user
// clicks Approve.
export async function approveAssignment(taskId: string, memberId: string): Promise<AssignResult> {
  const res = await fetch(`${API_URL}/assign-task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, memberId }),
  });
  return res.json();
}
