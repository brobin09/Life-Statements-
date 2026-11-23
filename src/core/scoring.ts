import type {
  Area, Breakdown, CashFlowEntry, Direction, Entry, LineItem, Period, ScoringParams, Section, Settings,
} from './types';
import { DEFAULT_SETTINGS } from './types';

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ---------- item health ----------

/** Sensible "scores 0" default for a 1-10 rating. */
export function defaultQualitativeWorst(direction: Direction): number {
  return direction === 'lower' ? 10 : 1;
}

export function itemHealth(value: number, p: Pick<ScoringParams, 'direction' | 'target' | 'worst' | 'tolerance'>): Breakdown {
  if (!Number.isFinite(value)) throw new Error('value must be a finite number');
  const { direction, target, worst } = p;
  const label = 'Item health';

  if (direction === 'range') {
    const tol = p.tolerance ?? 0;
    const dist = Math.max(0, Math.abs(value - target) - tol);
    const span = Math.abs(worst - target) - tol;
    const health = span <= 0 ? (dist === 0 ? 100 : 0) : clamp(1 - dist / span, 0, 1) * 100;
    return {
      label, value: r1(health), inputs: [],
      formula: `range: ${value} is ${r1(dist)} outside ${target}±${tol}; 0 points at ${worst} (${r1(span)} away) → ${r1(health)}`,
    };
  }

  // 'higher' and 'lower' share one formula: the signs of (value-worst) and (target-worst) cancel.
  const denom = target - worst;
  const progress = denom === 0 ? (value === target ? 1 : 0) : (value - worst) / denom;
  const health = clamp(progress, 0, 1) * 100;
  return {
    label, value: r1(health), inputs: [],
    formula: `(${value} − ${worst}) ÷ (${target} − ${worst}) = ${r1(progress * 100)}%, capped to 0–100 → ${r1(health)}`,
  };
}

export const entryHealth = (e: Entry): Breakdown => itemHealth(e.value, e.snapshot);

// ---------- weighted averages ----------

export interface Weighted { value: number; weight: number; label: string }

export function weightedAverage(label: string, items: Weighted[]): Breakdown {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (items.length === 0 || total <= 0) {
    return { label, value: null, formula: 'no items', inputs: [] };
  }
  const avg = items.reduce((s, i) => s + i.value * i.weight, 0) / total;
  return {
    label, value: r1(avg),
    formula: `Σ(score × weight) ÷ Σ(weight) = ${r1(avg)}`,
    inputs: items.map((i) => ({ label: `${i.label} (weight ${i.weight})`, value: i.value, formula: '', inputs: [] })),
  };
}

// ---------- area scores ----------

export type AreaCase = 'both' | 'assets-only' | 'liabilities-only' | 'no-data';

export interface AreaScore {
  areaId: string;
  assetStrength: Breakdown;
  liabilityBurden: Breakdown;
  /** 0-100, 50 = break-even; null when the area has no balance-sheet data */
  equity: Breakdown;
  case: AreaCase;
}

interface NetSpec {
  pos: Section; neg: Section;
  posLabel: string; negLabel: string; negHealthLabel: string; netLabel: string;
  posWord: string; negNoun: string; posNoun: string; netWord: string; negHealthWord: string;
  letters: [string, string];
}

function netScore(areaId: string, entries: Entry[], k: NetSpec): AreaScore {
  const mine = entries.filter((e) => e.snapshot.areaId === areaId);
  const side = (s: Section) =>
    mine.filter((e) => e.snapshot.section === s).map((e) => ({
      value: entryHealth(e).value as number, weight: e.snapshot.weight, label: e.snapshot.name,
    }));

  const assetStrength = weightedAverage(k.posLabel, side(k.pos));
  const liabHealth = weightedAverage(k.negHealthLabel, side(k.neg));
  const A = assetStrength.value;
  const L = liabHealth.value;
  const B = L === null ? null : r1(100 - L);
  const liabilityBurden: Breakdown = {
    label: k.negLabel, value: B,
    formula: L === null ? `no ${k.negNoun}` : `100 − ${k.negHealthWord} ${L} = ${B}`,
    inputs: liabHealth.inputs,
  };

  let kase: AreaCase; let equity: number | null; let formula: string;
  const [la, lb] = k.letters;
  if (A !== null && B !== null) {
    kase = 'both'; equity = r1((A - B + 100) / 2);
    formula = `(${la} − ${lb} + 100) ÷ 2 = (${A} − ${B} + 100) ÷ 2 = ${equity}. 50 is break-even.`;
  } else if (A !== null) {
    kase = 'assets-only'; equity = A;
    formula = `No ${k.negNoun} recorded, so ${k.netWord} = ${k.posWord} = ${A}`;
  } else if (L !== null) {
    kase = 'liabilities-only'; equity = L;
    formula = `No ${k.posNoun} recorded, so ${k.netWord} = ${k.negHealthWord} = ${L}`;
  } else {
    kase = 'no-data'; equity = null; formula = `no ${k.posNoun} or ${k.negNoun}`;
  }
  return {
    areaId, assetStrength, liabilityBurden, case: kase,
    equity: { label: k.netLabel, value: equity, formula, inputs: [assetStrength, liabilityBurden] },
  };
}

/** Balance-sheet items only (assets and liabilities) for one area, in one period. */
export function areaScore(areaId: string, entries: Entry[]): AreaScore {
  return netScore(areaId, entries, {
    pos: 'asset', neg: 'liability', posLabel: 'Asset strength (A)', negLabel: 'Liability burden (B)',
    negHealthLabel: 'Liability health', netLabel: 'Area equity', posWord: 'asset strength',
    posNoun: 'assets', negNoun: 'liabilities', netWord: 'equity', negHealthWord: 'liability health', letters: ['A', 'B'],
  });
}

/**
 * Income-statement result for one area and period: the same method applied to inflows and
 * outflows. In the returned shape, assetStrength is inflow strength (I), liabilityBurden is
 * outflow drag (D) and equity is the period result (50 = break-even).
 */
export function incomeScore(areaId: string, entries: Entry[]): AreaScore {
  return netScore(areaId, entries, {
    pos: 'inflow', neg: 'outflow', posLabel: 'Inflow strength (I)', negLabel: 'Outflow drag (D)',
    negHealthLabel: 'Outflow health', netLabel: 'Period result', posWord: 'inflow strength',
    posNoun: 'inflows', negNoun: 'outflows', netWord: 'result', negHealthWord: 'outflow health', letters: ['I', 'D'],
  });
}

export interface UnitTotal { unit: string; inflow: number; outflow: number; net: number }

/** Literal totals for money ($) and hours, the units where adding items up means something. */
export function unitTotals(entries: Entry[]): UnitTotal[] {
  const acc = new Map<string, UnitTotal>();
  for (const e of entries) {
    const u0 = e.snapshot.unit?.trim();
    if (!u0 || (e.snapshot.section !== 'inflow' && e.snapshot.section !== 'outflow')) continue;
    const unit = u0 === '$' ? '$' : isHours(u0) ? 'hours' : null;
    if (!unit) continue;
    const t = acc.get(unit) ?? { unit, inflow: 0, outflow: 0, net: 0 };
    if (e.snapshot.section === 'inflow') t.inflow += e.value; else t.outflow += e.value;
    t.net = Math.round((t.inflow - t.outflow) * 100) / 100;
    acc.set(unit, t);
  }
  return [...acc.values()];
}

export function lifeEquity(areas: Area[], scores: AreaScore[], label = 'Life equity'): { breakdown: Breakdown; excluded: string[] } {
  const byId = new Map(scores.map((s) => [s.areaId, s]));
  const used: Weighted[] = []; const excluded: string[] = [];
  for (const a of areas.filter((x) => !x.archived)) {
    const v = byId.get(a.id)?.equity.value ?? null;
    if (v === null) excluded.push(a.name); else used.push({ value: v, weight: a.weight, label: a.name });
  }
  return { breakdown: weightedAverage(label, used), excluded };
}

// ---------- ratios ----------

export interface Ratio { label: string; value: number | null; formula: string }

export const isHours = (u?: string) => !!u && /^(h|hr|hrs|hour|hours)(\/(wk|week))?$/i.test(u.trim());

/** Hours on liabilities+outflows vs assets+inflows, from quantitative items measured in hours. */
export function drainToBuildRatio(entries: Entry[]): Ratio {
  let drain = 0; let build = 0;
  for (const e of entries) {
    if (!isHours(e.snapshot.unit)) continue;
    if (e.snapshot.section === 'liability' || e.snapshot.section === 'outflow') drain += e.value;
    else build += e.value;
  }
  return {
    label: 'Time on liabilities vs assets',
    value: build > 0 ? r1(drain / build) : null,
    formula: `${drain} h on liabilities/outflows ÷ ${build} h on assets/inflows`,
  };
}

/** Recovery = hours in areas whose energy rating is 6+, strain = hours in areas rated 5 or lower. */
export function recoveryStrainRatio(cf: CashFlowEntry[]): Ratio {
  const rec = cf.filter((c) => c.energy >= 6).reduce((s, c) => s + c.actualWeeklyHours, 0);
  const strain = cf.filter((c) => c.energy <= 5).reduce((s, c) => s + c.actualWeeklyHours, 0);
  return {
    label: 'Recovery vs strain',
    value: strain > 0 ? r1(rec / strain) : null,
    formula: `${rec} h in energy-giving areas (6+) ÷ ${strain} h in draining areas (≤5)`,
  };
}

export interface IntendedActual { areaId: string; intended: number; actual: number; gap: number; ratio: number | null }

export function intendedVsActual(period: Period, cf: CashFlowEntry[]): { rows: IntendedActual[]; total: Ratio } {
  const ids = new Set([...Object.keys(period.intendedHoursByArea), ...cf.map((c) => c.areaId)]);
  const rows = [...ids].map((areaId) => {
    const intended = period.intendedHoursByArea[areaId] ?? 0;
    const actual = cf.find((c) => c.areaId === areaId)?.actualWeeklyHours ?? 0;
    return { areaId, intended, actual, gap: r1(actual - intended), ratio: intended > 0 ? r1(actual / intended) : null };
  });
  const ti = rows.reduce((s, r) => s + r.intended, 0); const ta = rows.reduce((s, r) => s + r.actual, 0);
  return { rows, total: { label: 'Actual vs intended hours', value: ti > 0 ? r1(ta / ti) : null, formula: `${ta} h actual ÷ ${ti} h intended` } };
}

// ---------- flags ----------

export interface LiabilityFlag { entry: Entry; burden: number; impact: number }

export function biggestLiabilities(entries: Entry[], limit = 3): LiabilityFlag[] {
  return entries
    .filter((e) => e.snapshot.section === 'liability')
    .map((e) => {
      const burden = r1(100 - (entryHealth(e).value as number));
      return { entry: e, burden, impact: r1(burden * e.snapshot.weight) };
    })
    .filter((f) => f.burden > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, limit);
}

export interface NeglectFlag { areaId: string; reasons: string[] }

/** High-weight areas that score below the threshold or got under 70% of intended hours. */
export function neglectedAreas(
  areas: Area[], scores: AreaScore[], period: Period, cf: CashFlowEntry[], settings: Settings = DEFAULT_SETTINGS,
): NeglectFlag[] {
  const ia = intendedVsActual(period, cf).rows;
  const out: NeglectFlag[] = [];
  for (const a of areas.filter((x) => !x.archived && x.weight >= settings.highWeightThreshold)) {
    const reasons: string[] = [];
    const eq = scores.find((s) => s.areaId === a.id)?.equity.value ?? null;
    if (eq !== null && eq < settings.weakThreshold) reasons.push(`equity ${eq} is below ${settings.weakThreshold}`);
    const row = ia.find((r) => r.areaId === a.id);
    if (row && row.ratio !== null && row.ratio < 0.7) reasons.push(`${row.actual} of ${row.intended} intended hours`);
    if (reasons.length) out.push({ areaId: a.id, reasons });
  }
  return out;
}

export interface Mover { lineItemId: string; name: string; previous: number; current: number; delta: number }

export function biggestMovers(current: Entry[], previous: Entry[], limit = 3): Mover[] {
  const prev = new Map(previous.map((e) => [e.lineItemId, entryHealth(e).value as number]));
  const movers: Mover[] = [];
  for (const e of current) {
    const p = prev.get(e.lineItemId);
    if (p === undefined) continue;
    const c = entryHealth(e).value as number;
    movers.push({ lineItemId: e.lineItemId, name: e.snapshot.name, previous: p, current: c, delta: r1(c - p) });
  }
  return movers.filter((m) => m.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit);
}

// ---------- entry creation ----------

/** Build an Entry, snapshotting the item's current scoring parameters. */
export function makeEntry(
  item: LineItem, periodId: string, value: number, note = '', now = new Date().toISOString(),
): Entry {
  return {
    id: `${periodId}:${item.id}`, periodId, lineItemId: item.id, value, note, recordedAt: now,
    snapshot: {
      direction: item.direction, target: item.target, worst: item.worst, tolerance: item.tolerance,
      weight: item.weight, rubric: item.rubric, unit: item.unit, section: item.section,
      areaId: item.areaId, name: item.name,
    },
  };
}
