'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { shouldToggleHelp } from '@/lib/ui/help-hotkey';

interface Shortcut {
  keys: string;
  label: string;
}

const SHORTCUTS: ReadonlyArray<Shortcut> = [
  { keys: '?', label: 'Pokaż/ukryj listę skrótów' },
  { keys: 'Ctrl+K', label: 'Paleta poleceń' },
  { keys: 'Ctrl+S', label: 'Zapisz CLAUDE.md' },
  { keys: 'Ctrl+T', label: 'Nowa karta terminala' },
  { keys: '/', label: 'Fokus w wyszukiwarce projektów' },
  { keys: 'g g', label: 'Przewiń viewer na górę' },
  { keys: 'G', label: 'Przewiń viewer na dół' },
  { keys: 'Esc', label: 'Zamknij dialog' },
];

export function HelpOverlay() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!shouldToggleHelp(event)) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skróty klawiaturowe</DialogTitle>
          <DialogDescription>
            Naciśnij ? poza polem tekstowym, aby przełączyć ten widok.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm" data-testid="help-overlay-list">
          {SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.keys}
              className="flex items-center justify-between gap-4 border-b border-neutral-800 pb-2 last:border-b-0 last:pb-0"
            >
              <span className="text-neutral-300">{shortcut.label}</span>
              <kbd className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-100">
                {shortcut.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
