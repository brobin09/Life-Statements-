import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../data/db';
import { areaScore, lifeEquity } from '../core/scoring';
import type { Area, CashFlowEntry, Entry, Goal, LineItem, Period } from '../core/types';

export function useWorkspace(periodId: string | null) {
  const areas = useLiveQuery(() => db.areas.orderBy('order').toArray(), []);
  const items = useLiveQuery(() => db.items.toArray(), []);
  const periods = useLiveQuery(() => db.periods.orderBy('start').toArray(), []);
  const entries = useLiveQuery(
    () => (periodId ? db.entries.where('periodId').equals(periodId).toArray() : Promise.resolve([] as Entry[])),
    [periodId]);
  const allEntries = useLiveQuery(() => db.entries.toArray(), []);
  const cashflow = useLiveQuery(() => db.cashflow.toArray(), []);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const dismissed = useLiveQuery(async () => ((await db.meta.get('dismissed'))?.value as string[] | undefined) ?? [], []);
  const ready = !!(goals && dismissed && areas && items && periods && entries && allEntries && cashflow);

  const computed = useMemo(() => {
    if (!ready) return null;
    const active = areas!.filter((a) => !a.archived);
    const scores = active.map((a) => areaScore(a.id, entries!));
    return { active, scores, life: lifeEquity(active, scores) };
  }, [ready, areas, entries]);

  return { ready, areas: areas as Area[] | undefined, items: items as LineItem[] | undefined,
    periods: periods as Period[] | undefined, entries: entries as Entry[] | undefined,
    allEntries: allEntries as Entry[] | undefined, cashflow: cashflow as CashFlowEntry[] | undefined, goals: goals as Goal[] | undefined,
    dismissed: dismissed as string[] | undefined, computed };
}
