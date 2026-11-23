import { describe, expect, it } from 'vitest';
import { DEFAULT_AREAS, STARTER_TEMPLATES, TEMPLATES } from './templates';
import { areaScore, itemHealth, lifeEquity, makeEntry } from '../core/scoring';
import type { LineItem } from '../core/types';

describe('templates', () => {
  it('have unique keys, valid areas and consistent scoring parameters', () => {
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
    const areas = new Set(DEFAULT_AREAS.map((a) => a.id));
    for (const t of TEMPLATES) {
      expect(areas.has(t.areaId), t.key).toBe(true);
      expect(t.target, t.key).not.toBe(t.worst);
      if (t.direction === 'higher') expect(t.worst, t.key).toBeLessThan(t.target);
      if (t.direction === 'lower') expect(t.worst, t.key).toBeGreaterThan(t.target);
      if (t.valueType === 'qualitative') {
        expect(t.rubric?.question, t.key).toBeTruthy();
        for (const k of [2, 5, 8] as const) expect(t.rubric!.anchors[k], t.key).toBeTruthy();
      } else expect(t.unit, t.key).toBeTruthy();
    }
  });
  it('every default area has balance-sheet items in the starter set, and sample values score within 0-100', () => {
    for (const a of DEFAULT_AREAS) {
      const mine = STARTER_TEMPLATES.filter((t) => t.areaId === a.id);
      expect(mine.some((t) => t.section === 'asset' || t.section === 'liability'), a.id).toBe(true);
    }
    for (const t of STARTER_TEMPLATES) for (const v of t.sample!) {
      const h = itemHealth(v, t).value!;
      expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThanOrEqual(100);
    }
  });
  it('sample data improves over the three months', () => {
    const life = (i: 0 | 1 | 2) => {
      const entries = STARTER_TEMPLATES.map((t) =>
        makeEntry({ ...t, id: t.key, archived: false } as LineItem, 'p', t.sample![i]));
      const scores = DEFAULT_AREAS.map((a) => areaScore(a.id, entries));
      return lifeEquity(DEFAULT_AREAS, scores).breakdown.value!;
    };
    expect(life(2)).toBeGreaterThan(life(0));
  });
});
