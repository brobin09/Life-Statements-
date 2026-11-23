import { useState } from 'react';
import type { TrendPoint } from '../core/trends';

/**
 * Single-series line chart on a fixed 0-100 scale with a dashed break-even line at 50.
 * One series, so the title (not a legend) names it. Gaps in data break the line.
 */
export function TrendChart({ title, series, compact = false }: { title: string; series: TrendPoint[]; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = compact ? 260 : 640; const H = compact ? 120 : 220;
  const m = { l: 28, r: 22, t: 12, b: 24 };
  const iw = W - m.l - m.r; const ih = H - m.t - m.b;
  const n = series.length;
  const x = (i: number) => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => m.t + (1 - v / 100) * ih;

  // split into runs so missing periods leave a gap
  const runs: { i: number; v: number }[][] = [];
  series.forEach((p, i) => {
    if (p.value === null) { runs.push([]); return; }
    if (!runs.length) runs.push([]);
    runs[runs.length - 1]!.push({ i, v: p.value });
  });
  const known = series.filter((p) => p.value !== null);
  const summary = known.length
    ? `${title}: ${known.map((p) => `${p.label} ${p.value}`).join(', ')}. Scale 0 to 100, 50 is break-even.`
    : `${title}: no data yet.`;
  const labelEvery = n > 8 ? Math.ceil(n / 8) : 1;
  const hp = hover !== null ? series[hover] : null;

  return (
    <figure className={`chart ${compact ? 'compact' : ''}`}>
      <figcaption className={compact ? 'small' : ''}><strong>{title}</strong>
        {known.length > 0 && <span className="muted small"> · latest {known[known.length - 1]!.value}</span>}</figcaption>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} onMouseLeave={() => setHover(null)}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className={v === 50 ? 'grid mid' : 'grid'} />
              <text x={m.l - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
            </g>
          ))}
          {series.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (
            <text key={p.periodId} x={i === n - 1 && n > 1 ? x(i) + 8 : i === 0 && n > 1 ? x(i) - 4 : x(i)} y={H - 6} className="axis" textAnchor={i === n - 1 && n > 1 ? 'end' : i === 0 && n > 1 ? 'start' : 'middle'}>{p.label}</text>
          ))}
          {runs.filter((r) => r.length > 1).map((r, k) => (
            <polyline key={k} points={r.map((d) => `${x(d.i)},${y(d.v)}`).join(' ')} className="line" />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} className="cross" />}
          {series.map((p, i) => p.value !== null && (
            <circle key={p.periodId} cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} className="dot" />
          ))}
          {series.map((p, i) => (
            <rect key={`h${p.periodId}`} x={x(i) - iw / Math.max(1, n - 1) / 2} y={m.t} width={Math.max(24, iw / Math.max(1, n - 1))}
              height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
          ))}
        </svg>
        {hp && (
          <div className="tip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
            <div className="small muted">{hp.label}</div><div><strong>{hp.value ?? 'no data'}</strong></div>
          </div>
        )}
      </div>
      {!compact && (
        <details className="explain"><summary>Show values as a table</summary>
          <table className="areas"><thead><tr><th>Period</th><th>Score</th></tr></thead>
            <tbody>{series.map((p) => <tr key={p.periodId}><td>{p.label}</td><td>{p.value ?? '—'}</td></tr>)}</tbody></table>
        </details>
      )}
    </figure>
  );
}
