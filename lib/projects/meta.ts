import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PATHS } from '@/lib/server/config';

const META_FILE = join(PATHS.CODEHELM_STATE_DIR, 'meta.json');
const LEGACY_ALIASES_FILE = join(PATHS.CODEHELM_STATE_DIR, 'aliases.json');
const MAX_ALIAS_LEN = 120;
const MAX_ENTRIES = 10_000;
const ALIAS_RE = /^[\p{L}\p{N}\p{Mark} ._\-:/()&+]+$/u;

export interface ProjectMeta {
  alias?: string;
  favorite?: boolean;
}

export type ProjectMetaMap = Record<string, ProjectMeta>;

export function isValidAlias(value: string): boolean {
  if (!value || value.length > MAX_ALIAS_LEN) return false;
  if (value.includes('\0') || value.includes('\n')) return false;
  return ALIAS_RE.test(value);
}

function sanitizeEntry(raw: unknown): ProjectMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const out: ProjectMeta = {};
  if (typeof entry['alias'] === 'string' && isValidAlias(entry['alias'])) {
    out.alias = entry['alias'];
  }
  if (entry['favorite'] === true) {
    out.favorite = true;
  }
  if (out.alias === undefined && out.favorite === undefined) return null;
  return out;
}

function parseMeta(raw: unknown): ProjectMetaMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ProjectMetaMap = {};
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof slug !== 'string' || !slug) continue;
    const entry = sanitizeEntry(value);
    if (entry) out[slug] = entry;
  }
  return out;
}

function parseLegacyAliases(raw: unknown): ProjectMetaMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ProjectMetaMap = {};
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof slug !== 'string' || !slug) continue;
    if (typeof value !== 'string' || !isValidAlias(value)) continue;
    out[slug] = { alias: value };
  }
  return out;
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    return null;
  }
}

/**
 * Returns the full meta map. If meta.json is missing but a legacy
 * aliases.json exists, its entries fold into the new shape on first read.
 * The legacy file is left on disk to keep the migration reversible until
 * the next meta write lands.
 */
export async function readMeta(): Promise<ProjectMetaMap> {
  const direct = await readJsonIfExists(META_FILE);
  if (direct !== null) return parseMeta(direct);
  const legacy = await readJsonIfExists(LEGACY_ALIASES_FILE);
  if (legacy !== null) return parseLegacyAliases(legacy);
  return {};
}

export async function writeMeta(next: ProjectMetaMap): Promise<void> {
  const entries = Object.entries(next).filter(([, v]) => {
    if (!v) return false;
    return v.alias !== undefined || v.favorite === true;
  });
  if (entries.length > MAX_ENTRIES) throw new Error('too_many_entries');
  const normalized: ProjectMetaMap = {};
  for (const [slug, value] of entries) {
    const clean: ProjectMeta = {};
    if (value.alias) clean.alias = value.alias;
    if (value.favorite) clean.favorite = true;
    normalized[slug] = clean;
  }
  const dir = dirname(META_FILE);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const tmp = `${META_FILE}.${randomUUID()}.tmp`;
  const data = JSON.stringify(normalized, null, 2);
  await writeFile(tmp, data, { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, META_FILE);
  await chmod(META_FILE, 0o600).catch(() => undefined);
}

export interface MetaPatch {
  alias?: string | null;
  favorite?: boolean;
}

export async function setProjectMeta(slug: string, patch: MetaPatch): Promise<ProjectMetaMap> {
  const current = await readMeta();
  const entry: ProjectMeta = { ...(current[slug] ?? {}) };
  if (patch.alias !== undefined) {
    if (patch.alias === null || patch.alias === '') {
      delete entry.alias;
    } else {
      if (!isValidAlias(patch.alias)) throw new Error('invalid_alias');
      entry.alias = patch.alias;
    }
  }
  if (patch.favorite !== undefined) {
    if (patch.favorite) entry.favorite = true;
    else delete entry.favorite;
  }
  if (entry.alias === undefined && entry.favorite !== true) {
    delete current[slug];
  } else {
    current[slug] = entry;
  }
  await writeMeta(current);
  return current;
}

/** Legacy-shaped view: slug → alias. */
export function aliasesFromMeta(meta: ProjectMetaMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, value] of Object.entries(meta)) {
    if (value.alias) out[slug] = value.alias;
  }
  return out;
}

export const __test = {
  META_FILE,
  LEGACY_ALIASES_FILE,
  parseMeta,
  parseLegacyAliases,
};
