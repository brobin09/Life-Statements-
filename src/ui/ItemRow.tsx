import { useState } from 'react';
import { itemHealth } from '../core/scoring';
import { saveNote, saveValue } from '../data/repo';
import type { Entry, LineItem } from '../core/types';
import { Explain } from './Explain';

import { formatValue as fmt } from '../core/format';
export { fmt };

function nearestAnchor(r: number, a: Record<2 | 5 | 8, string>) {
  const k = ([2, 5, 8] as const).reduce((best, c) => (Math.abs(c - r) < Math.abs(best - r) ? c : best), 5);
  return { k, text: a[k] };
}

export function ItemRow({ item, entry, periodId, onEdit }: {
  item: LineItem; entry?: Entry; periodId: string; onEdit: (i: LineItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const qual = item.valueType === 'qualitative';
  const params = entry?.snapshot ?? item;
  const health = entry ? itemHealth(entry.value, entry.snapshot) : null;
  const unit = qual ? '/10' : item.unit;

  return (
    <li className="item">
      <div className="item-main">
        <div className="item-name">
          <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>{item.name}</button>
          <span className="muted small"> · weight {params.weight}</span>
        </div>
        <div className="item-input">
          {qual ? (
            <select value={entry?.value ?? ''} aria-label={`${item.name} rating`}
              onChange={(e) => saveValue(item, periodId, e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <input type="number" step="any" inputMode="decimal" aria-label={`${item.name} value`}
              defaultValue={entry?.value ?? ''} key={entry?.value ?? 'empty'}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === '') { if (entry) saveValue(item, periodId, null); return; }
                const n = Number(v); if (Number.isFinite(n) && n !== entry?.value) saveValue(item, periodId, n);
              }} />
          )}
          <span className="muted small unit">{unit}</span>
        </div>
        <div className="item-health" title={health ? `Health ${health.value} of 100` : 'No value yet'}>
          {health ? (<><div className="bar"><div style={{ width: `${health.value}%` }} /></div>
            <span className="num">{health.value}</span></>) : <span className="muted small">not recorded</span>}
        </div>
      </div>
      <div className="muted small item-sub">
        Target {fmt(params.target, qual ? '/10' : item.unit)}
        {params.direction === 'range' && ` ±${params.tolerance ?? 0}`}
        {' · '}{params.direction === 'lower' ? 'lower is better' : params.direction === 'range' ? 'stay in range' : 'higher is better'}
        {qual && entry && <> · “{nearestAnchor(entry.value, (entry.snapshot.rubric ?? item.rubric)!.anchors).text}” (closest to {nearestAnchor(entry.value, (entry.snapshot.rubric ?? item.rubric)!.anchors).k})</>}
      </div>
      {open && (
        <div className="item-detail">
          {qual && item.rubric && (
            <dl className="rubric">
              <dt className="q">{item.rubric.question}</dt>
              {([2, 5, 8] as const).map((k) => <div key={k}><dt>{k}</dt><dd>{item.rubric!.anchors[k]}</dd></div>)}
            </dl>
          )}
          {health && <Explain b={health} summary="How this item's score is calculated" />}
          <label className="note">Note
            <textarea defaultValue={entry?.note ?? ''} disabled={!entry} rows={2}
              placeholder={entry ? 'Optional context for this period' : 'Record a value first'}
              onBlur={(e) => entry && e.target.value !== entry.note && saveNote(item, periodId, e.target.value)} />
          </label>
          {entry && <div className="muted small">Recorded {new Date(entry.recordedAt).toLocaleDateString()}</div>}
          <button onClick={() => onEdit(item)}>Edit item, target and rubric</button>
        </div>
      )}
    </li>
  );
}
