import { useState } from 'react';
import { describeSchema } from '../../lib/zod-introspect';
import type { FieldDescriptor } from '../../lib/zod-introspect';
import { useRunner } from '../context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Default value generator ──────────────────────────────────────────────────

function autoDefault(field: FieldDescriptor): string | number | boolean {
  if (field.kind === 'boolean') {
    return true;
  }
  if (field.kind === 'enum') {
    return field.options[0] ?? '';
  }

  if (field.kind === 'number') {
    if (field.min !== undefined) {
      return field.min;
    }
    const n = field.name.toLowerCase();
    if (n.includes('count') || n.includes('size') || n.includes('head')) {
      return 3;
    }
    if (n.includes('platform')) {
      return 1;
    }
    return 1;
  }

  const n = field.name.toLowerCase();
  let base = 'value';
  if (/(by|lead|manager|officer|author|engineer)/.test(n)) {
    base = 'ENG-001';
  } else if (
    n.includes('reason') ||
    n.includes('description') ||
    n.includes('summary') ||
    n.includes('actions')
  ) {
    base = 'Completed as scheduled';
  } else if (n.includes('url')) {
    base = 'https://example.com/doc';
  } else if (n.includes('sha')) {
    base = 'a'.repeat(40);
  } else if (n.includes('switch') && n.includes('ref')) {
    base = 'SW-A01';
  } else if (n.includes('clearance') && n.includes('ref')) {
    base = 'CLR-001';
  } else if (n.endsWith('ref') || n.includes('ref')) {
    base = 'REF-001';
  } else if (n.endsWith('id') || n.includes('trainid') || n.includes('ticket')) {
    base = 'ID-001';
  } else if (n.includes('at') || n.includes('expires')) {
    base = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16);
  } else if (
    n.includes('note') ||
    n.includes('finding') ||
    n.includes('cause') ||
    n.includes('fix')
  ) {
    base = 'No issues noted';
  } else if (n.includes('channel')) {
    base = '#incident-response';
  } else if (n.includes('version')) {
    base = '1.0.0';
  } else if (n.includes('team')) {
    base = 'platform-eng';
  }

  const min = field.kind === 'string' ? (field.min ?? 0) : 0;
  return base.length >= min ? base : base.padEnd(min, '-');
}

function buildDefaults(fields: FieldDescriptor[]): {
  text: Record<string, string>;
  bool: Record<string, boolean>;
  num: Record<string, string>;
} {
  const text: Record<string, string> = {};
  const bool: Record<string, boolean> = {};
  const num: Record<string, string> = {};
  for (const f of fields) {
    const val = autoDefault(f);
    if (f.kind === 'boolean') {
      bool[f.name] = val as boolean;
    } else if (f.kind === 'number') {
      num[f.name] = String(val);
    } else {
      text[f.name] = String(val);
    }
  }
  return { text, bool, num };
}

// ─── Payload coercion ─────────────────────────────────────────────────────────

function coercePayload(
  fields: FieldDescriptor[],
  text: Record<string, string>,
  bool: Record<string, boolean>,
  num: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'boolean') {
      out[f.name] = bool[f.name] ?? false;
    } else if (f.kind === 'number') {
      const raw = num[f.name] ?? '';
      out[f.name] = raw === '' ? undefined : Number(raw);
    } else if (f.kind === 'array') {
      const parts = (text[f.name] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      out[f.name] = f.itemKind === 'number' ? parts.map(Number) : parts;
    } else {
      out[f.name] = text[f.name] ?? '';
    }
  }
  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DynamicForm() {
  const {
    definition,
    snapshot,
    availableActions,
    dispatch,
    lastError,
    isPreviewing,
    previewVersion,
  } = useRunner();

  const [selectedAction, setSelectedAction] = useState<string>(
    () => availableActions[Math.floor(Math.random() * availableActions.length)] ?? '',
  );
  const [textValues, setTextValues] = useState<Record<string, string>>(
    () => defaultsFor(selectedAction).text,
  );
  const [boolValues, setBoolValues] = useState<Record<string, boolean>>(
    () => defaultsFor(selectedAction).bool,
  );
  const [numValues, setNumValues] = useState<Record<string, string>>(
    () => defaultsFor(selectedAction).num,
  );
  const [submitting, setSubmitting] = useState(false);

  function defaultsFor(action: string) {
    const schema = action ? definition.actionSchemas.get(action) : undefined;
    return schema ? buildDefaults(describeSchema(schema)) : { text: {}, bool: {}, num: {} };
  }

  function applyDefaults(action: string) {
    const { text, bool, num } = defaultsFor(action);
    setTextValues(text);
    setBoolValues(bool);
    setNumValues(num);
  }

  // When the available set changes (after a dispatch, or while scrubbing) and the
  // current pick is no longer valid, switch to a valid one — adjusted during
  // render rather than in an effect (https://react.dev/learn/you-might-not-need-an-effect).
  const [trackedActions, setTrackedActions] = useState(availableActions);
  if (trackedActions !== availableActions) {
    setTrackedActions(availableActions);
    if (availableActions.length > 0 && !availableActions.includes(selectedAction)) {
      const next = availableActions[0] ?? '';
      setSelectedAction(next);
      applyDefaults(next);
    }
  }

  function handleActionChange(action: string) {
    setSelectedAction(action);
    applyDefaults(action);
  }

  const schema = selectedAction ? definition.actionSchemas.get(selectedAction) : undefined;
  const fields: FieldDescriptor[] = schema ? describeSchema(schema) : [];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedAction) {
      return;
    }
    setSubmitting(true);
    try {
      const payload = coercePayload(fields, textValues, boolValues, numValues);
      await dispatch(selectedAction, payload);
    } finally {
      setSubmitting(false);
    }
  }

  if (snapshot.isTerminal) {
    return (
      <div className="p-4 text-center text-sm font-medium text-green-700 dark:text-green-400">
        Workflow complete ✓
      </div>
    );
  }

  if (availableActions.length === 0) {
    return (
      <div className="text-muted-foreground p-4 text-center text-sm">No actions available</div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border-border space-y-3 overflow-y-auto border-b p-4">
      {isPreviewing && (
        <p className="rounded bg-amber-100 px-2.5 py-1.5 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          Viewing v{previewVersion} — dispatching will branch from here and discard later steps.
        </p>
      )}

      {/* Action selector */}
      <div className="space-y-1.5">
        <Label>Action</Label>
        <Select value={selectedAction} onValueChange={handleActionChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableActions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* SDUI field list */}
      {fields.map((field) => (
        <div key={field.name} className="space-y-1.5">
          <Label>
            {field.label}
            {!field.optional && <span className="text-destructive ml-0.5">*</span>}
          </Label>

          {field.kind === 'boolean' && (
            <div className="flex items-center gap-2 pt-0.5">
              <Checkbox
                id={`f-${field.name}`}
                checked={boolValues[field.name] ?? false}
                onCheckedChange={(v) => setBoolValues((p) => ({ ...p, [field.name]: !!v }))}
              />
              <label
                htmlFor={`f-${field.name}`}
                className="text-foreground cursor-pointer text-xs select-none"
              >
                {field.label}
              </label>
            </div>
          )}

          {field.kind === 'enum' && (
            <Select
              value={textValues[field.name] ?? ''}
              onValueChange={(v) => setTextValues((p) => ({ ...p, [field.name]: v }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((o: string) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {field.kind === 'number' && (
            <Input
              type="number"
              value={numValues[field.name] ?? ''}
              onChange={(e) => setNumValues((p) => ({ ...p, [field.name]: e.target.value }))}
              className="h-8 text-xs"
            />
          )}

          {field.kind === 'array' && (
            <div className="space-y-0.5">
              <Input
                type="text"
                value={textValues[field.name] ?? ''}
                onChange={(e) => setTextValues((p) => ({ ...p, [field.name]: e.target.value }))}
                placeholder="comma-separated values"
                className="h-8 text-xs"
              />
              <p className="text-muted-foreground text-xs">Separate items with commas</p>
            </div>
          )}

          {(field.kind === 'string' || field.kind === 'unknown') && (
            <Input
              type="text"
              value={textValues[field.name] ?? ''}
              onChange={(e) => setTextValues((p) => ({ ...p, [field.name]: e.target.value }))}
              placeholder={field.kind === 'unknown' ? 'JSON value' : field.label}
              className="h-8 text-xs"
            />
          )}
        </div>
      ))}

      {/* Guard failure hint */}
      {lastError && (
        <p className="bg-destructive/10 border-destructive/20 text-destructive rounded-md border px-2 py-1.5 text-xs">
          {lastError}
        </p>
      )}

      <Button type="submit" size="sm" disabled={submitting || !selectedAction} className="w-full">
        {submitting ? 'Dispatching…' : `Dispatch ${selectedAction}`}
      </Button>
    </form>
  );
}
