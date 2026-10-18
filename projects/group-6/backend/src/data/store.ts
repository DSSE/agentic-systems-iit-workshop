import fs from "fs";
import path from "path";

// Overridable so tests can point at a throwaway fixture instead of the
// real data.json.
const DATA_PATH = process.env.SPRINTBOARD_DATA_PATH ?? path.join(__dirname, "..", "..", "data.json");

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

export function readBoard(): Board {
  const raw = fs.readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as Board;
}

// The only function in the codebase allowed to write data.json.
// Every write goes through assignTask, which only calls this after
// the hard rule has been re-checked.
export function writeBoard(board: Board): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(board, null, 2));
}
