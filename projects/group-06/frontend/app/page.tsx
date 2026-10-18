"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveAssignment,
  CapacityPreview,
  fetchBoard,
  Member,
  previewCapacity,
  Task,
} from "@/lib/api";

const MAX_POINTS = 8;

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedMember, setSelectedMember] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, CapacityPreview | undefined>>({});
  const [statusByTask, setStatusByTask] = useState<Record<string, string>>({});
  const [busyTask, setBusyTask] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      const board = await fetchBoard();
      setTasks(board.tasks);
      setMembers(board.members);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load the board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  async function handleSelectMember(task: Task, memberId: string) {
    setSelectedMember((s) => ({ ...s, [task.id]: memberId }));
    setStatusByTask((s) => ({ ...s, [task.id]: "" }));

    if (!memberId) {
      setPreviews((p) => ({ ...p, [task.id]: undefined }));
      return;
    }

    try {
      const preview = await previewCapacity(memberId, task.points);
      setPreviews((p) => ({ ...p, [task.id]: preview }));
    } catch (err) {
      setStatusByTask((s) => ({
        ...s,
        [task.id]: err instanceof Error ? err.message : "Failed to preview capacity",
      }));
    }
  }

  async function handleApprove(task: Task) {
    const memberId = selectedMember[task.id];
    if (!memberId) return;

    setBusyTask(task.id);
    try {
      const result = await approveAssignment(task.id, memberId);
      if (result.ok) {
        setStatusByTask((s) => ({ ...s, [task.id]: "Assigned." }));
        await loadBoard();
      } else {
        setStatusByTask((s) => ({ ...s, [task.id]: `Refused: ${result.reason}` }));
      }
    } catch (err) {
      setStatusByTask((s) => ({
        ...s,
        [task.id]: err instanceof Error ? err.message : "Failed to assign the task",
      }));
    } finally {
      setBusyTask(null);
    }
  }

  if (loading) {
    return (
      <main>
        <p>Loading the board…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main>
        <h1>SprintBoard</h1>
        <p className="preview-refused">
          {loadError}. Is the backend running at {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}?
        </p>
      </main>
    );
  }

  const backlog = tasks.filter((t) => !t.assignee);
  const assigned = tasks.filter((t) => t.assignee);

  return (
    <main>
      <h1>SprintBoard</h1>
      <p className="subtitle">Nothing saves until you click Approve. No one carries more than {MAX_POINTS} points.</p>

      <section>
        <h2>Members</h2>
        <div className="members">
          {members.map((m) => {
            const full = m.points >= MAX_POINTS;
            return (
              <div className="member-card" key={m.id}>
                <div className="name">{m.name}</div>
                <div>{m.points} / {MAX_POINTS} pts</div>
                <div className="bar">
                  <div
                    className={`bar-fill${full ? " full" : ""}`}
                    style={{ width: `${Math.min(100, (m.points / MAX_POINTS) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Backlog</h2>
        {backlog.length === 0 ? (
          <p className="empty">All tasks are assigned.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Points</th>
                <th>Assign to</th>
                <th>Preview</th>
                <th>Approve</th>
              </tr>
            </thead>
            <tbody>
              {backlog.map((task) => {
                const preview = previews[task.id];
                const canApprove = !!preview?.ok && !!selectedMember[task.id];
                return (
                  <tr key={task.id}>
                    <td>
                      <div>{task.title}</div>
                      <div className="task-desc">{task.description}</div>
                    </td>
                    <td>{task.points}</td>
                    <td>
                      <select
                        value={selectedMember[task.id] ?? ""}
                        onChange={(e) => handleSelectMember(task, e.target.value)}
                      >
                        <option value="">Select member</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {preview && (
                        <span className={preview.ok ? "preview-ok" : "preview-refused"}>
                          {preview.ok ? "OK" : "Refused"} — {preview.projected}/{preview.max} pts
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="approve"
                        disabled={!canApprove || busyTask === task.id}
                        onClick={() => handleApprove(task)}
                      >
                        {busyTask === task.id ? "Saving…" : "Approve"}
                      </button>
                      {statusByTask[task.id] && (
                        <div
                          className={`status-line ${
                            statusByTask[task.id].startsWith("Refused") ? "preview-refused" : "preview-ok"
                          }`}
                        >
                          {statusByTask[task.id]}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Assigned</h2>
        {assigned.length === 0 ? (
          <p className="empty">No tasks assigned yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Points</th>
                <th>Member</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.points}</td>
                  <td>{members.find((m) => m.id === task.assignee)?.name ?? task.assignee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
