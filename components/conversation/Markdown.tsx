'use client';

import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { CodeBlock } from './CodeBlock';

interface Props {
  text: string;
}

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'code', 'pre'],
};

export function Markdown({ text }: Props) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-code:text-neutral-300">
      <ReactMarkdown
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          code(props) {
            const { className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className ?? '');
            const isBlock =
              (props as unknown as { node?: { position?: unknown } }).node &&
              typeof children === 'string' &&
              children.includes('\n');
            if (match || isBlock) {
              return <CodeBlock code={String(children).replace(/\n$/, '')} lang={match?.[1]} />;
            }
            return (
              <code className="rounded bg-neutral-800 px-1 py-0.5 text-[0.85em]" {...rest}>
                {children}
              </code>
            );
          },
          a({ children, href, ...rest }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-neutral-200 underline decoration-neutral-500 underline-offset-2 hover:decoration-neutral-300"
                {...rest}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
