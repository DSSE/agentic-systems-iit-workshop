// Client-side helpers for building/display explicit-offset ISO timestamps
// in the campus timezone, without letting the browser's own timezone get
// involved. Keep CAMPUS_TZ_OFFSET in sync with server/src/config.js.
export const CAMPUS_TZ_OFFSET = "+06:00";

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Build an explicit-offset ISO timestamp from local campus wall-clock
 * fields (a <input type="date"> value, a <input type="time"> value, and
 * minutes to add), never from the browser's real clock/timezone. */
export function buildIso(dateStr, timeStr, addMinutes = 0) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const pseudo = new Date(Date.UTC(y, m - 1, d, hh, mm, 0) + addMinutes * 60000);
  return (
    `${pseudo.getUTCFullYear()}-${pad(pseudo.getUTCMonth() + 1)}-${pad(pseudo.getUTCDate())}` +
    `T${pad(pseudo.getUTCHours())}:${pad(pseudo.getUTCMinutes())}:00${CAMPUS_TZ_OFFSET}`
  );
}

/** Display an explicit-offset ISO timestamp a little more readably. */
export function formatIso(iso) {
  return iso.replace("T", " ").replace(CAMPUS_TZ_OFFSET, ` (UTC${CAMPUS_TZ_OFFSET})`);
}
