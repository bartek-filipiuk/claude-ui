const UNITS: Array<[limitSec: number, divSec: number, label: string]> = [
  [60, 1, 's'],
  [3600, 60, 'min'],
  [86_400, 3600, 'h'],
  [604_800, 86_400, 'd'],
  [2_592_000, 604_800, 't'],
  [31_536_000, 2_592_000, 'mies'],
];

export function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = (Date.now() - then) / 1000;
  if (diff < 5) return 'teraz';
  for (const [limit, div, label] of UNITS) {
    if (diff < limit) return `${Math.floor(diff / div)} ${label} temu`;
  }
  return `${Math.floor(diff / 31_536_000)} lat temu`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}
