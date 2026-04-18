'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  VisuallyHidden,
} from '@/components/ui/dialog';
import { CHButton } from '@/components/ui/ch-button';
import { IconSettings } from '@/components/ui/icons';
import { useSettings, useSetSettings } from '@/hooks/use-settings';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import {
  TERMINAL_FONT_SIZES,
  THEMES,
  VIEWER_DENSITIES,
  VIEWER_FONT_SIZES,
  type Settings,
  type Theme,
  type TerminalFontSize,
  type ViewerDensity,
  type ViewerFontSize,
} from '@/lib/settings/types';
import {
  MODEL_RATE_KEYS,
  type ModelPricing,
  type ModelRate,
  type ModelRateKey,
} from '@/lib/jsonl/usage';
import { EVENT_CATEGORIES, type EventCategory } from '@/lib/jsonl/outline';
import { TIMESTAMP_FORMATS, type TimestampFormat } from '@/lib/jsonl/format-timestamp';
import { settingsOpenEvent } from '@/lib/ui/overlay-events';
import { cn } from '@/lib/utils';

const VIEWER_FONT_LABEL: Record<ViewerFontSize, string> = {
  xs: 'Extra small',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
};

const DENSITY_LABEL: Record<ViewerDensity, string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  spacious: 'Spacious',
};

const THEME_LABEL: Record<Theme, string> = {
  dark: 'Dark',
  darker: 'Darker',
  'solarized-dark': 'Solarized dark',
};

const MODEL_LABEL: Record<ModelRateKey, string> = {
  'opus-4': 'Opus 4',
  'sonnet-4': 'Sonnet 4',
  'haiku-4': 'Haiku 4',
  default: 'Default (unknown model)',
};

const CATEGORY_LABEL: Record<EventCategory, string> = {
  user: 'User',
  assistant: 'Assistant',
  tools: 'Tools',
  system: 'System',
};

const TIMESTAMP_LABEL: Record<TimestampFormat, string> = {
  relative: 'Relative',
  iso: 'ISO',
  local: 'Local',
};

const RATE_FIELDS: { key: keyof ModelRate; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'output', label: 'Output' },
  { key: 'cacheWrite', label: 'Cache write' },
  { key: 'cacheRead', label: 'Cache read' },
];

type Section = 'appearance' | 'viewer' | 'terminal' | 'filters' | 'pricing';

const SECTION_LABEL: Record<Section, string> = {
  appearance: 'Appearance',
  viewer: 'Viewer',
  terminal: 'Terminal',
  filters: 'Filters',
  pricing: 'Pricing',
};

function Seg<T extends string | number>({
  value,
  options,
  setValue,
  format,
}: {
  value: T;
  options: readonly T[];
  setValue: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div className="seg-input">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          className={value === o ? 'on' : ''}
          onClick={() => setValue(o)}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>('appearance');
  const { data: settings } = useSettings();
  const { mutate, isPending } = useSetSettings();

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(settingsOpenEvent, onOpen);
    return () => window.removeEventListener(settingsOpenEvent, onOpen);
  }, []);

  const current: Settings = settings ?? DEFAULT_SETTINGS;

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    mutate({ [key]: value } as Partial<Settings>);
  };

  const updateRate = (model: ModelRateKey, field: keyof ModelRate, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    const nextPricing: ModelPricing = {
      ...current.modelPricing,
      [model]: { ...current.modelPricing[model], [field]: value },
    };
    update('modelPricing', nextPricing);
  };

  const toggleCategory = (c: EventCategory) => {
    const hidden = new Set(current.hiddenCategories);
    if (hidden.has(c)) hidden.delete(c);
    else hidden.add(c);
    update(
      'hiddenCategories',
      EVENT_CATEGORIES.filter((x) => hidden.has(x)),
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className="ch-btn sm"
          style={{ width: 26, padding: 0, justifyContent: 'center' }}
        >
          <IconSettings />
        </button>
      </DialogTrigger>
      <DialogContent bare hideClose className="ch-modal wide">
        <VisuallyHidden>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Appearance and typography. Changes are saved immediately.
          </DialogDescription>
        </VisuallyHidden>
        <div className="modal-head">
          <h3>Settings</h3>
          <span className="sub">~/.codehelm/settings.json</span>
        </div>
        <div className="settings-grid">
          <nav className="settings-nav">
            {(Object.keys(SECTION_LABEL) as Section[]).map((s) => (
              <button
                key={s}
                type="button"
                className={s === section ? 'on' : ''}
                onClick={() => setSection(s)}
              >
                {SECTION_LABEL[s]}
              </button>
            ))}
          </nav>
          <div className="settings-body">
            {section === 'appearance' && (
              <>
                <Row label="Accent" hint="Traces back to banner gold.">
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      background: 'var(--gold-400)',
                      border: '1px solid var(--gold-700)',
                    }}
                  />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                    #d4a72c · codehelm gold
                  </span>
                </Row>
                <Row label="Theme" hint="Light is out of scope.">
                  <Seg
                    value={current.theme}
                    options={THEMES}
                    setValue={(v: Theme) => update('theme', v)}
                    format={(v) => THEME_LABEL[v]}
                  />
                </Row>
                <Row label="Timestamps">
                  <Seg
                    value={current.timestampFormat}
                    options={TIMESTAMP_FORMATS}
                    setValue={(v: TimestampFormat) => update('timestampFormat', v)}
                    format={(v) => TIMESTAMP_LABEL[v]}
                  />
                </Row>
              </>
            )}

            {section === 'viewer' && (
              <>
                <Row label="Viewer density" hint="Padding + line-height around each event.">
                  <Seg
                    value={current.viewerDensity}
                    options={VIEWER_DENSITIES}
                    setValue={(v: ViewerDensity) => update('viewerDensity', v)}
                    format={(v) => DENSITY_LABEL[v]}
                  />
                </Row>
                <Row label="Viewer font size">
                  <Seg
                    value={current.viewerFontSize}
                    options={VIEWER_FONT_SIZES}
                    setValue={(v: ViewerFontSize) => update('viewerFontSize', v)}
                    format={(v) => VIEWER_FONT_LABEL[v]}
                  />
                </Row>
              </>
            )}

            {section === 'terminal' && (
              <Row label="Terminal font size">
                <Seg
                  value={current.terminalFontSize}
                  options={TERMINAL_FONT_SIZES}
                  setValue={(v: TerminalFontSize) => update('terminalFontSize', v)}
                  format={(v) => `${v}px`}
                />
              </Row>
            )}

            {section === 'filters' && (
              <Row
                label="Default hidden categories"
                hint="Selected categories start hidden when a session opens. The chips in the session view can still be toggled locally."
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EVENT_CATEGORIES.map((c) => {
                    const hidden = current.hiddenCategories.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCategory(c)}
                        disabled={isPending}
                        aria-pressed={hidden}
                        className={cn('chip', hidden && 'on')}
                      >
                        {CATEGORY_LABEL[c]}
                      </button>
                    );
                  })}
                </div>
              </Row>
            )}

            {section === 'pricing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ color: 'var(--fg-3)', fontSize: 11 }}>
                  Model pricing (USD / 1M tokens). Applied to cost estimates.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) repeat(4, 5rem)',
                    gap: 8,
                    color: 'var(--fg-4)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  <span />
                  {RATE_FIELDS.map((f) => (
                    <span key={f.key} style={{ textAlign: 'right' }}>
                      {f.label}
                    </span>
                  ))}
                </div>
                {MODEL_RATE_KEYS.map((model) => {
                  const rate = current.modelPricing[model];
                  return (
                    <div
                      key={model}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0,1fr) repeat(4, 5rem)',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ color: 'var(--fg-1)' }}>{MODEL_LABEL[model]}</span>
                      {RATE_FIELDS.map((f) => (
                        <input
                          key={f.key}
                          type="number"
                          min={0}
                          step={0.01}
                          aria-label={`${MODEL_LABEL[model]} — ${f.label}`}
                          value={rate[f.key]}
                          disabled={isPending}
                          onChange={(e) => updateRate(model, f.key, Number(e.target.value))}
                          className="ch-input sm plain"
                          style={{ textAlign: 'right' }}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <span>Changes save instantly.</span>
          <span style={{ marginLeft: 'auto' }} />
          <CHButton variant="outline" size="sm" onClick={() => setOpen(false)}>
            close
          </CHButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div>
        <div className="lbl">{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div className="val">{children}</div>
    </div>
  );
}
