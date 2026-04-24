const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CR_LF_ONLY = /[\r\t]/g;

export const IDLE_READY_MS = 3000;

export function stripAnsi(input: string): string {
  return input.replace(OSC_RE, '').replace(ANSI_RE, '').replace(CR_LF_ONLY, '');
}

const MARKER_RE =
  /(^|\n)[^\n]*(?:│|╭|╰|>)\s*(?:▊|█|_)?\s*$|\$\s*$|#\s*$|❯\s*$|\)\s*\$\s*$/;

export function markerMatches(tail: string): boolean {
  const stripped = stripAnsi(tail).trimEnd();
  if (!stripped) return false;
  const lastLines = stripped.split('\n').slice(-6).join('\n');
  return MARKER_RE.test(lastLines);
}

export function isReadyHybrid(tail: string, lastDataAt: number, now = Date.now()): boolean {
  const idle = now - lastDataAt >= IDLE_READY_MS;
  if (idle) return true;
  return markerMatches(tail);
}
