export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDurationHM(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

let serverOffsetMs = 0;

export function setServerOffset(offsetMs: number) {
  serverOffsetMs = offsetMs;
}

export function getServerNow(): number {
  return Date.now() + serverOffsetMs;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function calcNetMs(entry: {
  started_at: string;
  stopped_at: string | null;
  time_entry_pauses?: { started_at: string; ended_at: string | null }[];
}): number {
  const end = entry.stopped_at ? new Date(entry.stopped_at).getTime() : getServerNow();
  const start = new Date(entry.started_at).getTime();
  let gross = end - start;
  if (entry.time_entry_pauses) {
    for (const p of entry.time_entry_pauses) {
      const pEnd = p.ended_at ? new Date(p.ended_at).getTime() : getServerNow();
      gross -= pEnd - new Date(p.started_at).getTime();
    }
  }
  return gross;
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function startOfWeek(d = new Date()): Date {
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - day);
  return r;
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
