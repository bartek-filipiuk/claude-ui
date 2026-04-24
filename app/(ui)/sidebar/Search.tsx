'use client';

import { useEffect, useRef, useState } from 'react';
import { IconSearch } from '@/components/ui/icons';
import { Kbd } from '@/components/ui/kbd';
import { useUiStore } from '@/stores/ui-slice';

export function Search() {
  const setSearch = useUiStore((s) => s.setSearch);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setSearch(value), 150);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, setSearch]);

  // Focus on "/" when not already in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="sidebar-search">
      <span className="icon">
        <IconSearch />
      </span>
      <input
        ref={inputRef}
        type="search"
        className="ch-input"
        placeholder="Search projects"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Search projects"
      />
      <span className="kbd-hint">
        <Kbd>/</Kbd>
      </span>
    </div>
  );
}
