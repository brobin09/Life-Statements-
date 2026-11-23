export type Section = 'asset' | 'liability' | 'inflow' | 'outflow';
export type ValueType = 'quantitative' | 'qualitative';
export type Direction = 'higher' | 'lower' | 'range';

export interface Area {
  id: string;
  name: string;
  /** importance, 1-10 */
  weight: number;
  intendedWeeklyHours: number;
  order: number;
  archived: boolean;
}

export interface Rubric {
  question: string;
  /** what a 2, 5 and 8 mean for this item */
  anchors: { 2: string; 5: string; 8: string };
}

/** The scoring-relevant fields, copied onto each Entry when recorded. */
export interface ScoringParams {
  direction: Direction;
  target: number;
  /** value that scores 0 */
  worst: number;
  /** only for direction 'range': distance from target that still scores 100 */
  tolerance?: number;
  weight: number;
}

export interface LineItem extends ScoringParams {
  id: string;
  areaId: string;
  name: string;
  section: Section;
  valueType: ValueType;
  unit?: string; // quantitative only
  rubric?: Rubric; // qualitative only
  templateId?: string;
  archived: boolean;
}

export type PeriodKind = 'month' | 'quarter' | 'custom';

export interface Period {
  id: string;
  kind: PeriodKind;
  start: string; // ISO date
  end: string;
  label: string;
  status: 'draft' | 'closed';
  /** areaId -> intended weekly hours, copied when the period opens */
  intendedHoursByArea: Record<string, number>;
}

export interface Entry {
  id: string;
  periodId: string;
  lineItemId: string;
  value: number;
  note: string;
  recordedAt: string;
  /** true while the value was copied from the previous period and not yet confirmed or changed */
  carriedOver?: boolean;
  snapshot: ScoringParams & { rubric?: Rubric; unit?: string; section: Section; areaId: string; name: string };
}

export interface CashFlowEntry {
  periodId: string;
  areaId: string;
  actualWeeklyHours: number;
  /** 1 = drained me, 10 = gave me energy */
  energy: number;
  carriedOver?: boolean;
}

export interface Goal {
  id: string;
  areaId: string;
  lineItemId?: string;
  title: string;
  /** target for the linked line item's value */
  targetValue?: number;
  /** the item's value when the goal was set, so progress is measured from there */
  baselineValue?: number;
  dueDate?: string;
  status: 'active' | 'done' | 'dropped';
  fromSuggestionId?: string;
  /** why the suggestion was made, kept so the reasoning stays visible */
  rationale?: string;
  createdAt: string;
}

export interface Settings {
  weakThreshold: number; // default 50
  highWeightThreshold: number; // default 7
}

export const DEFAULT_SETTINGS: Settings = { weakThreshold: 50, highWeightThreshold: 7 };

/** Every computed score carries its derivation so the UI can always show "how". */
export interface Breakdown {
  label: string;
  value: number | null;
  formula: string;
  inputs: Breakdown[];
}
