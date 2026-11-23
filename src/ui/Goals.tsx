import { useMemo, useState } from 'react';
import { goalProgress, latestEntries } from '../core/goals';
import { suggestForArea, weakAreas, type Suggestion } from '../core/suggestions';
import { DEFAULT_SETTINGS, type Goal } from '../core/types';
import { acceptSuggestion, addCustomGoal, deleteGoal, dismissSuggestion, restoreDismissed, saveGoal } from '../data/repo';
import { fmt } from './ItemRow';
import type { useWorkspace } from './hooks';

type WS = ReturnType<typeof useWorkspace>;

export function GoalRow({ goal, ws, periodId, compact = false }: { goal: Goal; ws: WS; periodId: string; compact?: boolean }) {
  const items = ws.items!; const latest = useMemo(() => latestEntries(ws.allEntries!, ws.periods!, periodId), [ws.allEntries, ws.periods, periodId]);
  const item = items.find((i) => i.id === goal.lineItemId);
  const e = goal.lineItemId ? latest.get(goal.lineItemId) : undefined;
  const { progress, met } = goalProgress(goal, e?.value);
  const unit = item?.valueType === 'qualitative' ? '/10' : item?.unit;
  return (
    <li className="goal">
      <div className="goal-main">
        {compact ? <span>{goal.title}</span> : (
          <input className="goal-title" defaultValue={goal.title} aria-label="Goal" onBlur={(ev) => ev.target.value.trim() && ev.target.value !== goal.title && saveGoal({ ...goal, title: ev.target.value.trim() })} />
        )}
        {item && goal.targetValue !== undefined && (
          <div className="muted small">
            {item.name}: {e ? fmt(e.value, unit) : 'no value yet'} now · started at {goal.baselineValue !== undefined ? fmt(goal.baselineValue, unit) : '—'} · target{' '}
            {compact ? fmt(goal.targetValue, unit) : (
              <input type="number" step="any" aria-label="Goal target" style={{ width: 90 }} defaultValue={goal.targetValue}
                onBlur={(ev) => { const n = Number(ev.target.value); if (ev.target.value.trim() !== '' && Number.isFinite(n) && n !== goal.targetValue) saveGoal({ ...goal, targetValue: n }); }} />
            )}
          </div>
        )}
        {progress !== null && <div className="bar" role="img" aria-label={`Progress ${Math.round(progress * 100)}%`}><div style={{ width: `${progress * 100}%` }} /></div>}
        {met && goal.status === 'active' && <div className="small">Target reached. You can mark this done.</div>}
      </div>
      {!compact && (
        <div className="goal-actions">
          <label className="small muted">Due <input type="date" defaultValue={goal.dueDate ?? ''} onBlur={(ev) => ev.target.value !== (goal.dueDate ?? '') && saveGoal({ ...goal, dueDate: ev.target.value || undefined })} /></label>
          {goal.status === 'active' && <button onClick={() => saveGoal({ ...goal, status: 'done' })}>Mark done</button>}
          {goal.status === 'active' && <button onClick={() => saveGoal({ ...goal, status: 'dropped' })}>Set aside</button>}
          {goal.status !== 'active' && <button onClick={() => saveGoal({ ...goal, status: 'active' })}>Reactivate</button>}
          <button onClick={() => confirm('Delete this goal?') && deleteGoal(goal.id)}>Delete</button>
        </div>
      )}
    </li>
  );
}

function SuggestionCard({ s }: { s: Suggestion }) {
  const [target, setTarget] = useState(String(s.targetValue ?? ''));
  const t = Number(target);
  const needsTarget = s.targetValue !== undefined;
  const valid = target.trim() !== '' && Number.isFinite(t);
  return (
    <div className="card sug">
      <p>{s.title}</p>
      {needsTarget && (
        <label className="small">Aim to move <strong>{s.itemName}</strong> from {fmt(s.baselineValue!, s.unit)} to{' '}
          <input type="number" step="any" value={target} aria-label={`Target for ${s.itemName}`} style={{ width: 90 }} onChange={(e) => setTarget(e.target.value)} />
          <span className="muted"> {s.unit}</span></label>
      )}
      <details className="explain"><summary>Why this one</summary><div className="ex-formula">{s.rationale}</div></details>
      <div className="actions">
        <button className="primary" disabled={needsTarget && !valid}
          onClick={() => acceptSuggestion(needsTarget ? { ...s, targetValue: t } : s)}>Accept as a goal</button>
        <button onClick={() => dismissSuggestion(s.id)}>Not now</button>
      </div>
    </div>
  );
}

export function Goals({ ws, periodId }: { ws: WS; periodId: string }) {
  const areas = ws.computed!.active; const goals = ws.goals!; const items = ws.items!; const entries = ws.entries!;
  const [filter, setFilter] = useState<'active' | 'done' | 'dropped'>('active');
  const [form, setForm] = useState({ areaId: areas[0]?.id ?? '', itemId: '', title: '', target: '' });

  const exclude = useMemo(() => new Set([...ws.dismissed!, ...goals.map((g) => g.fromSuggestionId).filter(Boolean) as string[]]), [ws.dismissed, goals]);
  const equity = Object.fromEntries(ws.computed!.scores.map((s) => [s.areaId, s.equity.value]));
  const weak = weakAreas(areas, equity, DEFAULT_SETTINGS.weakThreshold);
  const suggestions = weak.map((a) => ({ area: a, list: suggestForArea(a, entries, items, exclude) }));
  const shown = goals.filter((g) => g.status === filter);
  const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? '';
  const formItems = items.filter((i) => i.areaId === form.areaId && !i.archived);
  const chosenItem = items.find((i) => i.id === form.itemId);

  return (
    <section aria-label="Goals">
      <div className="card">
        <h2>Suggested next steps</h2>
        <p className="muted small">
          Areas scoring below {DEFAULT_SETTINGS.weakThreshold} get three small steps. Items are ranked by how far they are from target times their weight, and each step is about a quarter of the way to the target. Nothing here is required.
        </p>
        {weak.length === 0 && <p>No area is below {DEFAULT_SETTINGS.weakThreshold} this period.</p>}
        {ws.dismissed!.length > 0 && <button className="link small" onClick={restoreDismissed}>Bring back suggestions I set aside</button>}
      </div>
      {suggestions.map(({ area, list }) => (
        <div key={area.id}>
          <h3>{area.name} <span className="muted small">· score {equity[area.id]}</span></h3>
          <div className="small-grid">{list.map((s) => <SuggestionCard key={s.id} s={s} />)}</div>
        </div>
      ))}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="wizard-top"><h2>Your goals</h2>
          <div className="steps" style={{ margin: 0 }}>
            {(['active', 'done', 'dropped'] as const).map((f) => (
              <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f === 'active' ? 'Active' : f === 'done' ? 'Done' : 'Set aside'} ({goals.filter((g) => g.status === f).length})
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 && <p className="muted small">Nothing here.</p>}
        {areas.map((a) => {
          const list = shown.filter((g) => g.areaId === a.id);
          if (!list.length) return null;
          return (<div key={a.id}><h4 className="muted small">{a.name}</h4>
            <ul className="items">{list.map((g) => <GoalRow key={g.id} goal={g} ws={ws} periodId={periodId} />)}</ul></div>);
        })}
        {shown.filter((g) => !areaName(g.areaId)).length > 0 && <p className="muted small">Some goals belong to hidden areas.</p>}
      </div>

      <form className="card" onSubmit={(e) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        const latest = latestEntries(ws.allEntries!, ws.periods!, periodId);
        const t = form.target.trim() === '' ? undefined : Number(form.target);
        addCustomGoal({ areaId: form.areaId, title: form.title.trim(), lineItemId: form.itemId || undefined,
          baselineValue: form.itemId ? latest.get(form.itemId)?.value : undefined, targetValue: form.itemId && Number.isFinite(t) ? t : undefined });
        setForm({ ...form, title: '', target: '' });
      }}>
        <h3>Add your own goal</h3>
        <div className="row">
          <label className="small muted">Area<select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value, itemId: '' })}>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="small muted">Tied to item (optional)<select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}><option value="">None</option>{formItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
          {form.itemId && <label className="small muted">Target {chosenItem?.unit ? `(${chosenItem.unit})` : ''}<input type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></label>}
        </div>
        <label className="small muted">What will you do?<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: '100%' }} /></label>
        <div className="actions"><button className="primary">Add goal</button></div>
      </form>
    </section>
  );
}
