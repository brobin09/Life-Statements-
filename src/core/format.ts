/** "$8,000", "46 hours/wk", "6/10". Rating items pass '/10' as the unit. */
export function formatValue(n: number, unit?: string): string {
  const v = Math.abs(n) >= 1000 ? n.toLocaleString('en') : String(n);
  if (unit === '$') return n < 0 ? `-$${Math.abs(n).toLocaleString('en')}` : `$${v}`;
  if (unit === '/10') return `${v}/10`;
  return unit ? `${v} ${unit}` : v;
}
