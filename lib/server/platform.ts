import { accessSync, constants as fsConstants, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

/**
 * Cross-platform helpers. Everything that branches on the host OS goes
 * through these functions so the launcher, PTY spawn path and installer
 * keep a single source of truth about shell defaults, runtime directory
 * candidates and Chromium discovery order.
 *
 * Target platforms: linux + darwin. Anywhere else (win32, openbsd, …) the
 * functions still return best-effort values; higher-level code is expected
 * to explicitly reject unsupported platforms.
 */

export type SupportedPlatform = 'linux' | 'darwin';

export function currentPlatform(): NodeJS.Platform {
  return process.platform;
}

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export function isLinux(): boolean {
  return process.platform === 'linux';
}

export function isSupportedPlatform(): boolean {
  return isMacOS() || isLinux();
}

/**
 * Resolve the default shell. Prefers `$SHELL` when it is an absolute path —
 * that's what both Linux and macOS set for interactive users. Falls back to
 * `/bin/zsh` on darwin (Monterey+ default) and `/bin/bash` on linux. Never
 * returns a relative path so spawn() will not search $PATH.
 */
export function defaultShell(
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const fromEnv = env['SHELL'];
  if (typeof fromEnv === 'string' && fromEnv.startsWith('/')) {
    return fromEnv;
  }
  if (platform === 'darwin') return '/bin/zsh';
  return '/bin/bash';
}

/**
 * Best writable directory for the Chromium profile (and any other runtime
 * scratch). On Linux, `$XDG_RUNTIME_DIR` is tmpfs with per-user permissions;
 * on macOS only `$TMPDIR` is set. Falls back to `os.tmpdir()` as last resort.
 * The returned path is guaranteed to exist on disk.
 */
export function runtimeRootDir(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const candidates = [env['XDG_RUNTIME_DIR'], env['TMPDIR'], tmpdir()].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return tmpdir();
}

/**
 * Ordered list of absolute paths to try when launching the UI in a Chromium
 * --app window. Environment override wins so users can point at
 * Brave / Arc / Edge / Thorium builds explicitly.
 */
export function chromiumCandidates(
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const override = env['CODEHELM_CHROMIUM'];
  const base = override && override.length > 0 ? [override] : [];

  if (platform === 'darwin') {
    return [
      ...base,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Arc.app/Contents/MacOS/Arc',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }

  // linux + fallback for other unix-y systems
  return [
    ...base,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ];
}

/**
 * Pick the first chromium candidate that resolves to an executable file.
 * When no candidate is executable, returns null so callers can surface
 * an actionable error instead of silently spawning something wrong.
 */
export function findChromium(candidates: readonly string[] = chromiumCandidates()): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const resolved = realpathSync(candidate);
      accessSync(resolved, fsConstants.X_OK);
      return resolved;
    } catch {
      // Not present or not executable — try the next candidate.
    }
  }
  return null;
}
