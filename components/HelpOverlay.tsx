'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  VisuallyHidden,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { shouldToggleHelp } from '@/lib/ui/help-hotkey';
import { helpOpenEvent } from '@/lib/ui/overlay-events';

interface Shortcut {
  keys: string[];
  label: string;
}

interface HelpSection {
  title: string;
  rows: Shortcut[];
}

const HELP_SECTIONS: ReadonlyArray<HelpSection> = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['/'], label: 'Focus sidebar search' },
      { keys: ['?'], label: 'Toggle this help' },
      { keys: ['Esc'], label: 'Close dialog' },
    ],
  },
  {
    title: 'Terminal',
    rows: [
      { keys: ['⌘', 'T'], label: 'New shell tab' },
      { keys: ['⌘', 'W'], label: 'Close tab' },
      { keys: ['MMB'], label: 'Middle-click closes tab' },
    ],
  },
  {
    title: 'Editor',
    rows: [
      { keys: ['⌘', 'S'], label: 'Save CLAUDE.md' },
      { keys: ['⌘', '⇧', 'P'], label: 'Toggle preview' },
      { keys: ['⌘', 'D'], label: 'Diff before save' },
    ],
  },
  {
    title: 'Replay',
    rows: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['Esc'], label: 'Exit replay' },
    ],
  },
];

export function HelpOverlay() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!shouldToggleHelp(event)) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener(helpOpenEvent, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(helpOpenEvent, onOpen);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent bare hideClose className="ch-modal wide">
        <VisuallyHidden>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Press ? outside any text field to toggle this view.</DialogDescription>
        </VisuallyHidden>
        <div className="modal-head">
          <h3>Keyboard shortcuts</h3>
          <span className="sub">? to toggle</span>
        </div>
        <div className="help-grid" data-testid="help-overlay-list">
          {HELP_SECTIONS.map((sec) => (
            <div key={sec.title} className="help-sec">
              <h4>{sec.title}</h4>
              {sec.rows.map((r, i) => (
                <div key={i} className="help-row">
                  <span>{r.label}</span>
                  <span className="keys">
                    {r.keys.map((k, j) => (
                      <Kbd key={j}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
