import { db } from './db';
import { DEFAULT_AREAS, STARTER_TEMPLATES, TEMPLATES, type Template } from './templates';
import { makeEntry } from '../core/scoring';
import { prefillCashflow, prefillEntries, previousPeriod } from '../core/review';
import type { Area, CashFlowEntry, Entry, Goal, LineItem, Period } from '../core/types';
import type { Suggestion } from '../core/suggestions';

import { uid } from './id';

export function itemFromTemplate(t: Template, areaId = t.areaId): LineItem {
  const { key, sample: _s, ...rest } = t;
  return { ...rest, id: `${key}-${uid().slice(0, 6)}`, areaId, templateId: key, archived: false };
}

const monthPeriod = (y: number, m: number, intended: Record<string, number>): Period => {
  const start = new Date(Date.UTC(y, m, 1)); const end = new Date(Date.UTC(y, m + 1, 0));
  return {
    id: `m-${y}-${String(m + 1).padStart(2, '0')}`, kind: 'month',
    start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10),
    label: start.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    status: 'closed', intendedHoursByArea: intended,
  };
};

/** Replace everything with a fictional person's last three months. */
export async function seedSampleData(): Promise<void> {
  await clearAll();
  const intended = Object.fromEntries(DEFAULT_AREAS.map((a) => [a.id, a.intendedWeeklyHours]));
  const periods = [monthPeriod(2026, 7, intended), monthPeriod(2026, 8, intended), monthPeriod(2026, 9, intended)];
  const items: LineItem[] = []; const entries: Entry[] = [];
  for (const t of STARTER_TEMPLATES) {
    const item = { ...itemFromTemplate(t), id: t.key };
    items.push(item);
    periods.forEach((p, i) => entries.push(makeEntry(item, p.id, t.sample![i]!, '', `${p.end}T12:00:00.000Z`)));
  }
  const actual: Record<string, [number, number][]> = {
    // [hours, energy] per month
    finances: [[2, 4], [2, 5], [3, 5]], health: [[3, 5], [4, 5], [5, 6]],
    relationships: [[8, 7], [9, 7], [10, 7]], career: [[52, 4], [50, 4], [46, 5]],
    learning: [[1, 6], [2, 6], [3, 7]], home: [[7, 3], [6, 4], [6, 4]],
    meaning: [[1, 6], [2, 6], [2, 7]], recreation: [[10, 5], [9, 5], [9, 5]],
  };
  const cashflow = periods.flatMap((p, i) => DEFAULT_AREAS.map((a) => {
    const [h, e] = actual[a.id]![i]!;
    return { periodId: p.id, areaId: a.id, actualWeeklyHours: h, energy: e };
  }));
  await db.transaction('rw', [db.areas, db.items, db.periods, db.entries, db.cashflow, db.goals, db.meta], async () => {
    await db.areas.bulkAdd(DEFAULT_AREAS); await db.items.bulkAdd(items);
    await db.periods.bulkAdd(periods); await db.entries.bulkAdd(entries);
    await db.cashflow.bulkAdd(cashflow);
    await db.goals.bulkAdd(sampleGoals());
    await db.meta.put({ key: 'sample', value: true });
  });
}

const sampleGoals = (): Goal[] => [
  { id: 'g-sample-1', areaId: 'finances', lineItemId: 'fin-savings', status: 'active', createdAt: '2026-10-31T12:00:00.000Z',
    title: 'Set up a small automatic transfer to savings on payday',
    baselineValue: 8000, targetValue: 10000, dueDate: '2027-01-31', fromSuggestionId: 'fin-savings:step' },
  { id: 'g-sample-2', areaId: 'health', lineItemId: 'hl-exercise', status: 'active', createdAt: '2026-10-31T12:00:00.000Z',
    title: 'Book two short sessions this week at fixed times',
    baselineValue: 3, targetValue: 4, fromSuggestionId: 'hl-exercise:step' },
];

/** Empty workspace with the default areas and no items, for starting fresh. */
export async function startFresh(): Promise<void> {
  await clearAll();
  const intended = Object.fromEntries(DEFAULT_AREAS.map((a) => [a.id, a.intendedWeeklyHours]));
  const now = new Date();
  await db.areas.bulkAdd(DEFAULT_AREAS);
  await db.periods.add({ ...monthPeriod(now.getFullYear(), now.getMonth(), intended), status: 'draft' });
  await db.meta.put({ key: 'sample', value: false });
}

export async function clearAll(): Promise<void> {
  await Promise.all([db.areas.clear(), db.items.clear(), db.periods.clear(), db.entries.clear(),
    db.cashflow.clear(), db.goals.clear(), db.meta.clear()]);
}

let initialising: Promise<void> | null = null;
/** Safe to call repeatedly (React StrictMode runs effects twice in development). */
export function ensureInitialised(): Promise<void> {
  initialising ??= (async () => { if ((await db.areas.count()) === 0) await seedSampleData(); })();
  return initialising;
}

/**
 * Save an item definition. Entries in draft periods are re-snapshotted so the current
 * period reflects new targets; closed periods keep what they recorded.
 */
export async function saveItem(item: LineItem): Promise<void> {
  await db.transaction('rw', db.items, db.entries, db.periods, async () => {
    await db.items.put(item);
    const drafts = new Set((await db.periods.toArray()).filter((p) => p.status === 'draft').map((p) => p.id));
    const mine = await db.entries.where('lineItemId').equals(item.id).toArray();
    for (const e of mine.filter((e) => drafts.has(e.periodId))) {
      await db.entries.put(makeEntry(item, e.periodId, e.value, e.note, e.recordedAt));
    }
  });
}

export async function saveValue(item: LineItem, periodId: string, value: number | null, note?: string): Promise<void> {
  const id = `${periodId}:${item.id}`;
  const existing = await db.entries.get(id);
  if (value === null) { await db.entries.delete(id); return; }
  if (existing) {
    await db.entries.put({ ...existing, value, carriedOver: false, note: note ?? existing.note, recordedAt: new Date().toISOString() });
  } else {
    await db.entries.put(makeEntry(item, periodId, value, note ?? ''));
  }
}

export async function saveNote(item: LineItem, periodId: string, note: string): Promise<void> {
  const e = await db.entries.get(`${periodId}:${item.id}`);
  if (e) await db.entries.put({ ...e, note });
}

export async function saveArea(a: Area): Promise<void> { await db.areas.put(a); }

export async function addArea(name: string): Promise<void> {
  const order = (await db.areas.count());
  await db.areas.add({ id: `area-${uid().slice(0, 6)}`, name, weight: 5, intendedWeeklyHours: 0, order, archived: false });
}

export async function newPeriod(): Promise<string> {
  const periods = await db.periods.orderBy('start').toArray();
  const last = periods[periods.length - 1];
  const base = last ? new Date(last.end + 'T00:00:00Z') : new Date();
  const intended = Object.fromEntries((await db.areas.toArray()).map((a) => [a.id, a.intendedWeeklyHours]));
  const p = monthPeriod(base.getUTCFullYear(), base.getUTCMonth() + (last ? 1 : 0), intended);
  p.status = 'draft';
  await db.periods.put(p);
  await startReview(p.id);
  return p.id;
}

/** Pre-fill a period from the one before it. Idempotent: only fills what is missing. */
export async function startReview(periodId: string): Promise<void> {
  const periods = await db.periods.toArray();
  const prev = previousPeriod(periods, periodId);
  if (!prev) return;
  await db.transaction('rw', [db.items, db.entries, db.cashflow], async () => {
    const [items, prevEntries, existing, prevCf, existingCf] = await Promise.all([
      db.items.toArray(),
      db.entries.where('periodId').equals(prev.id).toArray(),
      db.entries.where('periodId').equals(periodId).toArray(),
      db.cashflow.where('periodId').equals(prev.id).toArray(),
      db.cashflow.where('periodId').equals(periodId).toArray(),
    ]);
    await db.entries.bulkPut(prefillEntries(items, prevEntries, existing, periodId));
    await db.cashflow.bulkPut(prefillCashflow(prevCf, existingCf, periodId));
  });
}

export async function closePeriod(periodId: string): Promise<void> {
  await db.periods.update(periodId, { status: 'closed' });
}

export async function reopenPeriod(periodId: string): Promise<void> {
  await db.periods.update(periodId, { status: 'draft' });
}

/** Mark carried-over values as confirmed (still accurate). */
export async function confirmUnchanged(periodId: string, areaId: string): Promise<void> {
  await db.transaction('rw', [db.entries, db.cashflow], async () => {
    const es = (await db.entries.where('periodId').equals(periodId).toArray())
      .filter((e) => e.carriedOver && e.snapshot.areaId === areaId);
    await db.entries.bulkPut(es.map((e) => ({ ...e, carriedOver: false })));
    const c = await db.cashflow.get([periodId, areaId]);
    if (c?.carriedOver) await db.cashflow.put({ ...c, carriedOver: false });
  });
}

export async function confirmEntry(item: LineItem, periodId: string): Promise<void> {
  const e = await db.entries.get(`${periodId}:${item.id}`);
  if (e) await db.entries.put({ ...e, carriedOver: false });
}

export async function saveCashflow(periodId: string, areaId: string, patch: Partial<Pick<CashFlowEntry, 'actualWeeklyHours' | 'energy'>>): Promise<void> {
  const cur = (await db.cashflow.get([periodId, areaId])) ?? { periodId, areaId, actualWeeklyHours: 0, energy: 5 };
  await db.cashflow.put({ ...cur, ...patch, carriedOver: false });
}

export const TEMPLATE_BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

// ---------- goals and suggestions ----------

export async function acceptSuggestion(sg: Suggestion): Promise<void> {
  await db.goals.put({
    id: `goal-${uid().slice(0, 8)}`, areaId: sg.areaId, lineItemId: sg.lineItemId, title: sg.title,
    baselineValue: sg.baselineValue, targetValue: sg.targetValue, rationale: sg.rationale,
    fromSuggestionId: sg.id, status: 'active', createdAt: new Date().toISOString(),
  });
}

export async function saveGoal(g: Goal): Promise<void> { await db.goals.put(g); }
export async function deleteGoal(id: string): Promise<void> { await db.goals.delete(id); }

export async function addCustomGoal(g: { areaId: string; title: string; lineItemId?: string; baselineValue?: number; targetValue?: number }): Promise<void> {
  await db.goals.put({ ...g, id: `goal-${uid().slice(0, 8)}`, status: 'active', createdAt: new Date().toISOString() });
}

export async function dismissSuggestion(id: string): Promise<void> {
  const cur = ((await db.meta.get('dismissed'))?.value as string[] | undefined) ?? [];
  if (!cur.includes(id)) await db.meta.put({ key: 'dismissed', value: [...cur, id] });
}

export async function restoreDismissed(): Promise<void> { await db.meta.delete('dismissed'); }

// ---------- backup ----------

const TABLES = ['areas', 'items', 'periods', 'entries', 'cashflow', 'goals', 'meta'] as const;

export async function exportAll(): Promise<string> {
  const data: Record<string, unknown> = { app: 'life-statements', version: 1, exportedAt: new Date().toISOString() };
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return JSON.stringify(data, null, 2);
}

/** Replace everything with a backup. Throws with a readable message when the file is not a valid backup. */
export async function importAll(text: string): Promise<void> {
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (data.app !== 'life-statements' || data.version !== 1) throw new Error('That file is not a Life Statements backup.');
  for (const t of TABLES) if (!Array.isArray(data[t])) throw new Error(`The backup is missing its "${t}" data.`);
  const ok = (data.entries as Entry[]).every((e) => e && typeof e.id === 'string' && typeof e.periodId === 'string' && typeof e.value === 'number' && e.snapshot);
  if (!ok) throw new Error('Some entries in the backup are malformed.');
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) { await db.table(t).clear(); await db.table(t).bulkAdd(data[t] as never[]); }
  });
}
