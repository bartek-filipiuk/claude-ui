import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpHome: string;
let stateDir: string;
let META_FILE: string;
let LEGACY_ALIASES_FILE: string;

vi.mock('@/lib/server/config', () => {
  return {
    PATHS: {
      get HOME() {
        return tmpHome;
      },
      get CLAUDE_DIR() {
        return join(tmpHome, '.claude');
      },
      get CLAUDE_PROJECTS_DIR() {
        return join(tmpHome, '.claude', 'projects');
      },
      get CLAUDE_GLOBAL_MD() {
        return join(tmpHome, '.claude', 'CLAUDE.md');
      },
      get CLAUDE_UI_STATE_DIR() {
        return join(tmpHome, '.claude', 'claude-ui');
      },
      get AUDIT_LOG() {
        return join(tmpHome, '.claude', 'claude-ui', 'audit.log');
      },
    },
  };
});

beforeEach(async () => {
  tmpHome = join(tmpdir(), `claude-ui-meta-${randomBytes(6).toString('hex')}`);
  stateDir = join(tmpHome, '.claude', 'claude-ui');
  META_FILE = join(stateDir, 'meta.json');
  LEGACY_ALIASES_FILE = join(stateDir, 'aliases.json');
  await mkdir(stateDir, { recursive: true });
  vi.resetModules();
});

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true });
});

async function loadModule() {
  return import('@/lib/projects/meta');
}

describe('readMeta migration', () => {
  it('returns an empty object when no files exist', async () => {
    const { readMeta } = await loadModule();
    expect(await readMeta()).toEqual({});
  });

  it('reads the new meta.json format', async () => {
    await writeFile(
      META_FILE,
      JSON.stringify({
        '-home-x': { alias: 'X', favorite: true },
        '-home-y': { favorite: true },
      }),
    );
    const { readMeta } = await loadModule();
    const meta = await readMeta();
    expect(meta).toEqual({
      '-home-x': { alias: 'X', favorite: true },
      '-home-y': { favorite: true },
    });
  });

  it('migrates the legacy aliases.json on first read', async () => {
    await writeFile(
      LEGACY_ALIASES_FILE,
      JSON.stringify({ '-home-foo': 'Foo', '-home-bar': 'Bar' }),
    );
    const { readMeta } = await loadModule();
    const meta = await readMeta();
    expect(meta).toEqual({
      '-home-foo': { alias: 'Foo' },
      '-home-bar': { alias: 'Bar' },
    });
  });

  it('ignores aliases.json when meta.json already exists', async () => {
    await writeFile(META_FILE, JSON.stringify({ '-home-x': { alias: 'New' } }));
    await writeFile(LEGACY_ALIASES_FILE, JSON.stringify({ '-home-x': 'Old' }));
    const { readMeta } = await loadModule();
    expect(await readMeta()).toEqual({ '-home-x': { alias: 'New' } });
  });

  it('skips invalid entries (XSS in alias, wrong types)', async () => {
    await writeFile(
      META_FILE,
      JSON.stringify({
        '-home-a': { alias: '', favorite: true },
        '-home-b': { alias: 'bad\nnewline', favorite: true },
        '-home-c': { alias: 'ok name', favorite: 'yes' },
        '-home-d': 'not-an-object',
      }),
    );
    const { readMeta } = await loadModule();
    const meta = await readMeta();
    expect(meta).toEqual({
      '-home-a': { favorite: true },
      '-home-b': { favorite: true },
      '-home-c': { alias: 'ok name' },
    });
  });
});

describe('setProjectMeta', () => {
  it('sets and clears favorite while preserving the alias', async () => {
    const { setProjectMeta, readMeta } = await loadModule();
    await setProjectMeta('-home-a', { alias: 'Alpha' });
    await setProjectMeta('-home-a', { favorite: true });
    let meta = await readMeta();
    expect(meta['-home-a']).toEqual({ alias: 'Alpha', favorite: true });

    await setProjectMeta('-home-a', { favorite: false });
    meta = await readMeta();
    expect(meta['-home-a']).toEqual({ alias: 'Alpha' });
  });

  it('drops the entry after removing alias and unpinning', async () => {
    const { setProjectMeta, readMeta } = await loadModule();
    await setProjectMeta('-home-x', { alias: 'X', favorite: true });
    await setProjectMeta('-home-x', { alias: null });
    await setProjectMeta('-home-x', { favorite: false });
    const meta = await readMeta();
    expect(meta['-home-x']).toBeUndefined();
  });

  it('rejects malformed aliases', async () => {
    const { setProjectMeta } = await loadModule();
    await expect(setProjectMeta('-home-x', { alias: 'bad\nname' })).rejects.toThrow(
      'invalid_alias',
    );
  });

  it('favorite survives a re-read after write', async () => {
    const { setProjectMeta } = await loadModule();
    await setProjectMeta('-home-pin', { favorite: true });
    const raw = JSON.parse(await readFile(META_FILE, 'utf8')) as Record<string, unknown>;
    expect(raw['-home-pin']).toEqual({ favorite: true });
  });
});

describe('aliasesFromMeta', () => {
  it('returns only entries that carry an alias', async () => {
    const { aliasesFromMeta } = await loadModule();
    expect(
      aliasesFromMeta({
        a: { alias: 'A', favorite: true },
        b: { favorite: true },
        c: { alias: 'C' },
      }),
    ).toEqual({ a: 'A', c: 'C' });
  });
});

describe('migration compatibility step', () => {
  it('setProjectMeta on an empty store picks up aliases.json migration', async () => {
    await writeFile(
      LEGACY_ALIASES_FILE,
      JSON.stringify({ '-home-old': 'OldAlias', '-home-keep': 'KeepAlias' }),
    );
    const { setProjectMeta, readMeta } = await loadModule();
    await setProjectMeta('-home-new', { favorite: true });
    const meta = await readMeta();
    expect(meta['-home-old']).toEqual({ alias: 'OldAlias' });
    expect(meta['-home-keep']).toEqual({ alias: 'KeepAlias' });
    expect(meta['-home-new']).toEqual({ favorite: true });
  });
});
