import { formatValue } from './format';
import { entryHealth } from './scoring';
import type { Area, Entry, LineItem } from './types';

/** One small, concrete action per template item. */
const ACTIONS: Record<string, string> = {
  'fin-savings': 'Set up a small automatic transfer to savings on payday',
  'fin-invest': 'Raise your automatic contribution by a small amount',
  'fin-debt': 'Pick one balance and make one extra payment this month',
  'fin-income': 'Write down one concrete way to raise income this month and take its first step',
  'fin-spend': 'Review your three biggest spending categories and trim one',
  'fin-clarity': 'Put a 20-minute money check-in on your calendar',
  'hl-sleep': 'Set a wind-down alarm 30 minutes before your target bedtime',
  'hl-exercise': 'Book two short sessions this week at fixed times',
  'hl-energy': 'Take a 15-minute walk after one meal each day',
  'hl-stress': 'Pick one recurring stressor and decide to drop, delegate or shrink it',
  'hl-checkups': 'Book one overdue appointment this week',
  'rel-friends': 'Message one friend today to set up a call or a meetup',
  'rel-home': 'Plan one uninterrupted hour together this week',
  'rel-conflict': 'Write the first sentence you would say to start resolving one conflict',
  'rel-time': 'Put one recurring social time block in your calendar',
  'rel-obligation': 'Renegotiate or decline one commitment you resent',
  'car-fulfil': 'Pick one task you enjoy and ask for a little more of it',
  'car-skills': 'Choose one skill gap and spend 30 minutes on it this week',
  'car-hours': 'Set a firm stop time on two days this week',
  'car-overcommit': 'List your commitments and renegotiate the lowest-value one',
  'car-progress': 'Block two hours for your most important goal before checking email',
  'lrn-hours': 'Schedule three 30-minute learning sessions this week',
  'lrn-growth': 'Pick one skill and define a tiny weekly practice',
  'lrn-backlog': 'Finish or formally drop one unfinished course or book',
  'home-comfort': 'Spend 15 minutes on the one spot that bothers you most',
  'home-maint': 'Fix or book one deferred repair this week',
  'home-clutter': 'Clear one shelf or drawer',
  'mea-purpose': 'Write three sentences on what matters most this season',
  'mea-practice': 'Choose a 5-minute practice and attach it to an existing habit',
  'mea-gap': 'Pick one value and make one change to this week’s calendar that serves it',
  'rec-play': 'Schedule one enjoyable activity this week',
  'rec-screen': 'Swap one passive screen block for a hobby or a walk',
  'rec-rested': 'Protect one evening with no obligations',
};

function genericAction(e: Entry): string {
  const n = e.snapshot.name;
  switch (e.snapshot.section) {
    case 'asset': return `Take one small step that builds ${n}`;
    case 'liability': return `Take one small step that reduces ${n}`;
    case 'inflow': return `Make room for one more instance of ${n}`;
    case 'outflow': return `Trim ${n} by a small amount`;
  }
}

const sign = (n: number) => (n < 0 ? -1 : 1);

/**
 * A small move from the current value toward the target: about a quarter of the remaining gap
 * (one rating point for 1-10 ratings), rounded to something readable, never past the target.
 */
export function nextTarget(value: number, e: Pick<Entry['snapshot'], 'direction' | 'target' | 'tolerance' | 'rubric'>): number {
  let goal = e.target;
  if (e.direction === 'range') {
    const tol = e.tolerance ?? 0;
    if (Math.abs(value - e.target) <= tol) return value;
    goal = value > e.target ? e.target + tol : e.target - tol;
  }
  const gap = goal - value;
  if (gap === 0) return value;
  const cap = (move: number) => (Math.abs(move) > Math.abs(gap) ? gap : move);
  let move: number;
  if (e.rubric) move = sign(gap) * 1;
  else if (Number.isInteger(value) && Number.isInteger(goal) && Math.abs(gap) < 40) move = sign(gap) * Math.max(1, Math.round(Math.abs(gap) * 0.25));
  else {
    const raw = Math.abs(gap) * 0.25;
    const unit = 10 ** Math.floor(Math.log10(raw)) / 2;
    move = sign(gap) * Math.max(unit, Math.round(raw / unit) * unit);
  }
  return Math.round((value + cap(move)) * 100) / 100;
}

export interface Suggestion {
  id: string; // stable, so an accepted or dismissed suggestion never comes back
  areaId: string;
  lineItemId?: string;
  /** the action itself; the numeric aim is shown and edited separately */
  title: string;
  itemName?: string;
  /** display unit: '$', 'hours/wk', or '/10' for ratings */
  unit?: string;
  /** shown so the reasoning is never hidden */
  rationale: string;
  baselineValue?: number;
  targetValue?: number;
  impact: number;
}

const PADDING = (a: Area): Omit<Suggestion, 'id' | 'areaId' | 'impact'>[] => [
  { title: `Add one asset or liability in ${a.name} that you would want to track`, rationale: 'Few items are tracked here, so the score rests on little information.' },
  { title: `Write one sentence describing what “good” looks like in ${a.name}`, rationale: 'A clear target makes the other scores in this area easier to set.' },
  { title: `Decide which ${a.name} item to look at first at your next review`, rationale: 'Picking a single starting point keeps the next step small.' },
];

/**
 * Up to `limit` small actions for an area: items with the largest (gap to 100 × weight),
 * skipping any in `exclude` (already accepted or dismissed), padded with area-level steps.
 */
export function suggestForArea(
  area: Area, entries: Entry[], items: LineItem[], exclude: ReadonlySet<string> = new Set(), limit = 3,
): Suggestion[] {
  const tmpl = new Map(items.map((i) => [i.id, i.templateId]));
  const ranked = entries
    .filter((e) => e.snapshot.areaId === area.id)
    .map((e) => {
      const h = entryHealth(e).value as number;
      return { e, h, impact: Math.round((100 - h) * e.snapshot.weight * 10) / 10 };
    })
    .filter((x) => x.h < 100 && x.impact > 0)
    .sort((a, b) => b.impact - a.impact);

  const out: Suggestion[] = [];
  for (const { e, h, impact } of ranked) {
    const id = `${e.lineItemId}:step`;
    if (exclude.has(id)) continue;
    const target = nextTarget(e.value, e.snapshot);
    const unit = e.snapshot.rubric ? '/10' : e.snapshot.unit;
    const how = ACTIONS[tmpl.get(e.lineItemId) ?? ''] ?? genericAction(e);
    out.push({
      id, areaId: area.id, lineItemId: e.lineItemId, impact,
      title: how, itemName: e.snapshot.name, unit,
      rationale: `${e.snapshot.name} scores ${h}/100 and has weight ${e.snapshot.weight}, so the gap of ${Math.round((100 - h) * 10) / 10} × ${e.snapshot.weight} = ${impact} is among the largest in ${area.name}. The suggested step is about a quarter of the way to the target of ${formatValue(e.snapshot.target, unit)}. You can change it before accepting.`,
      baselineValue: e.value, targetValue: target,
    });
    if (out.length === limit) return out;
  }
  for (const [i, p] of PADDING(area).entries()) {
    const id = `${area.id}:pad:${i}`;
    if (exclude.has(id) || out.length >= limit) continue;
    out.push({ ...p, id, areaId: area.id, impact: 0 });
  }
  return out;
}

/** Areas below the threshold, weakest first. Areas with no balance-sheet data are skipped. */
export function weakAreas(areas: Area[], equity: Record<string, number | null>, threshold: number): Area[] {
  return areas
    .filter((a) => !a.archived && equity[a.id] !== null && equity[a.id] !== undefined && (equity[a.id] as number) < threshold)
    .sort((a, b) => (equity[a.id] as number) - (equity[b.id] as number));
}
