'use client';

import { useEffect, useState } from 'react';
import { ensureLang, getHighlighter } from '@/lib/ui/shiki';

interface Props {
  code: string;
  lang?: string | undefined;
}

export function CodeBlock({ code, lang }: Props) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const effective = await ensureLang(lang || 'text');
        const h = await getHighlighter();
        const out = h.codeToHtml(code, { lang: effective as never, theme: 'github-dark-default' });
        if (!cancelled) setHtml(out);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (!html) {
    return (
      <pre className="overflow-x-auto rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs">
        <code>{code}</code>
      </pre>
    );
  }
  // Shiki produces a pure syntax HTML tree from the user's code string —
  // no raw HTML pass-through, no executed scripts. This is the one place
  // where we bypass the project-wide lint rule intentionally.
  return (
    <div
      className="overflow-x-auto rounded-md border border-neutral-800 text-xs [&_pre]:!m-0 [&_pre]:!bg-neutral-950 [&_pre]:p-3"
      /* eslint-disable-next-line no-restricted-syntax */
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
