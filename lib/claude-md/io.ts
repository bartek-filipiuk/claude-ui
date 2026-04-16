import { mkdir, readFile, rename, stat, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LIMITS } from '@/lib/server/config';
import { audit } from '@/lib/server/audit';

export interface ReadResult {
  content: string;
  mtime: string;
  size: number;
}

export async function readClaudeMd(path: string): Promise<ReadResult | null> {
  try {
    const st = await stat(path);
    if (!st.isFile()) return null;
    const content = await readFile(path, 'utf8');
    return { content, mtime: st.mtime.toUTCString(), size: st.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export interface WriteResult {
  mtime: string;
  size: number;
  writeKind: 'created' | 'updated';
}

/**
 * Atomic write with optional mtime precondition. Writes to `<path>.<uuid>.tmp`
 * in the same directory, then renames in a single syscall so readers never
 * see a half-written file. If `ifUnmodifiedSince` is set and the on-disk
 * mtime is newer, throws 'conflict' — caller turns that into a 412.
 */
export async function writeClaudeMd(
  path: string,
  content: string,
  opts: { ifUnmodifiedSince?: string } = {},
): Promise<WriteResult> {
  if (Buffer.byteLength(content, 'utf8') > LIMITS.CLAUDE_MD_MAX_BYTES) {
    throw new Error('too_large');
  }

  let writeKind: 'created' | 'updated' = 'updated';
  let existingStat;
  try {
    existingStat = await stat(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      writeKind = 'created';
      existingStat = null;
    } else {
      throw err;
    }
  }

  if (existingStat && opts.ifUnmodifiedSince) {
    const header = Date.parse(opts.ifUnmodifiedSince);
    if (Number.isNaN(header) || existingStat.mtimeMs > header + 999) {
      throw new Error('conflict');
    }
  }

  // Ensure the directory exists (create() path writes into a dir that should
  // already exist — but for global CLAUDE.md the ~/.claude dir is ours).
  await mkdir(dirname(path), { recursive: true });

  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, { encoding: 'utf8', mode: 0o644 });
  try {
    await chmod(tmp, 0o644);
  } catch {
    /* ignore chmod failure — mode came from writeFile */
  }
  await rename(tmp, path);

  const st = await stat(path);
  await audit({
    event: 'claude_md_write',
    path,
    bytes: st.size,
    writeKind,
  });
  return { mtime: st.mtime.toUTCString(), size: st.size, writeKind };
}
