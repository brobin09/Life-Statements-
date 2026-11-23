import { useMemo } from 'react';
import { biggestLiabilities, biggestMovers, neglectedAreas } from '../core/scoring';
import { previousPeriod } from '../core/review';
import { computeTrends } from '../core/trends';
import { DEFAULT_SETTINGS } from '../core/types';
import { TrendChart } from './Chart';
import type { useWorkspace } from './hooks';

export function Trends({ ws, periodId, onOpenArea }: { ws: ReturnType<typeof useWorkspace>; periodId: string; onOpenArea: (id: string) => void }) {
  const areas = ws.areas!; const periods = ws.periods!; const all = ws.allEntries!;
  const t = useMemo(() => computeTrends(areas, periods, all), [areas, periods, all]);
  const period = periods.find((p) => p.id === periodId)!;
  const prev = previousPeriod(periods, periodId);
  const cur = ws.entries!; const prevE = prev ? all.filter((e) => e.periodId === prev.id) : [];
  const movers = prev ? biggestMovers(cur, prevE, 5) : [];
  const liabs = biggestLiabilities(cur, 3);
  const cf = ws.cashflow!.filter((c) => c.periodId === periodId);
  const neglected = neglectedAreas(ws.computed!.active, ws.computed!.scores, period, cf, DEFAULT_SETTINGS);
  const name = (id: string) => areas.find((a) => a.id === id)?.name ?? id;
  return (
    <section aria-label="Trends">
      <div className="card"><TrendChart title="Life equity" series={t.life} /></div>
      <div className="two">
        <div className="card">
          <h3>Moved most since {prev?.label ?? 'last period'}</h3>
          {movers.length === 0 ? <p className="muted small">Nothing to compare yet.</p> :
            <ul className="flag-list">{movers.map((m) => <li key={m.lineItemId}>{m.name}: {m.previous} → {m.current} <span className="delta">({m.delta > 0 ? '+' : ''}{m.delta})</span></li>)}</ul>}
        </div>
        <div className="card">
          <h3>Largest liabilities</h3>
          <p className="muted small">Ranked by how far from target, times importance.</p>
          {liabs.length === 0 ? <p className="muted small">None recorded.</p> :
            <ul className="flag-list">{liabs.map((l) => <li key={l.entry.id}>{l.entry.snapshot.name} <span className="muted">({name(l.entry.snapshot.areaId)}, burden {l.burden})</span></li>)}</ul>}
        </div>
      </div>
      {neglected.length > 0 && (
        <div className="card"><h3>Important areas that may need attention</h3>
          <ul className="flag-list">{neglected.map((n) => <li key={n.areaId}><button className="link" onClick={() => onOpenArea(n.areaId)}>{name(n.areaId)}</button>: {n.reasons.join('; ')}</li>)}</ul></div>
      )}
      <h3>By area</h3>
      <div className="small-grid">
        {areas.filter((a) => !a.archived).map((a) => (
          <div key={a.id} className="card" style={{ marginBottom: 0 }}>
            <TrendChart compact title={a.name} series={t.areas[a.id]!} />
            <button className="link small" onClick={() => onOpenArea(a.id)}>Open {a.name}</button>
          </div>
        ))}
      </div>
    </section>
  );
}
