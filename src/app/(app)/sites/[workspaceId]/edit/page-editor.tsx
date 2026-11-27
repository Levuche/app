'use client';

import {
  BlockFrame,
  EditMode,
  PreviewMode,
  type BlockDropPlace,
  type EditChange,
  type EditPick,
} from '@levuche/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CreatorPage } from '@/components/creator-page';
import { pageBlocks } from '@/components/page-blocks';
import {
  PictureUploads,
  SettingsFields,
  type UploadPicture,
} from '@/components/settings-fields';
import { blockPanel, EDITOR_BLOCKS } from '@/lib/blocks';
import { buttonClasses } from '@/lib/button';
import type { Block } from '@/lib/db';
import { pathsUp, readAt, setAt } from '@/lib/edit-paths';
import type { PageFrame } from '@/lib/page-layout';
import { pictureSide } from '@/lib/pictures';
import { NotAPicture, shrinkPicture } from '@/lib/shrink-picture';
import {
  addBlock,
  type EditResult,
  moveBlock,
  removeBlock,
  saveBlock,
  startPictureUpload,
} from './actions';

/** How long typing has to stop before a block is saved. */
const SAVE_AFTER_MS = 700;

const NOT_A_PICTURE =
  'This picture couldn’t be opened. Use a JPEG, PNG or WebP picture.';
const UPLOAD_FAILED =
  'The picture didn’t upload. Check your connection and try again.';

/**
 * Uploads a picture for a field (#24): shrunk in the browser to the size
 * the field shows it, then sent to an address the server gives for it.
 */
function pictureUploader(workspaceId: string): UploadPicture {
  return async (file, field) => {
    let picture: Blob;
    try {
      picture = await shrinkPicture(file, pictureSide(field));
    } catch (error) {
      if (error instanceof NotAPicture) return { error: NOT_A_PICTURE };
      throw error;
    }
    const started = await startPictureUpload(workspaceId, {
      type: picture.type,
      bytes: picture.size,
    });
    if ('error' in started) return { error: started.error };
    try {
      const response = await fetch(started.ok.address, {
        method: 'PUT',
        body: picture,
        headers: { 'Content-Type': picture.type },
      });
      const answer = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (answer.url) return { url: answer.url };
      return { error: answer.error ?? UPLOAD_FAILED };
    } catch {
      return { error: UPLOAD_FAILED };
    }
  };
}

/** The preview's width on each screen; the grid lays itself out to fit. */
const SCREENS = {
  phone: { label: 'Phone', width: 390 },
  tablet: { label: 'Tablet', width: 820 },
  desktop: { label: 'Computer', width: 1200 },
} as const;
type Screen = keyof typeof SCREENS;

/**
 * The frame's own words, apart from "Add a block below": the panel's menu is
 * already "Add a block", and the two would read alike.
 */
const FRAME_LABELS = { add: 'Insert a block below' };

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
  const [uploadPicture] = useState(() => pictureUploader(workspaceId));
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
  /** The block asking "Remove it?" on the page, from its frame. */
  const [deleting, setDeleting] = useState<string | null>(null);
  /** The block whose "Add a block below" menu is open on the page. */
  const [addingAfter, setAddingAfter] = useState<string | null>(null);
  /**
   * A setting picked on the page, to bring the settings panel to ('' for
   * the panel itself), and a count that asks for it once it's drawn.
   */
  const showSetting = useRef<string | null>(null);
  const [asked, setAsked] = useState(0);
  const settingsRef = useRef<HTMLElement>(null);
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

  /**
   * Adds a block of `type`, with `props` when it's a copy, at the end of the
   * page or right after the block `after`.
   */
  const addAt = async (
    type: string,
    after?: string,
    props?: Record<string, unknown>
  ) => {
    const block = await run(addBlock(workspaceId, pageId, type));
    if (!block) return;
    const made = props ? { ...block, props } : block;
    const at = after ? blocks.findIndex((b) => b.id === after) + 1 : -1;
    setBlocks((all) => {
      if (at <= 0) return [...all, made];
      const next = [...all];
      next.splice(at, 0, made);
      return next;
    });
    setSelected(block.id);
    if (props) await run(saveBlock(workspaceId, block.id, type, props));
    if (at > 0) await run(moveBlock(workspaceId, block.id, at));
  };

  const add = () => addAt(adding);

  /** Puts block `id` at `to` in the page's reading order, and saves it. */
  const place = (id: string, to: number) => {
    const from = blocks.findIndex((b) => b.id === id);
    if (from < 0 || to < 0 || to >= blocks.length || to === from) return;
    const next = blocks.filter((b) => b.id !== id);
    next.splice(to, 0, blocks[from]);
    setBlocks(next);
    void run(moveBlock(workspaceId, id, to));
  };

  const move = (id: string, by: -1 | 1) =>
    place(id, blocks.findIndex((b) => b.id === id) + by);

  /** Block `from`, dragged onto `onto`, goes before or after it. */
  const drop = (from: string, onto: string, where: BlockDropPlace) => {
    const others = blocks.filter((b) => b.id !== from);
    const at = others.findIndex((b) => b.id === onto);
    if (at < 0) return;
    place(from, where === 'after' ? at + 1 : at);
  };

  /** A copy of `block`, with what it says now, right after it. */
  const duplicate = (block: Block) => {
    const waiting = timers.current.get(block.id);
    if (waiting) {
      // Save the original first, so the two don't differ.
      clearTimeout(waiting);
      timers.current.delete(block.id);
      void run(saveBlock(workspaceId, block.id, block.type, block.props));
    }
    void addAt(block.type, block.id, block.props);
  };

  /** Words typed on the page itself, saved like any other change. */
  const edited = ({ block: id, path, value }: EditChange) => {
    const block = blocks.find((b) => b.id === id);
    if (block) change(block, setAt(block.props, path, value));
  };

  /** A link, picture or other part picked on the page: open its field. */
  const picked = ({ block: id, path }: EditPick) => {
    setSelected(id);
    showSetting.current = path;
    setAsked((n) => n + 1);
  };

  const showSettings = (id: string) => {
    setSelected(id);
    showSetting.current = '';
    setAsked((n) => n + 1);
  };

  // Once the picked block's panel is drawn, bring its field into view and
  // give it the keyboard: the nearest field the setting has, or the panel.
  useEffect(() => {
    const path = showSetting.current;
    showSetting.current = null;
    const panel = settingsRef.current;
    if (path === null || !panel) return;
    const field = path
      ? pathsUp(path)
          .map((path) =>
            panel.querySelector<HTMLElement>(
              `[data-setting="${CSS.escape(path)}"]`
            )
          )
          .find(Boolean)
      : null;
    const control = field?.querySelector<HTMLElement>(
      'input:not([type="file"]), textarea, select, button'
    );
    const target = control ?? panel.querySelector<HTMLElement>('h2');
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  }, [asked]);

  const remove = async (id: string) => {
    const waiting = timers.current.get(id);
    if (waiting) clearTimeout(waiting);
    timers.current.delete(id);
    setConfirmRemove(null);
    setDeleting(null);
    setAddingAfter((current) => (current === id ? null : current));
    if (await run(removeBlock(workspaceId, id))) {
      setBlocks((all) => all.filter((b) => b.id !== id));
      setSelected((current) => (current === id ? null : current));
    }
  };

  const current = blocks.find((b) => b.id === selected);
  const panel = current && blockPanel(current.type);

  const drawn = pageBlocks(blocks, ({ id, missing }) => (
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

  // Each block in the frame that gives it its buttons on the page. The
  // blocks themselves have none: the frame only reports what was pressed,
  // and the functions above change the page and save it.
  const preview = drawn.map((shown) => {
    const i = blocks.findIndex((b) => b.id === shown.id);
    const block = blocks[i];
    const name = blockPanel(block.type)?.label ?? block.type;
    return {
      ...shown,
      children: (
        <BlockFrame
          id={block.id}
          label={name}
          selected={block.id === selected}
          first={i === 0}
          last={i === blocks.length - 1}
          onSelect={setSelected}
          labels={FRAME_LABELS}
          {...(readOnly
            ? {}
            : {
                onMove: (by: -1 | 1) => move(block.id, by),
                onDrop: (from: string, where: BlockDropPlace) =>
                  drop(from, block.id, where),
                onDuplicate: () => duplicate(block),
                onSettings: () => showSettings(block.id),
                onDelete: () => setDeleting(block.id),
                onAdd: () =>
                  setAddingAfter((open) =>
                    open === block.id ? null : block.id
                  ),
              })}
        >
          {shown.children}
          {!readOnly && deleting === block.id ? (
            <div
              role="group"
              aria-label={`Remove ${name}?`}
              className="border-lv-border bg-lv-card text-lv-text mt-3 flex flex-wrap items-center gap-2 rounded-xl border-2 p-3 font-sans text-sm"
            >
              <span className="flex-1 font-semibold">Remove {name}?</span>
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
                onClick={() => setDeleting(null)}
              >
                Keep
              </button>
            </div>
          ) : null}
          {!readOnly && addingAfter === block.id ? (
            <div
              role="group"
              aria-label={`Blocks to insert after ${name}`}
              className="border-lv-border bg-lv-card text-lv-text mt-6 flex flex-wrap items-center gap-2 rounded-xl border-2 p-3 font-sans text-sm"
            >
              <span className="w-full font-semibold">Insert a block here</span>
              {EDITOR_BLOCKS.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={buttonClasses('outline', 'px-3')}
                  onClick={() => {
                    setAddingAfter(null);
                    void addAt(type, block.id);
                  }}
                >
                  {blockPanel(type)?.label}
                </button>
              ))}
              <button
                type="button"
                className={buttonClasses('quiet', 'px-3')}
                onClick={() => setAddingAfter(null)}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </BlockFrame>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section
        aria-labelledby="editor-blocks"
        className="flex w-full flex-col gap-5 lg:sticky lg:top-4 lg:max-w-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="editor-blocks" className="text-section m-0">
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
                className="min-h-control border-lv-border bg-lv-card text-lv-text w-full rounded-xl border-2 px-3 text-base sm:text-sm"
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
            ref={settingsRef}
            aria-labelledby="editor-settings"
            className="border-lv-border flex flex-col gap-4 border-t-2 pt-5"
          >
            <h2 id="editor-settings" tabIndex={-1} className="text-section m-0">
              {panel.label}
            </h2>
            <PictureUploads.Provider value={uploadPicture}>
              <SettingsFields
                fields={panel.settings}
                values={current.props}
                disabled={readOnly}
                onChange={(props) => change(current, props)}
              />
            </PictureUploads.Provider>
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
          <h2 id="editor-preview" className="text-section m-0">
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
          className="border-lv-border mx-auto w-full overflow-x-auto rounded-2xl border-2 text-base"
          style={{ maxWidth: SCREENS[screen].width }}
        >
          {readOnly ? (
            <PreviewMode>
              <CreatorPage blocks={preview} frame={frame} preview />
            </PreviewMode>
          ) : (
            // Words are typed on the page itself; a link, picture or other
            // setting picked there opens its field in the panel.
            <EditMode
              onEdit={edited}
              onPick={picked}
              readValue={({ block: id, path }) => {
                const value = readAt(
                  blocks.find((b) => b.id === id)?.props ?? {},
                  path
                );
                return typeof value === 'string' ? value : undefined;
              }}
            >
              <CreatorPage blocks={preview} frame={frame} preview />
            </EditMode>
          )}
        </div>
      </section>
    </div>
  );
}
