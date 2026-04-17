import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Pure, testable helpers that back the `claude-ui-install` CLI. Keep them
 * free of side effects (no spawn, no fs writes) so unit tests can hit
 * every branch without stubbing the filesystem.
 */

export type SupportedOs = 'linux' | 'darwin';
export type DetectedOs =
  | { kind: 'supported'; platform: SupportedOs }
  | { kind: 'unsupported'; platform: NodeJS.Platform; hint: string };

export function detectOs(platform: NodeJS.Platform = process.platform): DetectedOs {
  if (platform === 'linux' || platform === 'darwin') {
    return { kind: 'supported', platform };
  }
  const hint =
    platform === 'win32'
      ? 'Windows is not a native target. Run the installer inside WSL.'
      : `Unsupported platform "${platform}". Supported: linux, darwin.`;
  return { kind: 'unsupported', platform, hint };
}

export interface NodeVersionCheck {
  ok: boolean;
  detected: [number, number, number];
  required: [number, number, number];
  hint?: string;
}

export function checkNodeVersion(
  version: string = process.versions.node,
  required: [number, number, number] = [20, 11, 0],
): NodeVersionCheck {
  const parts = version.split('.').map((p) => parseInt(p, 10));
  const detected: [number, number, number] = [
    Number.isFinite(parts[0]) ? (parts[0] as number) : 0,
    Number.isFinite(parts[1]) ? (parts[1] as number) : 0,
    Number.isFinite(parts[2]) ? (parts[2] as number) : 0,
  ];
  const score = (v: [number, number, number]) => v[0] * 1_000_000 + v[1] * 1_000 + v[2];
  const ok = score(detected) >= score(required);
  return ok
    ? { ok, detected, required }
    : {
        ok,
        detected,
        required,
        hint: `Node ${required.join('.')}+ required; found ${version}. Try "nvm install 20".`,
      };
}

export function resolveHomeBinDir(home: string = homedir()): string {
  return join(home, '.local', 'bin');
}

/**
 * Pure PATH check — returns true when the given bin dir is missing from $PATH.
 * Handles the trailing-slash edge case and empty $PATH.
 */
export function needsPathUpdate(binDir: string, pathEnv: string | undefined): boolean {
  if (!pathEnv) return true;
  const normalized = binDir.replace(/\/+$/, '');
  return !pathEnv
    .split(':')
    .map((p) => p.replace(/\/+$/, ''))
    .includes(normalized);
}

/**
 * One-line shell rc snippet user can append to wire ~/.local/bin into PATH.
 */
export function pathRcSnippet(binDir: string): string {
  return `export PATH="${binDir}:$PATH"`;
}
