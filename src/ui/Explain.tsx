import type { Breakdown } from '../core/types';

function Node({ b, depth }: { b: Breakdown; depth: number }) {
  return (
    <li>
      <span className="ex-label">{b.label}</span>
      {b.value !== null && <span className="ex-val"> {b.value}</span>}
      {b.formula && <div className="ex-formula">{b.formula}</div>}
      {b.inputs.length > 0 && depth < 3 && (
        <ul>{b.inputs.map((i, k) => <Node key={k} b={i} depth={depth + 1} />)}</ul>
      )}
    </li>
  );
}

/** Always-available "how was this computed" disclosure. */
export function Explain({ b, summary = 'How this is calculated' }: { b: Breakdown; summary?: string }) {
  return (
    <details className="explain">
      <summary>{summary}</summary>
      <ul className="ex-tree"><Node b={b} depth={0} /></ul>
    </details>
  );
}
