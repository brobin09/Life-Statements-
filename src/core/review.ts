import { makeEntry } from './scoring';
import type { CashFlowEntry, Entry, LineItem, Period } from './types';

/** The period immediately before `periodId` by start date, or null. */
export function previousPeriod(periods: Period[], periodId: string): Period | null {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const i = sorted.findIndex((p) => p.id === periodId);
  return i > 0 ? sorted[i - 1]! : null;
}

/**
 * Entries to create so a new period starts pre-filled with last period's values.
 * Never overwrites an existing entry; skips archived items. Uses each item's *current*
 * targets and weights, since the new period is being scored against today's definitions.
 */
export function prefillEntries(
  items: LineItem[], previous: Entry[], existing: Entry[], periodId: string, now = new Date().toISOString(),
): Entry[] {
  const have = new Set(existing.map((e) => e.lineItemId));
  const prev = new Map(previous.map((e) => [e.lineItemId, e]));
  const out: Entry[] = [];
  for (const item of items) {
    if (item.archived || have.has(item.id)) continue;
    const p = prev.get(item.id);
    if (!p) continue;
    out.push({ ...makeEntry(item, periodId, p.value, '', now), carriedOver: true });
  }
  return out;
}

export function prefillCashflow(previous: CashFlowEntry[], existing: CashFlowEntry[], periodId: string): CashFlowEntry[] {
  const have = new Set(existing.map((c) => c.areaId));
  return previous.filter((c) => !have.has(c.areaId)).map((c) => ({ ...c, periodId, carriedOver: true }));
}

export const carriedOverCount = (entries: Entry[], cf: CashFlowEntry[]) =>
  entries.filter((e) => e.carriedOver).length + cf.filter((c) => c.carriedOver).length;

/** Rough minutes left in a review: about 8 seconds per remaining item, at least 1. */
export function minutesLeft(remainingItems: number): number {
  return Math.max(1, Math.round((remainingItems * 8) / 60));
}
