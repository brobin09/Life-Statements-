import { useState } from 'react';
import { areaScore, biggestMovers } from '../core/scoring';
import { carriedOverCount, minutesLeft, previousPeriod } from '../core/review';
import { closePeriod, confirmEntry, confirmUnchanged, saveCashflow, saveValue } from '../data/repo';
import type { Area, CashFlowEntry, Entry, LineItem, Period, Section } from '../core/types';
import { fmt } from './ItemRow';
import { GoalRow } from './Goals';
import type { useWorkspace } from './hooks';

type WS = ReturnType<typeof useWorkspace>;
const SECTIONS: { s: Section; title: string }[] = [
  { s: 'asset', title: 'Assets' }, { s: 'liability', title: 'Liabilities' },
  { s: 'inflow', title: 'Inflows this period' }, { s: 'outflow', title: 'Outflows this period' },
];

function nearest(r: number) { return ([2, 5, 8] as const).reduce((b, c) => (Math.abs(c - r) < Math.abs(b - r) ? c : b), 5); }

function ReviewItem({ item, entry, prev, periodId }: { item: LineItem; entry?: Entry; prev?: Entry; periodId: string }) {
  const qual = item.valueType === 'qualitative';
  const unit = qual ? '/10' : item.unit;
  const anchors = item.rubric?.anchors;
  const sel = entry && qual ? nearest(entry.value) : null;
  return (
    <div className="rev-item">
      <div className="rev-line">
        <div>
          <strong>{item.name}</strong>
          <div className="muted small">
            {prev ? <>Last period: {fmt(prev.value, unit)}</> : 'No earlier value'} · target {fmt(item.target, unit)}
            {item.direction === 'lower' ? ' (lower is better)' : ''}
          </div>
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
              defaultValue={entry?.value ?? ''} key={`${entry?.value ?? 'e'}-${entry?.carriedOver ?? ''}`}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === '') { if (entry) saveValue(item, periodId, null); return; }
                const n = Number(v); if (Number.isFinite(n) && (n !== entry?.value)) saveValue(item, periodId, n);
              }} />
          )}
          <span className="muted small unit">{unit}</span>
          {entry?.carriedOver && <button onClick={() => confirmEntry(item, periodId)} title="Keep last period's value">Unchanged</button>}
          {entry && !entry.carriedOver && <span className="tag">confirmed</span>}
        </div>
      </div>
      {qual && item.rubric && (
        <div className="anchors">
          <em>{item.rubric.question}</em>
          {([2, 5, 8] as const).map((k) => (
            <div key={k} style={{ fontWeight: sel === k ? 600 : 400 }}>{k} — {anchors![k]}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function CashFlowBlock({ area, period, cf }: { area: Area; period: Period; cf?: CashFlowEntry }) {
  const intended = period.intendedHoursByArea[area.id] ?? area.intendedWeeklyHours;
  return (
    <div className="rev-item">
      <strong>Time and energy</strong>
      <div className="rev-line">
        <label className="small">Average hours per week actually spent <span className="muted">(intended {intended})</span><br />
          <input type="number" min={0} step="any" inputMode="decimal" aria-label={`${area.name} actual hours per week`}
            defaultValue={cf?.actualWeeklyHours ?? ''} key={`h${cf?.actualWeeklyHours ?? 'e'}-${cf?.carriedOver ?? ''}`}
            onBlur={(e) => e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value)) && Number(e.target.value) !== cf?.actualWeeklyHours
              && saveCashflow(period.id, area.id, { actualWeeklyHours: Math.max(0, Number(e.target.value)) })} /></label>
        <label className="small">Energy: 1 drained me · 10 gave me energy<br />
          <select value={cf?.energy ?? ''} aria-label={`${area.name} energy`}
            onChange={(e) => e.target.value !== '' && saveCashflow(period.id, area.id, { energy: Number(e.target.value) })}>
            <option value="">—</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
        {cf?.carriedOver && <span className="tag">carried over</span>}
      </div>
    </div>
  );
}

export function Review({ ws, periodId, onDone }: { ws: WS; periodId: string; onDone: () => void }) {
  const areas = ws.computed!.active; const items = ws.items!; const periods = ws.periods!;
  const entries = ws.entries!; const all = ws.allEntries!; const cashflow = ws.cashflow!;
  const period = periods.find((p) => p.id === periodId)!;
  const prev = previousPeriod(periods, periodId);
  const prevEntries = prev ? all.filter((e) => e.periodId === prev.id) : [];
  const cfNow = cashflow.filter((c) => c.periodId === periodId);
  const [step, setStep] = useState(0); // 0 intro, 1..n areas, n+1 summary
  const n = areas.length;
  const eById = new Map(entries.map((e) => [e.lineItemId, e])); const pById = new Map(prevEntries.map((e) => [e.lineItemId, e]));

  const live = items.filter((i) => !i.archived && areas.some((a) => a.id === i.areaId));
  const remaining = live.filter((i) => { const e = eById.get(i.id); return !e || e.carriedOver; }).length;
  const carried = carriedOverCount(entries, cfNow);

  const header = (
    <div className="wizard-top">
      <h2>Review · {period.label}</h2>
      <span className="muted small">{step === 0 ? 'About 10 minutes' : step > n ? 'Last step' : `Area ${step} of ${n} · about ${minutesLeft(remaining)} min left`}</span>
    </div>
  );
  const nav = (
    <div className="steps" role="tablist" aria-label="Review steps">
      <button className={step === 0 ? 'active' : ''} onClick={() => setStep(0)}>Start</button>
      {areas.map((a, i) => {
        const mine = live.filter((x) => x.areaId === a.id);
        const done = mine.length > 0 && mine.every((x) => { const e = eById.get(x.id); return e && !e.carriedOver; });
        return <button key={a.id} className={`${step === i + 1 ? 'active' : ''} ${done ? 'done' : ''}`} onClick={() => setStep(i + 1)}>{done ? '✓ ' : ''}{a.name}</button>;
      })}
      <button className={step === n + 1 ? 'active' : ''} onClick={() => setStep(n + 1)}>Summary</button>
    </div>
  );

  if (step === 0) return (
    <section aria-label="Review">
      {header}{nav}
      <div className="card">
        <p>This walks through each area one at a time. {prev ? <>Values from <strong>{prev.label}</strong> are already filled in. For each one, either change it or press “Unchanged”.</> : 'There is no earlier period, so start by entering values.'}</p>
        <p className="muted">You can leave at any time. Everything saves as you go, and you can come back later.</p>
        <p className="muted small">{remaining} items to look at across {n} areas.</p>
        <button className="primary" onClick={() => setStep(1)}>Begin with {areas[0]?.name}</button>
      </div>
    </section>
  );

  if (step > n) {
    const lifeNow = ws.computed!.life.breakdown.value;
    const movers = prev ? biggestMovers(entries, prevEntries, 5) : [];
    return (
      <section aria-label="Review summary">
        {header}{nav}
        <div className="card">
          <div className="muted small">Life equity</div>
          <div className="big">{lifeNow ?? '—'}<span className="muted small"> / 100</span></div>
          <p className="muted">50 is break-even.</p>
          {movers.length > 0 && (<><h3>Moved most since {prev!.label}</h3>
            <ul className="flag-list">{movers.map((m) => <li key={m.lineItemId}>{m.name}: {m.previous} → {m.current} <span className="delta">({m.delta > 0 ? '+' : ''}{m.delta})</span></li>)}</ul></>)}
          {carried > 0 && <p className="muted small">{carried} value{carried === 1 ? ' is' : 's are'} still carried over from last period. That is fine if nothing changed.</p>}
          <div className="actions">
            <button className="primary" onClick={async () => { await closePeriod(periodId); onDone(); }}>Close this period</button>
            <button onClick={onDone}>Save and finish later</button>
          </div>
        </div>
      </section>
    );
  }

  const area = areas[step - 1]!;
  const mine = live.filter((i) => i.areaId === area.id);
  const now = areaScore(area.id, entries).equity.value;
  const before = prev ? areaScore(area.id, prevEntries).equity.value : null;
  const d = now !== null && before !== null ? Math.round((now - before) * 10) / 10 : null;
  const anyCarried = entries.some((e) => e.carriedOver && e.snapshot.areaId === area.id) || cfNow.some((c) => c.areaId === area.id && c.carriedOver);
  return (
    <section aria-label={`Review ${area.name}`}>
      {header}{nav}
      <div className="card">
        <div className="wizard-top">
          <h3>{area.name}</h3>
          <span className="small">Area score {now ?? '—'}{d !== null && <span className="muted"> (last period {before}{d !== 0 && <>, <span className="delta">{d > 0 ? '+' : ''}{d}</span></>})</span>}</span>
        </div>
        {SECTIONS.map(({ s, title }) => {
          const list = mine.filter((i) => i.section === s);
          if (!list.length) return null;
          return (<div key={s}><h4 className="muted small">{title}</h4>
            {list.map((i) => <ReviewItem key={i.id} item={i} entry={eById.get(i.id)} prev={pById.get(i.id)} periodId={periodId} />)}</div>);
        })}
        {mine.length === 0 && <p className="muted">No items in this area yet. Add some from the area page, or skip.</p>}
        {ws.goals!.some((g) => g.areaId === area.id && g.status === 'active') && (
          <div className="rev-item"><strong>Goals in this area</strong><ul className="items">
            {ws.goals!.filter((g) => g.areaId === area.id && g.status === 'active').map((g) => <GoalRow key={g.id} goal={g} ws={ws} periodId={periodId} compact />)}
          </ul></div>)}
        <CashFlowBlock area={area} period={period} cf={cfNow.find((c) => c.areaId === area.id)} />
        <div className="actions">
          {anyCarried && <button onClick={() => confirmUnchanged(periodId, area.id)}>Everything here is unchanged</button>}
          <button className="primary" onClick={() => setStep(step + 1)}>{step === n ? 'Continue to summary' : `Next: ${areas[step]!.name}`}</button>
          {step > 1 && <button onClick={() => setStep(step - 1)}>Back</button>}
        </div>
      </div>
    </section>
  );
}
