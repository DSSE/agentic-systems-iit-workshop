import SprintWorkspace from "./workspace";
import type { Board } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialBoard: Board = { tasks: [], members: [] };
  let initialError: string | null = null;
  try {
    const base = process.env.SPRINTBOARD_API_URL ?? "http://127.0.0.1:4000/api";
    const response = await fetch(base + "/tasks", { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("Board unavailable");
    initialBoard = await response.json();
  } catch {
    initialError = "The board is offline. Start the backend on port 4000, then reconnect.";
  }
  return <SprintWorkspace initialBoard={initialBoard} initialError={initialError} />;
}
