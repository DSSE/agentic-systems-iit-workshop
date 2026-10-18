export interface Equipment {
  id: string;
  name: string;
  stock: number;
  available: number;
  notes?: string;
}

export interface Loan {
  id: string;
  studentId: string;
  itemId: string;
  quantity: number;
  days: number;
  status: 'active' | 'returned';
  createdAt: string;
}

export interface LoanRequest {
  studentId: string;
  itemId: string;
  quantity: number;
  days: number;
}

export interface Violation {
  code: string;
  reason: string;
}

export type Proposal = LoanRequest & { itemName: string };

export type CheckResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; code: string; reason: string; violations: Violation[] };

export type CreateResult = { ok: true; loan: Loan } | Extract<CheckResult, { ok: false }>;

async function send<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // 422 carries a rule refusal as JSON; anything else unexpected is an error.
  if (!res.ok && res.status !== 422) throw new Error(`Server error (${res.status})`);
  return res.json() as Promise<T>;
}

export const listEquipment = async (): Promise<Equipment[]> => (await fetch('/api/equipment')).json();

export const listLoans = async (studentId: string): Promise<Loan[]> =>
  (await fetch(`/api/loans?studentId=${encodeURIComponent(studentId)}`)).json();

export const checkStock = (req: LoanRequest) => send<CheckResult>('/api/loans/check', req);

export const createLoan = (req: LoanRequest) => send<CreateResult>('/api/loans', { ...req, approved: true });
