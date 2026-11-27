/*
 * Reading and setting a block's settings by path, as edit mode (@levuche/ui
 * EditMode) names them: "title", "links.0.label" for a list item's field,
 * "address.city" for a group's. Plain functions, so they run in tests.
 */

type Props = Record<string, unknown>;

const isIndex = (key: string) => /^\d+$/.test(key);

/**
 * A copy of `props` with the setting at `path` set to `value`. Lists and
 * groups on the way are copied, never changed; a missing one is made.
 */
export function setAt(props: Props, path: string, value: unknown): Props {
  return setIn(props, path.split('.'), value) as Props;
}

function setIn(at: unknown, keys: string[], value: unknown): unknown {
  const [key, ...rest] = keys;
  const list = Array.isArray(at);
  const copy: Props | unknown[] = list
    ? [...(at as unknown[])]
    : { ...((typeof at === 'object' && at !== null ? at : {}) as Props) };
  const here = (copy as Props)[key];
  const next = rest.length
    ? setIn(here ?? (isIndex(rest[0]) ? [] : {}), rest, value)
    : value;
  if (list && isIndex(key)) (copy as unknown[])[Number(key)] = next;
  else (copy as Props)[key] = next;
  return copy;
}

/** The setting at `path`, or undefined when there's none. */
export function readAt(props: Props, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (at, key) =>
        typeof at === 'object' && at !== null ? (at as Props)[key] : undefined,
      props
    );
}

/**
 * The paths to look for a setting's field at, nearest first:
 * "links.0.label", then "links.0", then "links". A part of the page may be
 * set by its list or group when it has no field of its own.
 */
export function pathsUp(path: string): string[] {
  const keys = path.split('.');
  return keys.map((_, i) => keys.slice(0, keys.length - i).join('.'));
}
