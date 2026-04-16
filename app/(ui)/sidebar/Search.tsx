'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useUiStore } from '@/stores/ui-slice';

export function Search() {
  const setSearch = useUiStore((s) => s.setSearch);
  const [value, setValue] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setSearch(value), 150);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, setSearch]);

  return (
    <div className="px-3 pt-3">
      <Input
        type="search"
        placeholder="Szukaj projektu…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Szukaj projektu"
      />
    </div>
  );
}
