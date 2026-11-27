'use client';

import { PreviewMode } from '@levuche/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ComputerIcon,
  EyeIcon,
  PhoneIcon,
  PlusIcon,
  TabletIcon,
  TrashIcon,
} from '@/components/app-icons';
import { CreatorPage } from '@/components/creator-page';
import { IconButton } from '@/components/icon-button';
import { pageBlocks } from '@/components/page-blocks';
import {
  PictureUploads,
  SettingsFields,
  type UploadPicture,
} from '@/components/settings-fields';
import { blockPanel, EDITOR_BLOCKS } from '@/lib/blocks';
import { buttonClasses } from '@/lib/button';
import type { Block } from '@/lib/db';
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
  phone: { label: 'Phone', width: 390, icon: PhoneIcon },
  tablet: { label: 'Tablet', width: 820, icon: TabletIcon },
  desktop: { label: 'Computer', width: 1200, icon: ComputerIcon },
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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <section
        aria-labelledby="editor-blocks"
        className="flex w-full flex-col gap-4 lg:max-w-md xl:max-w-lg"
      >
        <div className="min-h-control flex flex-wrap items-center justify-between gap-2">
          <h2 id="editor-blocks" className="text-section m-0">
            Blocks
          </h2>
          <div className="flex items-center gap-2">
            <p
              role="status"
              data-save={save.kind}
              className={
                save.kind === 'error'
                  ? 'text-lv-danger m-0 text-sm font-semibold'
                  : 'text-lv-text-2 m-0 flex items-center gap-1.5 text-sm'
              }
            >
              {save.kind === 'saved' && !readOnly ? (
                <span
                  aria-hidden
                  className="bg-lv-success inline-block size-2 rounded-full"
                />
              ) : null}
              {readOnly
                ? 'You can look, but not change this page.'
                : save.kind === 'saving'
                  ? 'Saving…'
                  : save.kind === 'error'
                    ? save.message
                    : 'All changes saved.'}
            </p>
            <a
              href="#editor-preview"
              className={buttonClasses('outline', 'px-3 lg:hidden')}
            >
              <EyeIcon />
              See preview
            </a>
          </div>
        </div>

        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {blocks.map((block, i) => {
            const info = blockPanel(block.type);
            const name = info?.label ?? block.type;
            const chosen = block.id === selected;
            return (
              <li
                key={block.id}
                data-editor-block={block.type}
                className={`flex flex-wrap items-center gap-1 rounded-xl border-2 p-1.5 transition-colors ${
                  chosen
                    ? 'border-lv-primary bg-lv-surface-2'
                    : 'border-lv-border bg-lv-card hover:border-lv-link'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={chosen}
                  className="text-lv-text min-h-control flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg bg-transparent px-2 text-start font-[inherit] font-semibold"
                  onClick={() => setSelected(block.id)}
                >
                  <span
                    aria-hidden
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      chosen
                        ? 'bg-lv-primary text-lv-on-primary'
                        : 'bg-lv-surface-2 text-lv-text-2'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate">{name}</span>
                </button>
                {readOnly ? null : confirmRemove === block.id ? (
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="px-1 text-sm">Remove {name}?</span>
                    <button
                      type="button"
                      className={buttonClasses('danger', 'px-3')}
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
                  <span className="flex items-center">
                    <IconButton
                      label={`Move ${name} up`}
                      tip="Move up"
                      icon={<ArrowUpIcon />}
                      disabled={i === 0}
                      onClick={() => move(block.id, -1)}
                    />
                    <IconButton
                      label={`Move ${name} down`}
                      tip="Move down"
                      icon={<ArrowDownIcon />}
                      disabled={i === blocks.length - 1}
                      onClick={() => move(block.id, 1)}
                    />
                    <IconButton
                      label={`Remove ${name}`}
                      tip="Remove"
                      align="end"
                      icon={<TrashIcon />}
                      className="hover:text-lv-danger"
                      onClick={() => setConfirmRemove(block.id)}
                    />
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
          <div className="border-lv-border flex flex-wrap items-end gap-2 rounded-xl border-2 border-dashed p-3">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="add-block" className="text-sm font-semibold">
                Add a block
              </label>
              <select
                id="add-block"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                className="min-h-control border-lv-border bg-lv-card text-lv-text hover:border-lv-link w-full cursor-pointer rounded-xl border-2 px-3 text-base transition-colors sm:text-sm"
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
              <PlusIcon />
              Add
            </button>
          </div>
        )}

        {current && panel ? (
          <section
            aria-labelledby="editor-settings"
            className="bg-lv-card border-lv-border rounded-box p-box flex flex-col gap-4 border-2"
          >
            <h2 id="editor-settings" className="text-section m-0">
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
            <details className="group/look border-lv-border flex flex-col gap-4 border-t-2 pt-3">
              <summary className="hover:text-lv-link flex cursor-pointer list-none items-center justify-between gap-2 font-semibold transition-colors [&::-webkit-details-marker]:hidden">
                Look
                <ArrowDownIcon className="transition-transform group-open/look:rotate-180 motion-reduce:transition-none" />
              </summary>
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
        className="flex min-w-0 flex-1 scroll-mt-4 flex-col gap-4 lg:sticky lg:top-4"
      >
        <div className="min-h-control flex flex-wrap items-center justify-between gap-2">
          <h2 id="editor-preview" className="text-section m-0 scroll-mt-4">
            Preview
          </h2>
          <div
            role="group"
            aria-label="Screen"
            className="border-lv-border bg-lv-card flex gap-0.5 rounded-full border-2 p-0.5"
          >
            {(Object.keys(SCREENS) as Screen[]).map((key) => {
              const Icon = SCREENS[key].icon;
              return (
                <IconButton
                  key={key}
                  label={SCREENS[key].label}
                  aria-pressed={screen === key}
                  look={screen === key ? 'primary' : 'quiet'}
                  side="bottom"
                  align={key === 'desktop' ? 'end' : 'center'}
                  className="border-0 shadow-none hover:shadow-none"
                  icon={<Icon />}
                  onClick={() => setScreen(key)}
                />
              );
            })}
          </div>
        </div>
        <div className="bg-lv-surface border-lv-border rounded-box border-2 p-2 sm:p-4">
          <div
            data-preview-screen={screen}
            className="bg-lv-bg mx-auto w-full overflow-x-auto rounded-2xl text-base shadow-sm transition-[max-width] duration-200 motion-reduce:transition-none lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
            style={{ maxWidth: SCREENS[screen].width }}
          >
            <PreviewMode>
              <CreatorPage blocks={preview} frame={frame} preview />
            </PreviewMode>
          </div>
        </div>
      </section>
    </div>
  );
}
