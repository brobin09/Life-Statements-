import { drainToBuildRatio, intendedVsActual, recoveryStrainRatio } from '../core/scoring';
import { previousPeriod } from '../core/review';
import type { useWorkspace } from './hooks';

const fmtRatio = (v: number | null) => (v === null ? '—' : `${v}`);

export function CashFlow({ ws, periodId, onReview }: { ws: ReturnType<typeof useWorkspace>; periodId: string; onReview: () => void }) {
  const areas = ws.computed!.active; const periods = ws.periods!;
  const period = periods.find((p) => p.id === periodId)!;
  const prev = previousPeriod(periods, periodId);
  const cf = ws.cashflow!.filter((c) => c.periodId === periodId && areas.some((a) => a.id === c.areaId));
  const prevCf = prev ? ws.cashflow!.filter((c) => c.periodId === prev.id) : [];
  const ia = intendedVsActual(period, cf);
  const rs = recoveryStrainRatio(cf);
  const db = drainToBuildRatio(ws.entries!);
  const rows = areas.map((a) => {
    const r = ia.rows.find((x) => x.areaId === a.id) ?? { areaId: a.id, intended: 0, actual: 0, gap: 0, ratio: null };
    const c = cf.find((x) => x.areaId === a.id);
    return { area: a, ...r, energy: c?.energy ?? null, recorded: !!c, prevActual: prevCf.find((x) => x.areaId === a.id)?.actualWeeklyHours ?? null };
  });
  const max = Math.max(1, ...rows.flatMap((r) => [r.intended, r.actual]));
  const under = rows.filter((r) => r.ratio !== null && r.ratio < 0.7);
  const over = rows.filter((r) => r.ratio !== null && r.ratio > 1.3);
  const heavyDraining = rows.filter((r) => r.energy !== null && r.energy <= 5 && r.actual >= 20);

  if (cf.length === 0) return (
    <section aria-label="Cash flow"><div className="card"><p>No hours or energy recorded for {period.label} yet.</p>
      <button className="primary" onClick={onReview}>Open review</button></div></section>
  );

  return (
    <section aria-label="Cash flow">
      <div className="card">
        <h2>Where time and energy went · {period.label}</h2>
        <p className="muted small">Average hours per week by area, compared with what you intended, and how each area felt.</p>
        <div className="legend small" aria-hidden="true">
          <span><i className="sw intended" /> Intended</span><span><i className="sw actual" /> Actual</span>
        </div>
        <table className="cf">
          <thead><tr><th>Area</th><th>Hours per week</th><th>Gap</th><th>Energy</th><th className="hide-sm">Last period</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.area.id}>
                <td>{r.area.name}</td>
                <td>
                  <div className="cf-bars" role="img" aria-label={`${r.area.name}: intended ${r.intended}, actual ${r.actual} hours per week`}>
                    <div className="cf-bar intended" style={{ width: `${(r.intended / max) * 100}%` }}><span className="small">{r.intended}</span></div>
                    <div className="cf-bar actual" style={{ width: `${(r.actual / max) * 100}%` }}><span className="small">{r.actual}</span></div>
                  </div>
                </td>
                <td className="num">{r.gap > 0 ? '+' : ''}{r.gap}</td>
                <td>{r.energy === null ? '—' : <>{r.energy} <span className="muted small">{r.energy >= 6 ? 'gives energy' : 'draining'}</span></>}</td>
                <td className="num muted hide-sm">{r.prevActual ?? '—'}</td>
              </tr>
            ))}
            <tr className="total"><td><strong>Total</strong></td>
              <td className="small">{ia.rows.reduce((s, r) => s + r.intended, 0)} intended · {ia.rows.reduce((s, r) => s + r.actual, 0)} actual</td><td /><td /><td className="hide-sm" /></tr>
          </tbody>
        </table>
      </div>

      <div className="grid" style={{ marginBottom: 12 }}>
        {[{ r: ia.total, note: 'Closer to 1 means time went where you planned.' },
          { r: rs, note: 'Hours in energy-giving areas (6+) for each hour in draining ones (5 or lower).' },
          { r: db, note: 'Hours going to liabilities and outflows for each hour going to assets and inflows. Uses items measured in hours.' }].map(({ r, note }) => (
          <div key={r.label} className="card" style={{ marginBottom: 0 }}>
            <div className="muted small">{r.label}</div>
            <div className="big">{fmtRatio(r.value)}</div>
            <div className="muted small">{note}</div>
            <details className="explain"><summary>How this is calculated</summary><div className="ex-formula">{r.formula}</div></details>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Worth noticing</h3>
        {under.length + over.length + heavyDraining.length === 0 && <p className="muted small">Hours are close to what you intended, with no standouts.</p>}
        <ul className="flag-list">
          {under.map((r) => <li key={`u${r.area.id}`}>{r.area.name}: {r.actual} of {r.intended} intended hours per week.</li>)}
          {over.map((r) => <li key={`o${r.area.id}`}>{r.area.name}: {r.actual} hours per week against {r.intended} intended.</li>)}
          {heavyDraining.map((r) => <li key={`d${r.area.id}`}>{r.area.name} takes {r.actual} hours per week and feels draining (energy {r.energy}).</li>)}
        </ul>
      </div>
    </section>
  );
}
