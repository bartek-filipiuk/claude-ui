#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-command setup for the claude-ui launcher. Runs after `git clone`:
 *
 *   node bin/install.ts            # full install
 *   node bin/install.ts --dry-run  # report only
 *   node bin/install.ts --skip-build
 *
 * Security posture: never invokes a shell, uses spawnSync with array args,
 * refuses to clobber an existing non-symlink at the target, never edits the
 * user's shell rc (prints the snippet so the user can paste it themselves).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkNodeVersion,
  detectOs,
  needsPathUpdate,
  pathRcSnippet,
  resolveHomeBinDir,
} from '../lib/install/checks';
import { chromiumCandidates, findChromium } from '../lib/server/platform';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

interface Flags {
  dryRun: boolean;
  skipBuild: boolean;
  noSymlink: boolean;
  help: boolean;
}

function parseFlags(argv: readonly string[]): Flags {
  return {
    dryRun: argv.includes('--dry-run'),
    skipBuild: argv.includes('--skip-build'),
    noSymlink: argv.includes('--no-symlink'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printHelp(): void {
  console.log(`claude-ui installer

  Usage:
    node bin/install.ts [flags]

  Flags:
    --dry-run       Print the plan without touching the filesystem.
    --skip-build    Skip "pnpm build" (development install).
    --no-symlink    Don't create ~/.local/bin/claude-ui.
    --help, -h      Show this message.
`);
}

function log(step: string, detail?: string): void {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`[${stamp}] ${step}${detail ? ` — ${detail}` : ''}`);
}

function die(msg: string, code = 1): never {
  console.error(`error: ${msg}`);
  process.exit(code);
}

function runStep(
  name: string,
  bin: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): void {
  log(name, `${bin} ${args.join(' ')}`);
  const res = spawnSync(bin, args, {
    cwd: opts.cwd ?? ROOT,
    env: opts.env ?? process.env,
    stdio: 'inherit',
    shell: false,
    timeout: 300_000,
  });
  if (res.status !== 0) {
    die(`step "${name}" failed with exit code ${res.status ?? 'null'}`);
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }

  log('os', `${process.platform} ${process.arch}`);
  const os = detectOs();
  if (os.kind === 'unsupported') die(os.hint);

  const node = checkNodeVersion();
  if (!node.ok) die(node.hint ?? 'node too old');
  log('node', process.versions.node);

  // pnpm — assume present or available via corepack; only flag if truly missing.
  const pnpmCheck = spawnSync('pnpm', ['--version'], { shell: false });
  if (pnpmCheck.status !== 0) {
    log('pnpm', 'not on PATH — enabling via corepack');
    if (!flags.dryRun) {
      runStep('corepack enable', 'corepack', ['enable']);
      runStep('corepack prepare', 'corepack', ['prepare', 'pnpm@9', '--activate']);
    }
  } else {
    log('pnpm', (pnpmCheck.stdout ?? '').toString().trim());
  }

  if (flags.dryRun) {
    log('dry-run', 'skipping pnpm install, build, symlink');
  } else {
    runStep('install', 'pnpm', ['install', '--frozen-lockfile']);
  }

  // Dry-load node-pty so we surface a missing prebuild right here rather than
  // at first terminal spawn — user gets an actionable error in the install log.
  try {
    await import('@homebridge/node-pty-prebuilt-multiarch');
    log('node-pty', 'loaded OK');
  } catch (err) {
    die(
      `node-pty failed to load: ${(err as Error).message}\n` +
        'The prebuild is likely missing for this platform. See T25 in TASKS.md for the tracked fix.',
    );
  }

  const chrome = findChromium();
  if (chrome) {
    log('chromium', chrome);
  } else {
    log(
      'chromium',
      `not found. Tried: ${chromiumCandidates().slice(0, 5).join(', ')}…  Install Chrome/Chromium before running.`,
    );
  }

  if (!flags.skipBuild && !flags.dryRun) {
    runStep('build', 'pnpm', ['build']);
  } else {
    log('build', 'skipped');
  }

  if (!flags.noSymlink) {
    const binDir = resolveHomeBinDir();
    const target = join(binDir, 'claude-ui');
    const source = join(ROOT, 'bin', 'claude-ui');

    if (flags.dryRun) {
      log('symlink', `would link ${target} -> ${source}`);
    } else {
      mkdirSync(binDir, { recursive: true, mode: 0o700 });
      if (existsSync(target)) {
        const st = lstatSync(target);
        if (st.isSymbolicLink()) {
          const current = readlinkSync(target);
          if (current === source) {
            log('symlink', `already points at ${source}`);
          } else {
            unlinkSync(target);
            symlinkSync(source, target);
            log('symlink', `replaced ${current} with ${source}`);
          }
        } else {
          die(`${target} exists and is not a symlink; refusing to overwrite.`);
        }
      } else {
        symlinkSync(source, target);
        log('symlink', `created ${target} -> ${source}`);
      }
    }

    if (needsPathUpdate(binDir, process.env['PATH'])) {
      console.log('');
      console.log(`note: ${binDir} is not in PATH. Append this line to your shell rc:`);
      console.log(`  ${pathRcSnippet(binDir)}`);
      console.log('');
    }
  }

  log('done', 'Run `claude-ui` to start.');
}

main().catch((err) => {
  console.error(`claude-ui install fatal: ${(err as Error).message}`);
  process.exit(1);
});
