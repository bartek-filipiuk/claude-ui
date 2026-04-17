export const TIMESTAMP_FORMATS = ['relative', 'iso', 'local'] as const;
export type TimestampFormat = (typeof TIMESTAMP_FORMATS)[number];

const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;
const MS_IN_DAY = 24 * MS_IN_HOUR;
const MS_IN_MONTH = 30 * MS_IN_DAY;
const MS_IN_YEAR = 365 * MS_IN_DAY;

function formatRelative(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('pl', { numeric: 'auto' });
  const pick = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    rtf.format(Math.round(value), unit);
  if (absMs < MS_IN_MINUTE) return pick(diffMs / MS_IN_SECOND, 'second');
  if (absMs < MS_IN_HOUR) return pick(diffMs / MS_IN_MINUTE, 'minute');
  if (absMs < MS_IN_DAY) return pick(diffMs / MS_IN_HOUR, 'hour');
  if (absMs < MS_IN_MONTH) return pick(diffMs / MS_IN_DAY, 'day');
  if (absMs < MS_IN_YEAR) return pick(diffMs / MS_IN_MONTH, 'month');
  return pick(diffMs / MS_IN_YEAR, 'year');
}

function formatLocal(target: Date): string {
  return target.toLocaleTimeString('pl-PL', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTimestamp(
  iso: string | null | undefined,
  mode: TimestampFormat,
  now: Date = new Date(),
): string {
  if (typeof iso !== 'string' || iso.length === 0) return '';
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '';
  if (mode === 'iso') return iso;
  if (mode === 'local') return formatLocal(target);
  return formatRelative(target, now);
}
