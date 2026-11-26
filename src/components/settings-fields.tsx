'use client';

import type { ChoiceValue, SettingField } from '@levuche/ui';
import { createContext, useContext, useId, useRef, useState } from 'react';
import { buttonClasses } from '@/lib/button';

/*
 * A block's settings panel, drawn from its @levuche/ui settings: one control
 * per field, with lists and groups drawn the same way inside. It only ever
 * hands back the new values; the editor saves them.
 */

type Values = Record<string, unknown>;

/**
 * Uploads a picture for a field (#24) and answers its address, or why it
 * didn't upload. Given by the editor; without it, pictures are addresses
 * only.
 */
export type UploadPicture = (
  file: File,
  field: string
) => Promise<{ url: string } | { error: string }>;

export const PictureUploads = createContext<UploadPicture | null>(null);

const control =
  'min-h-control border-lv-border bg-lv-card text-lv-text w-full rounded-xl border-2 px-3 text-base focus-visible:border-lv-primary';

export function SettingsFields({
  fields,
  values,
  onChange,
  disabled,
  unsetLabel,
}: {
  fields: readonly SettingField[];
  values: Values;
  onChange: (values: Values) => void;
  disabled?: boolean;
  /** The empty choice of a field with no default, as "As the block has it". */
  unsetLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <SettingControl
          key={field.name}
          field={field}
          value={values[field.name]}
          disabled={disabled}
          unsetLabel={unsetLabel}
          onChange={(value) => {
            const next = { ...values };
            if (value === undefined) delete next[field.name];
            else next[field.name] = value;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function Help({ id, field }: { id: string; field: SettingField }) {
  return field.help ? (
    <p id={id} className="text-lv-text-2 m-0 text-sm">
      {field.help}
    </p>
  ) : null;
}

function Label({ htmlFor, field }: { htmlFor: string; field: SettingField }) {
  return (
    <label htmlFor={htmlFor} className="font-semibold">
      {field.label}
      {field.required ? (
        <span className="text-lv-text-2 font-normal"> (needed)</span>
      ) : null}
    </label>
  );
}

const asText = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

function SettingControl({
  field,
  value,
  onChange,
  disabled,
  unsetLabel = 'Not set',
}: {
  field: SettingField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  unsetLabel?: string;
}) {
  const id = useId();
  const upload = useContext(PictureUploads);
  const helpId = `${id}-help`;
  const described = field.help ? helpId : undefined;
  const fallback = 'default' in field ? field.default : undefined;

  switch (field.type) {
    case 'text':
    case 'link':
    case 'picture':
    case 'colour':
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id} field={field} />
          <input
            id={id}
            type="text"
            inputMode={field.type === 'text' ? undefined : 'url'}
            autoComplete="off"
            spellCheck={field.type === 'text'}
            placeholder={
              field.type === 'picture'
                ? 'https://…'
                : field.type === 'link'
                  ? 'https://…'
                  : field.type === 'colour'
                    ? '#ff6600'
                    : undefined
            }
            className={control}
            value={asText(value ?? fallback)}
            disabled={disabled}
            aria-describedby={described}
            maxLength={field.type === 'text' ? 300 : 2000}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.type === 'picture' && !field.help ? (
            <p className="text-lv-text-2 m-0 text-sm">
              {upload && !disabled
                ? 'Upload a picture, or paste its address, starting https://'
                : 'The picture’s address, starting https://'}
            </p>
          ) : null}
          {field.type === 'picture' && upload && !disabled ? (
            <PictureUpload
              field={field}
              upload={upload}
              onUploaded={onChange}
            />
          ) : null}
          <Help id={helpId} field={field} />
        </div>
      );
    case 'longText':
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id} field={field} />
          <textarea
            id={id}
            rows={4}
            className={`${control} py-2`}
            value={asText(value ?? fallback)}
            disabled={disabled}
            aria-describedby={described}
            maxLength={5000}
            onChange={(e) => onChange(e.target.value)}
          />
          <Help id={helpId} field={field} />
        </div>
      );
    case 'dateTime':
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id} field={field} />
          <input
            id={id}
            type="datetime-local"
            className={control}
            value={asText(value ?? fallback).slice(0, 16)}
            disabled={disabled}
            aria-describedby={described}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
          <Help id={helpId} field={field} />
        </div>
      );
    case 'number':
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id} field={field} />
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="number"
              className={`${control} max-w-40`}
              min={field.min}
              max={field.max}
              step={field.step}
              value={asText(value ?? fallback)}
              disabled={disabled}
              aria-describedby={described}
              onChange={(e) =>
                onChange(
                  e.target.value === '' ? undefined : Number(e.target.value)
                )
              }
            />
            {field.unit ? (
              <span className="text-lv-text-2">{field.unit}</span>
            ) : null}
          </div>
          <Help id={helpId} field={field} />
        </div>
      );
    case 'toggle':
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <input
              id={id}
              type="checkbox"
              className="accent-lv-primary size-5"
              checked={Boolean(value ?? fallback)}
              disabled={disabled}
              aria-describedby={described}
              onChange={(e) => onChange(e.target.checked)}
            />
            <Label htmlFor={id} field={field} />
          </div>
          <Help id={helpId} field={field} />
        </div>
      );
    case 'choice': {
      const name = (option: ChoiceValue) =>
        field.optionLabels?.[String(option)] ?? String(option);
      if (field.multiple) {
        const picked = Array.isArray(value)
          ? value
          : Array.isArray(fallback)
            ? fallback
            : [];
        return (
          <fieldset
            className="m-0 flex flex-col gap-1.5 border-0 p-0"
            aria-describedby={described}
          >
            <legend className="mb-1.5 p-0 font-semibold">{field.label}</legend>
            {field.options.map((option) => (
              <label key={String(option)} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="accent-lv-primary size-5"
                  checked={picked.includes(option)}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = field.options.filter((o) =>
                      o === option ? e.target.checked : picked.includes(o)
                    );
                    onChange(next.length ? next : undefined);
                  }}
                />
                {name(option)}
              </label>
            ))}
            <Help id={helpId} field={field} />
          </fieldset>
        );
      }
      const current =
        value === undefined ? fallback : (value as ChoiceValue | undefined);
      const index = field.options.findIndex((o) => o === current);
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id} field={field} />
          <select
            id={id}
            className={control}
            value={index < 0 ? '' : String(index)}
            disabled={disabled}
            aria-describedby={described}
            onChange={(e) =>
              onChange(
                e.target.value === ''
                  ? undefined
                  : field.options[Number(e.target.value)]
              )
            }
          >
            {fallback === undefined ? (
              <option value="">{unsetLabel}</option>
            ) : null}
            {field.options.map((option, i) => (
              <option key={String(option)} value={String(i)}>
                {name(option)}
              </option>
            ))}
          </select>
          <Help id={helpId} field={field} />
        </div>
      );
    }
    case 'group':
      return (
        <fieldset className="border-lv-border m-0 flex flex-col gap-3 rounded-xl border-2 p-3">
          <legend className="px-1 font-semibold">{field.label}</legend>
          <Help id={helpId} field={field} />
          <SettingsFields
            fields={field.fields}
            values={
              typeof value === 'object' && value !== null
                ? (value as Values)
                : {}
            }
            disabled={disabled}
            onChange={(next) =>
              onChange(Object.keys(next).length ? next : undefined)
            }
          />
        </fieldset>
      );
    case 'list': {
      const items = Array.isArray(value) ? (value as unknown[]) : [];
      const itemLabel = field.itemLabel ?? 'Item';
      const full = field.max !== undefined && items.length >= field.max;
      const set = (next: unknown[]) => onChange(next);
      const blank = field.fields ? {} : '';
      return (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1.5 p-0 font-semibold">
            {field.label}
            {field.required ? (
              <span className="text-lv-text-2 font-normal"> (needed)</span>
            ) : null}
          </legend>
          <Help id={helpId} field={field} />
          {items.length === 0 ? (
            <p className="text-lv-text-2 m-0 text-sm">None yet.</p>
          ) : null}
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {items.map((item, i) => (
              <li
                key={i}
                className="border-lv-border flex flex-col gap-3 rounded-xl border-2 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {itemLabel} {i + 1}
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      className={buttonClasses('quiet', 'px-3')}
                      disabled={disabled || i === 0}
                      aria-label={`Move ${itemLabel.toLowerCase()} ${i + 1} up`}
                      onClick={() => {
                        const next = [...items];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        set(next);
                      }}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className={buttonClasses('quiet', 'px-3')}
                      disabled={disabled}
                      aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
                      onClick={() => set(items.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </span>
                </div>
                {field.fields ? (
                  <SettingsFields
                    fields={field.fields}
                    values={
                      typeof item === 'object' && item !== null
                        ? (item as Values)
                        : {}
                    }
                    disabled={disabled}
                    onChange={(next) =>
                      set(items.map((old, j) => (j === i ? next : old)))
                    }
                  />
                ) : (
                  <SettingControl
                    field={{
                      name: String(i),
                      label: `${itemLabel} ${i + 1}`,
                      type: field.of ?? 'text',
                    }}
                    value={item}
                    disabled={disabled}
                    onChange={(next) =>
                      set(items.map((old, j) => (j === i ? next : old)))
                    }
                  />
                )}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={buttonClasses('outline', 'self-start')}
            disabled={disabled || full}
            onClick={() => set([...items, blank])}
          >
            Add {itemLabel.toLowerCase()}
          </button>
        </fieldset>
      );
    }
    default:
      return null;
  }
}

/** The button to upload a picture for a field, with how it went. */
function PictureUpload({
  field,
  upload,
  onUploaded,
}: {
  field: SettingField;
  upload: UploadPicture;
  onUploaded: (url: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'uploading' }
    | { kind: 'done' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  async function send(file: File | undefined) {
    if (!file) return;
    setState({ kind: 'uploading' });
    const result = await upload(file, field.name);
    if (input.current) input.current.value = '';
    if ('error' in result) setState({ kind: 'error', message: result.error });
    else {
      onUploaded(result.url);
      setState({ kind: 'done' });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        className="peer sr-only"
        disabled={state.kind === 'uploading'}
        onChange={(e) => void send(e.target.files?.[0])}
      />
      <label
        htmlFor={id}
        className={buttonClasses(
          'outline',
          'peer-focus-visible:outline-lv-primary cursor-pointer self-start peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:cursor-wait'
        )}
      >
        Upload {field.label.toLowerCase()}
      </label>
      <p
        role="status"
        className={`m-0 text-sm empty:hidden ${state.kind === 'error' ? 'text-lv-danger font-semibold' : 'text-lv-text-2'}`}
      >
        {state.kind === 'uploading'
          ? 'Uploading…'
          : state.kind === 'done'
            ? 'Uploaded.'
            : state.kind === 'error'
              ? state.message
              : ''}
      </p>
    </div>
  );
}
