import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { addArea, closePeriod, ensureInitialised, newPeriod, reopenPeriod, saveArea, seedSampleData, startFresh, startReview } from '../data/repo';
import type { Area, LineItem, Section } from '../core/types';
import { Explain } from './Explain';
import { ItemForm, blankItem } from './ItemForm';
import { ItemRow } from './ItemRow';
import { Review } from './Review';
import { Trends } from './Trends';
import { IncomeStatement } from './IncomeStatement';
import { CashFlow } from './CashFlow';
import { Goals, GoalRow } from './Goals';
import { Export } from './Export';
import { Report } from './Report';
import { InstallPanel } from './InstallPanel';
import { TrendChart } from './Chart';
import { computeTrends } from '../core/trends';
import { useWorkspace } from './hooks';

const band = (v: number | null) =>
  v === null ? 'No data yet' : v < 45 ? 'Below break-even' : v <= 55 ? 'Near break-even' : 'Above break-even';

const SECTION_TITLES: Record<Section, string> = {
  asset: 'Assets', liability: 'Liabilities', inflow: 'Inflows (this period)', outflow: 'Outflows (this period)',
};

type View = { name: 'sheet' } | { name: 'area'; id: string } | { name: 'trends' } | { name: 'goals' } | { name: 'export' } | { name: 'report' } | { name: 'income' } | { name: 'cashflow' } | { name: 'review' } | { name: 'settings' };

export function App() {
  const [booted, setBooted] = useState(false);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: 'sheet' });
  const [form, setForm] = useState<{ item: LineItem; isNew: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bannerHidden, setBannerHidden] = useState(() => { try { return localStorage.getItem('ls-banner-hidden') === '1'; } catch { return false; } });

  useEffect(() => { ensureInitialised().then(() => setBooted(true)); }, []);
  const ws = useWorkspace(periodId);
  const sample = useLiveQuery(() => db.meta.get('sample'), [])?.value === true;

  useEffect(() => {
    if (ws.periods?.length && (!periodId || !ws.periods.some((p) => p.id === periodId)))
      setPeriodId(ws.periods[ws.periods.length - 1]!.id);
  }, [ws.periods, periodId]);

  if (!booted || !ws.ready || !ws.computed || !periodId || !ws.periods?.some((p) => p.id === periodId)) return <p className="loading">Loading…</p>;
  const { computed } = ws;
  const areas = ws.areas!, items = ws.items!, periods = ws.periods!, entries = ws.entries!;
  const period = periods.find((p) => p.id === periodId)!;
  const entryByItem = new Map(entries.map((e) => [e.lineItemId, e]));
  const activeAreas = areas.filter((a) => !a.archived);

  const itemsFor = (areaId: string, section: Section) =>
    items.filter((i) => i.areaId === areaId && i.section === section && !i.archived);

  return (
    <div className="app">
      <header className={`top ${view.name === 'report' ? 'no-print' : ''}`}>
        <h1>Life Statements</h1>
        <nav>
          <button className={view.name === 'sheet' ? 'active' : ''} onClick={() => setView({ name: 'sheet' })}>Balance sheet</button>
          <button className={view.name === 'income' ? 'active' : ''} onClick={() => setView({ name: 'income' })}>Income statement</button>
          <button className={view.name === 'cashflow' ? 'active' : ''} onClick={() => setView({ name: 'cashflow' })}>Cash flow</button>
          <button className={view.name === 'trends' ? 'active' : ''} onClick={() => setView({ name: 'trends' })}>Trends</button>
          <button className={view.name === 'goals' ? 'active' : ''} onClick={() => setView({ name: 'goals' })}>Goals</button>
          <button className={view.name === 'export' ? 'active' : ''} onClick={() => setView({ name: 'export' })}>Export</button>
          <button className={view.name === 'settings' ? 'active' : ''} onClick={() => setView({ name: 'settings' })}>Areas &amp; data</button>
        </nav>
        <div className="period">
          <select aria-label="Period" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.label}{p.status === 'draft' ? ' (open)' : ''}</option>)}
          </select>
          {period.status === 'draft'
            ? <button className="primary" onClick={async () => { await startReview(period.id); setView({ name: 'review' }); }}>Review</button>
            : (periods[periods.length - 1]!.status === 'draft'
              ? <button className="primary" onClick={() => { setPeriodId(periods[periods.length - 1]!.id); setView({ name: 'review' }); }}>Continue review</button>
              : <button className="primary" onClick={async () => { setPeriodId(await newPeriod()); setView({ name: 'review' }); }}>Start review</button>)}
        </div>
      </header>
      {notice && <p className="banner no-print" role="status">{notice} <button className="link" onClick={() => setNotice(null)}>Dismiss</button></p>}
      {sample && !bannerHidden && view.name !== 'report' && (
        <p className="banner no-print">Sample data for a fictional person. Edit freely, or replace it in “Areas &amp; data”.{' '}
          <button className="link" onClick={() => { setBannerHidden(true); try { localStorage.setItem('ls-banner-hidden', '1'); } catch { /* storage unavailable */ } }}>Hide</button></p>)}

      <main>
        {view.name === 'sheet' && (
          <section aria-label="Balance sheet">
            <div className="card life">
              <div>
                <div className="muted small">Life equity · {period.label}</div>
                <div className="big">{computed.life.breakdown.value ?? '—'}<span className="muted small"> / 100</span></div>
                <div>{band(computed.life.breakdown.value)}</div>
                <div className="muted small">50 is break-even: asset strength balanced by liability burden.</div>
              </div>
              <div>
                <Explain b={computed.life.breakdown} summary="How life equity is calculated" />
                {computed.life.excluded.length > 0 &&
                  <p className="muted small">Not yet included (no balance-sheet items): {computed.life.excluded.join(', ')}.</p>}
              </div>
            </div>
            <div className="grid">
              {activeAreas.map((a) => {
                const s = computed.scores.find((x) => x.areaId === a.id)!;
                return (
                  <button key={a.id} className="card area-card" onClick={() => setView({ name: 'area', id: a.id })}>
                    <div className="area-head"><strong>{a.name}</strong><span className="muted small">weight {a.weight}</span></div>
                    <div className="big">{s.equity.value ?? '—'}</div>
                    <div className="small">{band(s.equity.value)}</div>
                    <div className="two-col small muted">
                      <span>Assets {s.assetStrength.value ?? '—'}</span>
                      <span>Burden {s.liabilityBurden.value ?? '—'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {view.name === 'review' && <Review ws={ws} periodId={periodId} onDone={() => setView({ name: 'sheet' })} />}
        {view.name === 'goals' && <Goals ws={ws} periodId={periodId} />}
        {view.name === 'export' && <Export ws={ws} periodId={periodId} onReport={() => setView({ name: 'report' })}
          onRestored={() => { setPeriodId(null); setView({ name: 'sheet' }); setNotice('Backup restored.'); }} />}
        {view.name === 'report' && <Report ws={ws} periodId={periodId} onClose={() => setView({ name: 'export' })} />}
        {view.name === 'income' && <IncomeStatement ws={ws} periodId={periodId} onOpenArea={(id) => setView({ name: 'area', id })} />}
        {view.name === 'cashflow' && <CashFlow ws={ws} periodId={periodId} onReview={() => setView({ name: 'review' })} />}
        {view.name === 'trends' && <Trends ws={ws} periodId={periodId} onOpenArea={(id) => setView({ name: 'area', id })} />}

        {view.name === 'area' && (() => {
          const area = areas.find((a) => a.id === view.id);
          if (!area) return null;
          const s = computed.scores.find((x) => x.areaId === area.id);
          return (
            <section aria-label={`${area.name} detail`}>
              <button className="link" onClick={() => setView({ name: 'sheet' })}>← Balance sheet</button>
              <div className="card life">
                <div>
                  <h2>{area.name}</h2>
                  <div className="big">{s?.equity.value ?? '—'}<span className="muted small"> / 100</span></div>
                  <div>{band(s?.equity.value ?? null)}</div>
                </div>
                <div>{s && <Explain b={s.equity} summary="How this area score is calculated" />}</div>
              </div>
              <div className="card"><TrendChart title={`${area.name} equity over time`} series={computeTrends(areas, periods, ws.allEntries!).areas[area.id] ?? []} /></div>
              {(['asset', 'liability', 'inflow', 'outflow'] as Section[]).map((sec) => (
                <div key={sec} className="card">
                  <h3>{SECTION_TITLES[sec]}</h3>
                  {itemsFor(area.id, sec).length === 0 && <p className="muted small">Nothing here yet.</p>}
                  <ul className="items">
                    {itemsFor(area.id, sec).map((i) => (
                      <ItemRow key={i.id} item={i} entry={entryByItem.get(i.id)} periodId={periodId}
                        onEdit={(it) => setForm({ item: it, isNew: false })} />
                    ))}
                  </ul>
                  <button onClick={() => setForm({ item: { ...blankItem(area.id), section: sec,
                    direction: sec === 'liability' || sec === 'outflow' ? 'lower' : 'higher' }, isNew: true })}>
                    + Add {sec}
                  </button>
                </div>
              ))}
              {ws.goals!.filter((g) => g.areaId === area.id && g.status === 'active').length > 0 && (
                <div className="card"><h3>Active goals</h3><ul className="items">
                  {ws.goals!.filter((g) => g.areaId === area.id && g.status === 'active').map((g) => <GoalRow key={g.id} goal={g} ws={ws} periodId={periodId} compact />)}
                </ul></div>)}
              <p className="muted small">Inflows and outflows feed the income statement. Their scores don’t affect area equity.</p>
            </section>
          );
        })()}

        {view.name === 'settings' && (
          <section aria-label="Areas and data">
            <div className="card">
              <h2>Life areas</h2>
              <p className="muted small">Weight is importance (1–10). Intended hours per week feed the cash-flow view.</p>
              <table className="areas">
                <thead><tr><th>Area</th><th>Weight</th><th>Intended h/wk</th><th>Shown</th></tr></thead>
                <tbody>
                  {areas.map((a: Area) => (
                    <tr key={a.id}>
                      <td><input defaultValue={a.name} aria-label="Area name" onBlur={(e) => e.target.value.trim() && saveArea({ ...a, name: e.target.value.trim() })} /></td>
                      <td><input type="number" min={1} max={10} defaultValue={a.weight} aria-label={`${a.name} weight`}
                        onBlur={(e) => saveArea({ ...a, weight: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></td>
                      <td><input type="number" min={0} defaultValue={a.intendedWeeklyHours} aria-label={`${a.name} intended hours`}
                        onBlur={(e) => saveArea({ ...a, intendedWeeklyHours: Math.max(0, Number(e.target.value) || 0) })} /></td>
                      <td><input type="checkbox" checked={!a.archived} aria-label={`Show ${a.name}`} onChange={(e) => saveArea({ ...a, archived: !e.target.checked })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const n = String(f.get('n') ?? '').trim(); if (n) { addArea(n); e.currentTarget.reset(); } }}>
                <input name="n" placeholder="New area name" aria-label="New area name" /> <button>Add area</button>
              </form>
            </div>
            <div className="card">
              <h2>Periods</h2>
              <p className="muted small">Reopen a closed period to review it again.</p>
              <ul className="items">
                {[...periods].reverse().map((p) => (
                  <li key={p.id} className="is-line" style={{ gridTemplateColumns: '1fr auto' }}>
                    <span>{p.label} <span className="muted small">· {p.status === 'draft' ? 'open' : 'closed'}</span></span>
                    {p.status === 'closed' ? <button onClick={() => reopenPeriod(p.id)}>Reopen</button> : <button onClick={() => closePeriod(p.id)}>Close</button>}
                  </li>
                ))}
              </ul>
            </div>
            <InstallPanel />
            <div className="card">
              <h2>Your data</h2>
              <p className="muted small">Everything is stored in this browser on this device. Nothing is sent anywhere.</p>
              <div className="actions">
                <button onClick={() => { if (confirm('Replace all data with the sample data?')) seedSampleData().then(() => setPeriodId(null)); }}>Load sample data</button>
                <button onClick={() => { if (confirm('Delete everything and start with empty default areas?')) startFresh().then(() => setPeriodId(null)); }}>Start fresh</button>
              </div>
            </div>
          </section>
        )}
      </main>

      {form && <ItemForm initial={form.item} isNew={form.isNew} areas={activeAreas} onClose={() => setForm(null)} />}
    </div>
  );
}
