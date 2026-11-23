import { areaScore, incomeScore, lifeEquity } from './scoring';
import type { Area, Entry, Period } from './types';

export interface TrendPoint { periodId: string; label: string; value: number | null }
export interface Trends { life: TrendPoint[]; areas: Record<string, TrendPoint[]> }

/** "Oct 26" style label from a period's start date. */
export function shortLabel(p: Period): string {
  const d = new Date(p.start + 'T00:00:00Z');
  const m = d.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
  return p.kind === 'month' ? `${m} ’${String(d.getUTCFullYear()).slice(2)}` : p.label;
}

/**
 * Equity per period, overall and per area. Uses each entry's own snapshot for item
 * scores, and the areas' current weights for roll-up.
 */
export function computeTrends(areas: Area[], periods: Period[], entries: Entry[]): Trends {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const byPeriod = new Map<string, Entry[]>();
  for (const e of entries) (byPeriod.get(e.periodId) ?? byPeriod.set(e.periodId, []).get(e.periodId)!).push(e);
  const active = areas.filter((a) => !a.archived);
  const life: TrendPoint[] = []; const per: Record<string, TrendPoint[]> = Object.fromEntries(areas.map((a) => [a.id, []]));
  for (const p of sorted) {
    const es = byPeriod.get(p.id) ?? [];
    const scores = areas.map((a) => areaScore(a.id, es));
    const label = shortLabel(p);
    const hasData = es.length > 0;
    life.push({ periodId: p.id, label, value: hasData ? lifeEquity(active, scores.filter((s) => active.some((a) => a.id === s.areaId))).breakdown.value : null });
    scores.forEach((s) => per[s.areaId]!.push({ periodId: p.id, label, value: s.equity.value }));
  }
  return { life, areas: per };
}

/** Overall period result (income statement) per period. Null where a period has no inflow/outflow data. */
export function computeIncomeTrend(areas: Area[], periods: Period[], entries: Entry[]): TrendPoint[] {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const active = areas.filter((a) => !a.archived);
  return sorted.map((p) => {
    const es = entries.filter((e) => e.periodId === p.id);
    const scores = active.map((a) => incomeScore(a.id, es));
    return { periodId: p.id, label: shortLabel(p), value: lifeEquity(active, scores, 'Period result').breakdown.value };
  });
}
