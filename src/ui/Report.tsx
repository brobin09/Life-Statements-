import { areaScore, entryHealth, incomeScore, lifeEquity, drainToBuildRatio, intendedVsActual, recoveryStrainRatio, unitTotals } from '../core/scoring';
import { computeTrends } from '../core/trends';
import { latestEntries, goalProgress } from '../core/goals';
import type { Entry, Section } from '../core/types';
import { TrendChart } from './Chart';
import { fmt } from './ItemRow';
import type { useWorkspace } from './hooks';

const band = (v: number | null) => v === null ? 'No data' : v < 45 ? 'Below break-even' : v <= 55 ? 'Near break-even' : 'Above break-even';
const TITLES: Record<Section, string> = { asset: 'Assets', liability: 'Liabilities', inflow: 'Inflows', outflow: 'Outflows' };

function Table({ entries, section }: { entries: Entry[]; section: Section }) {
  const list = entries.filter((e) => e.snapshot.section === section);
  if (!list.length) return null;
  return (
    <table className="rep-table">
      <caption>{TITLES[section]}</caption>
      <thead><tr><th>Item</th><th>Value</th><th>Target</th><th>Weight</th><th>Health</th></tr></thead>
      <tbody>{list.map((e) => {
        const u = e.snapshot.rubric ? '/10' : e.snapshot.unit;
        return <tr key={e.id}><td>{e.snapshot.name}{e.note && <div className="small muted">{e.note}</div>}</td><td>{fmt(e.value, u)}</td><td>{fmt(e.snapshot.target, u)}</td><td>{e.snapshot.weight}</td><td>{entryHealth(e).value}</td></tr>;
      })}</tbody>
    </table>
  );
}

export function Report({ ws, periodId, onClose }: { ws: ReturnType<typeof useWorkspace>; periodId: string; onClose: () => void }) {
  const areas = ws.computed!.active; const period = ws.periods!.find((p) => p.id === periodId)!;
  const entries = ws.entries!; const cf = ws.cashflow!.filter((c) => c.periodId === periodId);
  const bs = areas.map((a) => areaScore(a.id, entries)); const is = areas.map((a) => incomeScore(a.id, entries));
  const life = lifeEquity(areas, bs); const net = lifeEquity(areas, is, 'Period result');
  const trends = computeTrends(ws.areas!, ws.periods!, ws.allEntries!);
  const ia = intendedVsActual(period, cf); const rs = recoveryStrainRatio(cf); const db = drainToBuildRatio(entries);
  const totals = unitTotals(entries);
  const latest = latestEntries(ws.allEntries!, ws.periods!, periodId);
  const goals = ws.goals!.filter((g) => g.status === 'active');

  return (
    <div className="report">
      <div className="no-print actions" style={{ marginTop: 0 }}>
        <button className="primary" onClick={() => window.print()}>Print or save as PDF</button>
        <button onClick={onClose}>Close report</button>
      </div>
      <h1>Life Statements · {period.label}</h1>
      <p className="muted small">{period.start} to {period.end} · generated {new Date().toLocaleDateString()}</p>

      <h2>Summary</h2>
      <table className="rep-table">
        <tbody>
          <tr><th>Life equity</th><td><strong>{life.breakdown.value ?? '—'}</strong> / 100 · {band(life.breakdown.value)}</td></tr>
          <tr><th>Net result for the period</th><td><strong>{net.breakdown.value ?? '—'}</strong> / 100 · {band(net.breakdown.value)}</td></tr>
          {totals.map((t) => <tr key={t.unit}><th>{t.unit === '$' ? 'Money' : 'Hours per week'} (in − out)</th><td>{t.unit === '$' ? fmt(t.inflow, '$') : t.inflow} − {t.unit === '$' ? fmt(t.outflow, '$') : t.outflow} = {t.net > 0 ? '+' : ''}{t.unit === '$' ? fmt(t.net, '$') : t.net}</td></tr>)}
        </tbody>
      </table>
      <TrendChart title="Life equity over time" series={trends.life} compact />

      <h2>Areas</h2>
      <table className="rep-table">
        <thead><tr><th>Area</th><th>Weight</th><th>Assets (A)</th><th>Burden (B)</th><th>Equity</th><th>Inflows (I)</th><th>Drag (D)</th><th>Result</th></tr></thead>
        <tbody>{areas.map((a, i) => (
          <tr key={a.id}><td>{a.name}</td><td>{a.weight}</td><td>{bs[i]!.assetStrength.value ?? '—'}</td><td>{bs[i]!.liabilityBurden.value ?? '—'}</td><td><strong>{bs[i]!.equity.value ?? '—'}</strong></td>
            <td>{is[i]!.assetStrength.value ?? '—'}</td><td>{is[i]!.liabilityBurden.value ?? '—'}</td><td><strong>{is[i]!.equity.value ?? '—'}</strong></td></tr>))}</tbody>
      </table>

      <h2>How scores are computed</h2>
      <ul className="small">
        <li><strong>Item health</strong> (0–100) = how far the value has moved from the “scores 0 at” value toward the target, capped at 100. Ranges score 100 inside target ± tolerance.</li>
        <li><strong>A</strong> = weighted average health of assets (or inflows). <strong>B</strong> (or <strong>D</strong>) = 100 − weighted average health of liabilities (or outflows).</li>
        <li><strong>Area equity</strong> (or result) = (A − B + 100) ÷ 2. 50 is break-even. With only one side recorded, the score is that side alone.</li>
        <li><strong>Life equity</strong> = average of area scores weighted by area importance: {life.breakdown.formula}.</li>
      </ul>

      {areas.map((a) => {
        const mine = entries.filter((e) => e.snapshot.areaId === a.id);
        if (!mine.length) return null;
        return (
          <section key={a.id} className="rep-area">
            <h2>{a.name}</h2>
            {(['asset', 'liability', 'inflow', 'outflow'] as Section[]).map((s) => <Table key={s} entries={mine} section={s} />)}
          </section>
        );
      })}

      <h2>Cash flow: time and energy</h2>
      <table className="rep-table">
        <thead><tr><th>Area</th><th>Intended h/wk</th><th>Actual h/wk</th><th>Gap</th><th>Energy (1–10)</th></tr></thead>
        <tbody>{areas.map((a) => {
          const r = ia.rows.find((x) => x.areaId === a.id); const c = cf.find((x) => x.areaId === a.id);
          return <tr key={a.id}><td>{a.name}</td><td>{r?.intended ?? '—'}</td><td>{r?.actual ?? '—'}</td><td>{r ? (r.gap > 0 ? '+' : '') + r.gap : '—'}</td><td>{c?.energy ?? '—'}</td></tr>;
        })}</tbody>
      </table>
      <ul className="small">
        {[ia.total, rs, db].map((r) => <li key={r.label}><strong>{r.label}:</strong> {r.value ?? '—'} <span className="muted">({r.formula})</span></li>)}
      </ul>

      {goals.length > 0 && (<>
        <h2>Active goals</h2>
        <table className="rep-table"><thead><tr><th>Goal</th><th>Area</th><th>Progress</th></tr></thead>
          <tbody>{goals.map((g) => {
            const p = goalProgress(g, g.lineItemId ? latest.get(g.lineItemId)?.value : undefined);
            return <tr key={g.id}><td>{g.title}</td><td>{areas.find((a) => a.id === g.areaId)?.name ?? ''}</td><td>{p.progress === null ? '—' : `${Math.round(p.progress * 100)}%`}</td></tr>;
          })}</tbody></table>
      </>)}
    </div>
  );
}
