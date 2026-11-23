/** Save text as a file through the browser. CSVs get a BOM so Excel reads UTF-8 correctly. */
export function downloadText(filename: string, text: string, mime: string): void {
  const body = mime.startsWith('text/csv') ? '﻿' + text : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
