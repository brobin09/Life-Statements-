import { useState } from 'react';
import { defaultQualitativeWorst } from '../core/scoring';
import { uid } from '../data/id';
import { saveItem, itemFromTemplate } from '../data/repo';
import { TEMPLATES } from '../data/templates';
import type { Area, Direction, LineItem, Section } from '../core/types';

const SECTIONS: { v: Section; label: string; hint: string }[] = [
  { v: 'asset', label: 'Asset', hint: 'gives capacity or stability' },
  { v: 'liability', label: 'Liability', hint: 'drains or obligates me' },
  { v: 'inflow', label: 'Inflow', hint: 'added energy, money, progress or joy (this period)' },
  { v: 'outflow', label: 'Outflow', hint: 'consumed time, money, attention or energy (this period)' },
];
const defDir = (s: Section): Direction => (s === 'liability' || s === 'outflow' ? 'lower' : 'higher');

export function blankItem(areaId: string): LineItem {
  return {
    id: `custom-${uid().slice(0, 8)}`, areaId, name: '', section: 'asset', valueType: 'quantitative',
    unit: '', direction: 'higher', target: 0, worst: 0, weight: 5, archived: false,
  };
}

export function ItemForm({ initial, areas, isNew, onClose }: {
  initial: LineItem; areas: Area[]; isNew: boolean; onClose: () => void;
}) {
  const [it, setIt] = useState<LineItem>(initial);
  const [err, setErr] = useState('');
  const set = <K extends keyof LineItem>(k: K, v: LineItem[K]) => setIt((p) => ({ ...p, [k]: v }));
  const qual = it.valueType === 'qualitative';
  const anchors = it.rubric?.anchors ?? { 2: '', 5: '', 8: '' };

  const changeSection = (s: Section) => setIt((p) => {
    const direction = defDir(s);
    return { ...p, section: s, direction, worst: qual ? defaultQualitativeWorst(direction) : p.worst };
  });
  const changeType = (t: LineItem['valueType']) => setIt((p) => t === 'qualitative'
    ? { ...p, valueType: t, unit: undefined, target: p.direction === 'lower' ? 3 : 8, worst: defaultQualitativeWorst(p.direction),
        rubric: p.rubric ?? { question: '', anchors: { 2: '', 5: '', 8: '' } } }
    : { ...p, valueType: t, rubric: undefined, unit: p.unit ?? '' });
  const changeDir = (d: Direction) => setIt((p) => ({ ...p, direction: d,
    worst: qual ? defaultQualitativeWorst(d) : p.worst }));

  const submit = async () => {
    if (!it.name.trim()) return setErr('Give the item a name.');
    if (qual && (!it.rubric?.question.trim() || !anchors[2].trim() || !anchors[5].trim() || !anchors[8].trim()))
      return setErr('Qualitative items need the question and what 2, 5 and 8 mean, so scoring stays consistent.');
    if (it.target === it.worst) return setErr('Target and “scores 0 at” must be different values.');
    if (it.direction === 'higher' && it.worst > it.target) return setErr('For “higher is better”, the 0-score value should be below the target.');
    if (it.direction === 'lower' && it.worst < it.target) return setErr('For “lower is better”, the 0-score value should be above the target.');
    await saveItem({ ...it, name: it.name.trim() });
    onClose();
  };

  const templatesForArea = TEMPLATES.filter((t) => t.areaId === it.areaId);

  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-label={isNew ? 'Add line item' : 'Edit line item'}>
      <div className="modal">
        <h2>{isNew ? 'Add line item' : 'Edit line item'}</h2>
        {isNew && templatesForArea.length > 0 && (
          <label>Start from a template
            <select value="" onChange={(e) => {
              const t = TEMPLATES.find((x) => x.key === e.target.value);
              if (t) setIt({ ...itemFromTemplate(t, it.areaId) });
            }}>
              <option value="">Custom item</option>
              {templatesForArea.map((t) => <option key={t.key} value={t.key}>{t.name} ({t.section})</option>)}
            </select>
          </label>
        )}
        <label>Name<input value={it.name} onChange={(e) => set('name', e.target.value)} /></label>
        <div className="row">
          <label>Area<select value={it.areaId} onChange={(e) => set('areaId', e.target.value)}>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Section<select value={it.section} onChange={(e) => changeSection(e.target.value as Section)}>
            {SECTIONS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</select></label>
        </div>
        <div className="muted small">{SECTIONS.find((s) => s.v === it.section)!.hint}</div>
        <div className="row">
          <label>Measured as<select value={it.valueType} onChange={(e) => changeType(e.target.value as LineItem['valueType'])}>
            <option value="quantitative">Number with a unit</option><option value="qualitative">Rating from 1 to 10</option></select></label>
          {!qual && <label>Unit<input value={it.unit ?? ''} placeholder="$, hours/wk, lb…" onChange={(e) => set('unit', e.target.value)} /></label>}
          <label>Better when<select value={it.direction} onChange={(e) => changeDir(e.target.value as Direction)}>
            <option value="higher">Higher</option><option value="lower">Lower</option><option value="range">Within a range</option></select></label>
        </div>
        <div className="row">
          <label>Target<input type="number" step="any" value={it.target} onChange={(e) => set('target', Number(e.target.value))} /></label>
          <label>Scores 0 at<input type="number" step="any" value={it.worst} onChange={(e) => set('worst', Number(e.target.value))} /></label>
          {it.direction === 'range' && <label>± tolerance<input type="number" step="any" value={it.tolerance ?? 0} onChange={(e) => set('tolerance', Number(e.target.value))} /></label>}
          <label>Weight (1–10)<input type="number" min={1} max={10} value={it.weight} onChange={(e) => set('weight', Math.min(10, Math.max(1, Number(e.target.value) || 1)))} /></label>
        </div>
        {qual && (
          <fieldset>
            <legend>Rubric</legend>
            <label>Question<input value={it.rubric?.question ?? ''} onChange={(e) => set('rubric', { question: e.target.value, anchors })} /></label>
            {([2, 5, 8] as const).map((k) => (
              <label key={k}>What a {k} means
                <input value={anchors[k]} onChange={(e) => set('rubric', { question: it.rubric?.question ?? '', anchors: { ...anchors, [k]: e.target.value } })} /></label>
            ))}
          </fieldset>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions">
          <button className="primary" onClick={submit}>Save</button>
          <button onClick={onClose}>Cancel</button>
          {!isNew && <button onClick={async () => { await saveItem({ ...it, archived: true }); onClose(); }}>Archive item</button>}
        </div>
      </div>
    </div>
  );
}
