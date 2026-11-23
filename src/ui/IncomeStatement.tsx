import { useMemo } from 'react';
import { entryHealth, incomeScore, lifeEquity, unitTotals } from '../core/scoring';
import { previousPeriod } from '../core/review';
import { computeIncomeTrend } from '../core/trends';
import type { Entry, Section } from '../core/types';
import { TrendChart } from './Chart';
import { Explain } from './Explain';
import { fmt } from './ItemRow';
import type { useWorkspace } from './hooks';

const band = (v: number | null) => v === null ? 'No data yet' : v < 45 ? 'Below break-even' : v <= 55 ? 'Near break-even' : 'Above break-even';

function Lines({ entries, section }: { entries: Entry[]; section: Section }) {
  const list = entries.filter((e) => e.snapshot.section === section);
  if (!list.length) return <p className="muted small">None recorded.</p>;
  return (
    <ul className="items">
      {list.map((e) => {
        const h = entryHealth(e).value as number;
        return (
          <li key={e.id} className="is-line">
            <span>{e.snapshot.name}</span>
            <span className="num">{fmt(e.value, e.snapshot.rubric ? '/10' : e.snapshot.unit)}</span>
            <span className="item-health"><span className="bar"><span style={{ width: `${h}%` }} /></span><span className="num">{h}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

export function IncomeStatement({ ws, periodId, onOpenArea }: { ws: ReturnType<typeof useWorkspace>; periodId: string; onOpenArea: (id: string) => void }) {
  const areas = ws.computed!.active; const periods = ws.periods!; const all = ws.allEntries!; const cur = ws.entries!;
  const period = periods.find((p) => p.id === periodId)!;
  const prev = previousPeriod(periods, periodId);
  const prevE = prev ? all.filter((e) => e.periodId === prev.id) : [];

  const scores = useMemo(() => areas.map((a) => incomeScore(a.id, cur)), [areas, cur]);
  const life = useMemo(() => lifeEquity(areas, scores, 'Period result'), [areas, scores]);
  const prevLife = useMemo(() => prev ? lifeEquity(areas, areas.map((a) => incomeScore(a.id, prevE)), 'Period result').breakdown.value : null, [areas, prev, prevE]);
  const trend = useMemo(() => computeIncomeTrend(ws.areas!, periods, all), [ws.areas, periods, all]);
  const totals = unitTotals(cur); const prevTotals = unitTotals(prevE);
  const d = life.breakdown.value !== null && prevLife !== null ? Math.round((life.breakdown.value - prevLife) * 10) / 10 : null;
  const unitName = (u: string) => (u === '$' ? 'Money' : 'Hours per week');

  return (
    <section aria-label="Income statement">
      <div className="card life">
        <div>
          <div className="muted small">Net result · {period.label}</div>
          <div className="big">{life.breakdown.value ?? '—'}<span className="muted small"> / 100</span></div>
          <div>{band(life.breakdown.value)}{d !== null && <span className="muted small"> · {d === 0 ? 'same as' : `${d > 0 ? '+' : ''}${d} vs`} {prev!.label}</span>}</div>
          <div className="muted small">Inflows (what added energy, money, progress or joy) balanced against outflows (what consumed it). 50 is break-even.</div>
        </div>
        <div>
          <Explain b={life.breakdown} summary="How the net result is calculated" />
          {life.excluded.length > 0 && <p className="muted small">No inflows or outflows recorded for: {life.excluded.join(', ')}.</p>}
        </div>
      </div>

      {totals.length > 0 && (
        <div className="grid" style={{ marginBottom: 12 }}>
          {totals.map((t) => {
            const p = prevTotals.find((x) => x.unit === t.unit);
            const f = (n: number) => (t.unit === '$' ? fmt(n, '$') : `${n} h/wk`);
            return (
              <div key={t.unit} className="card" style={{ marginBottom: 0 }}>
                <div className="muted small">{unitName(t.unit)}, literal totals</div>
                <div className="two-col"><span>In</span><span className="num">{f(t.inflow)}</span></div>
                <div className="two-col"><span>Out</span><span className="num">{f(t.outflow)}</span></div>
                <div className="two-col"><strong>Net</strong><strong className="num">{t.net > 0 ? '+' : ''}{f(t.net)}</strong></div>
                {p && <div className="muted small">Last period net {p.net > 0 ? '+' : ''}{f(p.net)}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="card"><TrendChart title="Net result over time" series={trend} /></div>

      {areas.map((a, i) => {
        const s = scores[i]!; const mine = cur.filter((e) => e.snapshot.areaId === a.id);
        if (mine.every((e) => e.snapshot.section === 'asset' || e.snapshot.section === 'liability')) return null;
        return (
          <div key={a.id} className="card">
            <div className="wizard-top">
              <h3>{a.name}</h3>
              <span>Result <strong>{s.equity.value ?? '—'}</strong> <span className="muted small">· {band(s.equity.value)}</span></span>
            </div>
            <div className="two">
              <div><h4 className="muted small">Inflows</h4><Lines entries={mine} section="inflow" /></div>
              <div><h4 className="muted small">Outflows</h4><Lines entries={mine} section="outflow" /></div>
            </div>
            <Explain b={s.equity} summary="How this area's result is calculated" />
            <button className="link small" onClick={() => onOpenArea(a.id)}>Open {a.name}</button>
          </div>
        );
      })}
    </section>
  );
}
