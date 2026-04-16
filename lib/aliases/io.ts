import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PATHS } from '@/lib/server/config';

const ALIASES_FILE = join(PATHS.CLAUDE_UI_STATE_DIR, 'aliases.json');
const MAX_ALIAS_LEN = 120;
const MAX_ALIASES = 10_000;
const ALIAS_RE = /^[\p{L}\p{N}\p{Mark} ._\-:/()&+]+$/u;

export interface AliasMap {
  [slug: string]: string;
}

export async function readAliases(): Promise<AliasMap> {
  try {
    const raw = await readFile(ALIASES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: AliasMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k !== 'string' || typeof v !== 'string') continue;
      if (!isValidAlias(v)) continue;
      out[k] = v;
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return {};
  }
}

export function isValidAlias(value: string): boolean {
  if (!value || value.length > MAX_ALIAS_LEN) return false;
  if (value.includes('\0') || value.includes('\n')) return false;
  return ALIAS_RE.test(value);
}

/**
 * Writes the whole alias map atomically (tmp + rename). Small enough to
 * rewrite each time; avoids partial state on crash.
 */
export async function writeAliases(next: AliasMap): Promise<void> {
  const entries = Object.entries(next);
  if (entries.length > MAX_ALIASES) throw new Error('too_many_aliases');
  const dir = dirname(ALIASES_FILE);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const tmp = `${ALIASES_FILE}.${randomUUID()}.tmp`;
  const data = JSON.stringify(Object.fromEntries(entries), null, 2);
  await writeFile(tmp, data, { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, ALIASES_FILE);
  await chmod(ALIASES_FILE, 0o600).catch(() => undefined);
}

export async function setAlias(slug: string, alias: string | null): Promise<AliasMap> {
  const current = await readAliases();
  if (alias === null || alias === '') {
    delete current[slug];
  } else {
    if (!isValidAlias(alias)) throw new Error('invalid_alias');
    current[slug] = alias;
  }
  await writeAliases(current);
  return current;
}
