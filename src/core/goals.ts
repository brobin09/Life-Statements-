import type { Entry, Goal, Period } from './types';

/** The most recent entry per item at or before the given period (so goals keep tracking between reviews). */
export function latestEntries(entries: Entry[], periods: Period[], periodId: string): Map<string, Entry> {
  const start = new Map(periods.map((p) => [p.id, p.start]));
  const limit = start.get(periodId);
  const out = new Map<string, Entry>();
  for (const e of entries) {
    const s = start.get(e.periodId);
    if (s === undefined || (limit !== undefined && s > limit)) continue;
    const have = out.get(e.lineItemId);
    if (!have || s > start.get(have.periodId)!) out.set(e.lineItemId, e);
  }
  return out;
}

export interface GoalProgress {
  /** 0-1 from baseline to target, or null when it cannot be measured */
  progress: number | null;
  met: boolean;
}

/** Works for both directions: baseline→target is the path, wherever it points. */
export function goalProgress(goal: Goal, current: number | undefined): GoalProgress {
  const { baselineValue: b, targetValue: t } = goal;
  if (current === undefined || b === undefined || t === undefined) return { progress: null, met: false };
  if (b === t) return { progress: current === t ? 1 : 0, met: current === t };
  const p = Math.min(1, Math.max(0, (current - b) / (t - b)));
  return { progress: Math.round(p * 1000) / 1000, met: p >= 1 };
}
