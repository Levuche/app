/*
 * The blocks a creator can put on a page in the editor (#20), and how their
 * settings are read. What each block takes comes from @levuche/ui: its
 * registry entry lists the block's settings, and those drive the editor's
 * settings panel, the checks on what's saved and what the page shows.
 *
 * Plain data and functions, so they run on the server, in the editor and in
 * tests.
 */
import {
  LOOK_SETTINGS,
  blockInfo,
  fitsSetting,
  isSafeHref,
  type BlockKind,
  type SettingField,
} from '@levuche/ui';

/**
 * The blocks R1 offers, in the order the "Add a block" menu lists them: the
 * core blocks every link-in-bio page is made of. More come from the registry
 * as the editor grows.
 */
export const EDITOR_BLOCKS = [
  'creator-header',
  'social-icons',
  'link-list',
  'text-block',
  'site-image',
] as const;
export type EditorBlockType = (typeof EDITOR_BLOCKS)[number];

export const isEditorBlock = (type: string): type is EditorBlockType =>
  (EDITOR_BLOCKS as readonly string[]).includes(type);

/** The field types the panel can show. */
const EDITABLE_TYPES: ReadonlySet<SettingField['type']> = new Set([
  'text',
  'longText',
  'link',
  'picture',
  'toggle',
  'choice',
  'number',
  'colour',
  'dateTime',
  'list',
  'group',
]);

/**
 * The shared look fields the panel offers on every block. The rest of the
 * look (backgrounds, motion, own colours and fonts) comes later.
 */
const LOOK_NAMES = ['tone', 'size', 'radius', 'align', 'shadow', 'hideOn'];

/** Keeps the fields the panel can show, inside groups and lists too. */
function editable(fields: readonly SettingField[]): SettingField[] {
  return fields
    .filter((field) => EDITABLE_TYPES.has(field.type) && !field.forApp)
    .map((field) =>
      field.type === 'list' && field.fields
        ? { ...field, fields: editable(field.fields) }
        : field.type === 'group'
          ? { ...field, fields: editable(field.fields) }
          : field
    );
}

export interface BlockPanel {
  /** The block's name in the editor, from its summary. */
  label: string;
  kind: BlockKind;
  /** What the block shows, in panel order. */
  settings: SettingField[];
  /**
   * How the block looks. Unset, each block keeps its own default, so these
   * fields have none here.
   */
  look: SettingField[];
}

const LABELS: Record<EditorBlockType, string> = {
  'creator-header': 'Profile',
  'social-icons': 'Social icons',
  'link-list': 'Links',
  'text-block': 'Text',
  'site-image': 'Picture',
};

/** A block's settings panel, or undefined for a block R1 doesn't offer. */
export function blockPanel(type: string): BlockPanel | undefined {
  const info = isEditorBlock(type) ? blockInfo(type) : undefined;
  if (!info || !isEditorBlock(type)) return undefined;
  return {
    label: LABELS[type],
    kind: info.kind,
    settings: editable(info.settings),
    look: LOOK_SETTINGS.filter((field) => LOOK_NAMES.includes(field.name)).map(
      (field) => ({ ...field, default: undefined }) as SettingField
    ),
  };
}

/** What a new block of `type` starts with: empty lists, nothing made up. */
export function newBlockProps(type: EditorBlockType): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const field of blockPanel(type)?.settings ?? []) {
    if (field.type === 'list' && field.required) props[field.name] = [];
  }
  return props;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The longest a block's saved settings can be, as JSON. */
export const MAX_PROPS_LENGTH = 20_000;

/**
 * What's saved for a block: only the fields its panel has, as plain JSON.
 * Null when it isn't an object or is too long. Values are checked again,
 * one by one, when the page is drawn (readyProps), so a half-typed link is
 * kept in the draft without ever reaching the page.
 */
export function savedProps(
  type: string,
  props: unknown
): Record<string, unknown> | null {
  const panel = blockPanel(type);
  if (!panel || !isRecord(props)) return null;
  const names = new Set([...panel.settings, ...panel.look].map((f) => f.name));
  const kept = Object.fromEntries(
    Object.entries(props).filter(
      ([name, value]) => names.has(name) && value !== undefined
    )
  );
  const json = JSON.stringify(kept);
  if (json.length > MAX_PROPS_LENGTH) return null;
  return JSON.parse(json);
}

/** Addresses on the page: a link must be safe, a picture on https. */
function fitsValue(field: SettingField, value: unknown): boolean {
  if (field.type === 'picture')
    return typeof value === 'string' && /^https:\/\/\S+$/i.test(value.trim());
  if (field.type === 'link') return isSafeHref(value as string);
  if (field.type === 'text' || field.type === 'longText')
    return typeof value === 'string' && value.trim() !== '';
  return fitsSetting(field, value);
}

/** The fields of `value` that fit, and the labels of required ones missing. */
function readFields(
  fields: readonly SettingField[],
  value: Record<string, unknown>
): { props: Record<string, unknown>; missing: string[] } {
  const props: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const field of fields) {
    const read = readField(field, value[field.name]);
    if (read === undefined) {
      if (field.required) missing.push(field.label);
    } else {
      props[field.name] = read;
    }
  }
  return { props, missing };
}

/** A field's value as the block takes it, or undefined when it's not set. */
function readField(field: SettingField, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (field.type === 'list') {
    if (!Array.isArray(value)) return undefined;
    // Items still being filled in are left out, the rest still show.
    const items = field.fields
      ? value.flatMap((item) => {
          if (!isRecord(item)) return [];
          const read = readFields(field.fields ?? [], item);
          return read.missing.length ? [] : [read.props];
        })
      : value.filter((item) =>
          fitsValue({ name: '', label: '', type: field.of ?? 'text' }, item)
        );
    const limited = field.max === undefined ? items : items.slice(0, field.max);
    if (field.required && limited.length === 0) return undefined;
    if (field.min !== undefined && limited.length < field.min) return undefined;
    return limited;
  }
  if (field.type === 'group') {
    if (!isRecord(value)) return undefined;
    const read = readFields(field.fields, value);
    return read.missing.length ? undefined : read.props;
  }
  return fitsValue(field, value)
    ? typeof value === 'string'
      ? value.trim()
      : value
    : undefined;
}

export interface ReadyBlock {
  /** What the block takes, with anything unfinished left out. */
  props: Record<string, unknown>;
  /** Required fields still to fill in, by label: the block shows once none are. */
  missing: string[];
}

/**
 * A saved block's settings as the page shows them. A block with `missing`
 * fields is left off the live page, and the editor asks for them instead.
 */
export function readyProps(type: string, props: unknown): ReadyBlock {
  const panel = blockPanel(type);
  if (!panel) return { props: {}, missing: ['A block Levuche knows'] };
  const value = isRecord(props) ? props : {};
  const shown = readFields(panel.settings, value);
  const look = readFields(panel.look, value);
  return { props: { ...look.props, ...shown.props }, missing: shown.missing };
}
