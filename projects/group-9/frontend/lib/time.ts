export const TIME_ZONE = "Asia/Dhaka";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const isoDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const fmtTime = (iso: string) => timeFormat.format(new Date(iso));
export const fmtDay = (iso: string) => dayFormat.format(new Date(iso));
export const todayInDhaka = () => isoDateFormat.format(new Date());

/** Split an ISO time into the form's date (YYYY-MM-DD) and time (HH:MM), in Dhaka time. */
export function localParts(iso: string): { date: string; time: string } {
  const instant = new Date(iso);
  return { date: isoDateFormat.format(instant), time: timeFormat.format(instant) };
}

/** Minutes from start to end, both "HH:MM" on the same day. */
export function minutesBetween(start: string, end: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(end) - toMinutes(start);
}
