import { useState } from 'react';
import { areaSummaryRows, lineItemRows, toCsv } from '../core/export';
import { exportAll, importAll } from '../data/repo';
import { downloadText, safeName } from './download';
import type { useWorkspace } from './hooks';

export function Export({ ws, periodId, onReport, onRestored }: {
  ws: ReturnType<typeof useWorkspace>; periodId: string; onReport: () => void; onRestored: () => void;
}) {
  const period = ws.periods!.find((p) => p.id === periodId)!;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const n = safeName(period.label);
  const forPeriod = ws.allEntries!.filter((e) => e.periodId === periodId);

  return (
    <section aria-label="Export">
      <div className="card">
        <h2>Export · {period.label}</h2>
        <p className="muted small">Uses the period chosen at the top. Files are created on this device; nothing is uploaded.</p>
        <h3>Spreadsheet (CSV)</h3>
        <div className="actions">
          <button onClick={() => downloadText(`life-statements-${n}-line-items.csv`, toCsv(lineItemRows(ws.periods!, forPeriod, ws.areas!)), 'text/csv')}>Line items, this period</button>
          <button onClick={() => downloadText(`life-statements-${n}-areas.csv`, toCsv(areaSummaryRows(period, ws.areas!, ws.allEntries!, ws.cashflow!)), 'text/csv')}>Area summary, this period</button>
          <button onClick={() => downloadText('life-statements-all-periods-line-items.csv', toCsv(lineItemRows(ws.periods!, ws.allEntries!, ws.areas!)), 'text/csv')}>Line items, all periods</button>
        </div>
        <h3>PDF</h3>
        <p className="muted small">Opens a printable report. Choose “Save as PDF” in the print dialog.</p>
        <div className="actions"><button className="primary" onClick={onReport}>Open printable report</button></div>
      </div>
      <div className="card">
        <h2>Backup and restore</h2>
        <p className="muted small">A full copy of everything: areas, items, every period, goals. Keep it somewhere safe if you want a second copy, since data otherwise lives only in this browser.</p>
        <div className="actions">
          <button onClick={async () => downloadText(`life-statements-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportAll(), 'application/json')}>Download backup (JSON)</button>
          <label className="filebtn">Restore from backup
            <input type="file" accept="application/json,.json" aria-label="Restore from backup file" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              if (!confirm('Restoring replaces everything currently in this app. Continue?')) return;
              try { await importAll(await f.text()); onRestored(); }
              catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not restore that file.' }); }
            }} />
          </label>
        </div>
        {msg && <p role="status" className={msg.ok ? 'small' : 'error'}>{msg.text}</p>}
      </div>
    </section>
  );
}
