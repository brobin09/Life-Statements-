import Dexie, { type EntityTable } from 'dexie';
import type { Area, CashFlowEntry, Entry, Goal, LineItem, Period } from '../core/types';

export interface Meta { key: string; value: unknown }

class LifeDB extends Dexie {
  areas!: EntityTable<Area, 'id'>;
  items!: EntityTable<LineItem, 'id'>;
  periods!: EntityTable<Period, 'id'>;
  entries!: EntityTable<Entry, 'id'>;
  cashflow!: Dexie.Table<CashFlowEntry, [string, string]>;
  goals!: EntityTable<Goal, 'id'>;
  meta!: EntityTable<Meta, 'key'>;
  constructor() {
    super('life-statements');
    this.version(1).stores({
      areas: 'id, order',
      items: 'id, areaId',
      periods: 'id, start',
      entries: 'id, periodId, lineItemId',
      cashflow: '[periodId+areaId], periodId',
      goals: 'id, areaId',
      meta: 'key',
    });
  }
}

export const db = new LifeDB();
