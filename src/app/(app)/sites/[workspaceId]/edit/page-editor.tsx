'use client';

import { PreviewMode } from '@levuche/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CreatorPage } from '@/components/creator-page';
import { pageBlocks } from '@/components/page-blocks';
import { SettingsFields } from '@/components/settings-fields';
import { blockPanel, EDITOR_BLOCKS } from '@/lib/blocks';
import { buttonClasses } from '@/lib/button';
import type { Block } from '@/lib/db';
import type { PageFrame } from '@/lib/page-layout';
import {
  addBlock,
  type EditResult,
  moveBlock,
  removeBlock,
  saveBlock,
} from './actions';

/** How long typing has to stop before a block is saved. */
const SAVE_AFTER_MS = 700;

/** The preview's width on each screen; the grid lays itself out to fit. */
const SCREENS = {
  phone: { label: 'Phone', width: 390 },
  tablet: { label: 'Tablet', width: 820 },
  desktop: { label: 'Computer', width: 1200 },
} as const;
type Screen = keyof typeof SCREENS;

type SaveState =
  { kind: 'saved' } | { kind: 'saving' } | { kind: 'error'; message: string };

/**
 * The page editor (#20): the page's blocks in reading order, the selected
 * block's settings, and the page as visitors will see it on a phone, a
 * tablet or a computer. Every change saves itself as the draft; nothing
 * goes live until the site is published.
 */
export function PageEditor({
  workspaceId,
  pageId,
  frame,
  initialBlocks,
  initialSelected,
  readOnly,
}: {
  workspaceId: string;
  pageId: string;
  frame: PageFrame;
  initialBlocks: Block[];
  /** The block to open with, when it's on the page. */
  initialSelected?: string;
  readOnly: boolean;
}) {
  const [blocks, setBlocks] = useState(initialBlocks);
  const [selected, setSelected] = useState<string | null>(
    initialBlocks.find((b) => b.id === initialSelected)?.id ??
      initialBlocks[0]?.id ??
      null
  );
  const [screen, setScreen] = useState<Screen>('phone');
  const [save, setSave] = useState<SaveState>({ kind: 'saved' });
  const [adding, setAdding] = useState<string>(EDITOR_BLOCKS[0]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(0);

  /** Runs a save, keeping the status line true while any is in flight. */
  const run = useCallback(async <T,>(work: Promise<EditResult<T>>) => {
    pending.current += 1;
    setSave({ kind: 'saving' });
    try {
      const result = await work;
      if ('error' in result) {
        setSave({ kind: 'error', message: result.error });
        return null;
      }
      if (pending.current === 1) setSave({ kind: 'saved' });
      return result.ok;
    } catch {
      setSave({
        kind: 'error',
        message: 'Your last change didn’t save. Check your connection.',
      });
      return null;
    } finally {
      pending.current -= 1;
    }
  }, []);

  // Warn before leaving with a change still waiting to save.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (timers.current.size > 0 || pending.current > 0)
        event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const change = (block: Block, props: Record<string, unknown>) => {
    setBlocks((all) =>
      all.map((b) => (b.id === block.id ? { ...b, props } : b))
    );
    setSave({ kind: 'saving' });
    const waiting = timers.current.get(block.id);
    if (waiting) clearTimeout(waiting);
    timers.current.set(
      block.id,
      setTimeout(() => {
        timers.current.delete(block.id);
        void run(saveBlock(workspaceId, block.id, block.type, props));
      }, SAVE_AFTER_MS)
    );
  };

  const add = async () => {
    const block = await run(addBlock(workspaceId, pageId, adding));
    if (block) {
      setBlocks((all) => [...all, block]);
      setSelected(block.id);
    }
  };

  const move = (id: string, by: -1 | 1) => {
    const from = blocks.findIndex((b) => b.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[from], next[to]] = [next[to], next[from]];
    setBlocks(next);
    void run(moveBlock(workspaceId, id, to));
  };

  const remove = async (id: string) => {
    const waiting = timers.current.get(id);
    if (waiting) clearTimeout(waiting);
    timers.current.delete(id);
    setConfirmRemove(null);
    if (await run(removeBlock(workspaceId, id))) {
      setBlocks((all) => all.filter((b) => b.id !== id));
      setSelected((current) => (current === id ? null : current));
    }
  };

  const current = blocks.find((b) => b.id === selected);
  const panel = current && blockPanel(current.type);

  const preview = pageBlocks(blocks, ({ id, missing }) => (
    <button
      type="button"
      onClick={() => setSelected(id)}
      className="border-site-border text-site-text-2 w-full cursor-pointer rounded-xl border-2 border-dashed bg-transparent p-4 text-start font-[inherit]"
    >
      <span className="text-site-text block font-semibold">
        {blockPanel(blocks.find((b) => b.id === id)?.type ?? '')?.label}
      </span>
      Add {missing.join(' and ').toLowerCase()} to show this block.
    </button>
  ));

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section
        aria-labelledby="editor-blocks"
        className="flex w-full flex-col gap-5 lg:sticky lg:top-4 lg:max-w-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="editor-blocks" className="text-h3 m-0">
            Blocks
          </h2>
          <p
            role="status"
            data-save={save.kind}
            className={
              save.kind === 'error'
                ? 'text-lv-danger m-0 text-sm font-semibold'
                : 'text-lv-text-2 m-0 text-sm'
            }
          >
            {readOnly
              ? 'You can look, but not change this page.'
              : save.kind === 'saving'
                ? 'Saving…'
                : save.kind === 'error'
                  ? save.message
                  : 'All changes saved.'}
          </p>
        </div>

        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {blocks.map((block, i) => {
            const info = blockPanel(block.type);
            const name = info?.label ?? block.type;
            return (
              <li
                key={block.id}
                data-editor-block={block.type}
                className={`border-lv-border flex flex-wrap items-center gap-2 rounded-xl border-2 p-2 ${
                  block.id === selected ? 'border-lv-primary' : ''
                }`}
              >
                <button
                  type="button"
                  aria-pressed={block.id === selected}
                  className="text-lv-text min-h-control flex-1 cursor-pointer bg-transparent px-2 text-start font-[inherit] font-semibold"
                  onClick={() => setSelected(block.id)}
                >
                  {name}
                </button>
                {readOnly ? null : confirmRemove === block.id ? (
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="text-sm">Remove {name}?</span>
                    <button
                      type="button"
                      className={buttonClasses('outline', 'px-3')}
                      onClick={() => remove(block.id)}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      className={buttonClasses('quiet', 'px-3')}
                      onClick={() => setConfirmRemove(null)}
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      className={buttonClasses('quiet', 'px-3')}
                      aria-label={`Move ${name} up`}
                      disabled={i === 0}
                      onClick={() => move(block.id, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className={buttonClasses('quiet', 'px-3')}
                      aria-label={`Move ${name} down`}
                      disabled={i === blocks.length - 1}
                      onClick={() => move(block.id, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className={buttonClasses('quiet', 'px-3')}
                      aria-label={`Remove ${name}`}
                      onClick={() => setConfirmRemove(block.id)}
                    >
                      Remove
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {blocks.length === 0 ? (
          <p className="text-lv-text-2 m-0">
            Your page is empty. Add a block to start.
          </p>
        ) : null}

        {readOnly ? null : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="add-block" className="font-semibold">
                Add a block
              </label>
              <select
                id="add-block"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                className="min-h-control border-lv-border bg-lv-card text-lv-text w-full rounded-xl border-2 px-3 text-base"
              >
                {EDITOR_BLOCKS.map((type) => (
                  <option key={type} value={type}>
                    {blockPanel(type)?.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={buttonClasses('primary')}
              onClick={add}
            >
              Add
            </button>
          </div>
        )}

        {current && panel ? (
          <section
            aria-labelledby="editor-settings"
            className="border-lv-border flex flex-col gap-4 border-t-2 pt-5"
          >
            <h2 id="editor-settings" className="text-h3 m-0">
              {panel.label}
            </h2>
            <SettingsFields
              fields={panel.settings}
              values={current.props}
              disabled={readOnly}
              onChange={(props) => change(current, props)}
            />
            <details className="flex flex-col gap-4">
              <summary className="cursor-pointer font-semibold">Look</summary>
              <div className="pt-4">
                <SettingsFields
                  fields={panel.look}
                  values={current.props}
                  disabled={readOnly}
                  unsetLabel="As the block has it"
                  onChange={(props) => change(current, props)}
                />
              </div>
            </details>
          </section>
        ) : null}
      </section>

      <section
        aria-labelledby="editor-preview"
        className="flex min-w-0 flex-1 flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="editor-preview" className="text-h3 m-0">
            Preview
          </h2>
          <div role="group" aria-label="Screen" className="flex gap-1">
            {(Object.keys(SCREENS) as Screen[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={screen === key}
                className={buttonClasses(
                  screen === key ? 'primary' : 'outline',
                  'px-4'
                )}
                onClick={() => setScreen(key)}
              >
                {SCREENS[key].label}
              </button>
            ))}
          </div>
        </div>
        <div
          data-preview-screen={screen}
          className="border-lv-border mx-auto w-full overflow-x-auto rounded-2xl border-2"
          style={{ maxWidth: SCREENS[screen].width }}
        >
          <PreviewMode>
            <CreatorPage blocks={preview} frame={frame} preview />
          </PreviewMode>
        </div>
      </section>
    </div>
  );
}
