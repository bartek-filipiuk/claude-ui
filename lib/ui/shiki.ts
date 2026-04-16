'use client';

import type { Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

const DEFAULT_LANGS = [
  'bash',
  'shell',
  'json',
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'python',
  'diff',
  'markdown',
];

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const shiki = await import('shiki');
      const h = await shiki.createHighlighter({
        themes: ['github-dark-default'],
        langs: DEFAULT_LANGS,
      });
      DEFAULT_LANGS.forEach((l) => loadedLangs.add(l));
      return h;
    })();
  }
  return highlighterPromise;
}

export async function ensureLang(lang: string): Promise<string> {
  const normalized = lang.toLowerCase();
  if (loadedLangs.has(normalized)) return normalized;
  try {
    const h = await getHighlighter();
    await h.loadLanguage(normalized as never);
    loadedLangs.add(normalized);
    return normalized;
  } catch {
    return 'text';
  }
}
