import { readBoard } from "../data/store";

export interface ListTasksResult {
  tasks: ReturnType<typeof readBoard>["tasks"];
  members: ReturnType<typeof readBoard>["members"];
}

export function listTasks(): ListTasksResult {
  const { tasks, members } = readBoard();
  return { tasks, members };
}
