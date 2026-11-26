'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import type { HandleCheck } from '@/app/api/handles/route';
import { buttonClasses } from '@/lib/button';
import { HANDLE, siteAddress } from '@/lib/handle';
import { createSite } from './actions';

/** How long typing pauses before the address is checked. */
const CHECK_AFTER_MS = 400;

/**
 * Checks the address as it's typed, after a pause: free, taken or kept
 * back, with free names to pick when it isn't. Says nothing until there's
 * an answer, and nothing at all without the page's script; the server
 * checks again when the form is sent.
 */
function useHandleCheck(handle: string) {
  const [check, setCheck] = useState<HandleCheck | null>(null);
  useEffect(() => {
    const wanted = handle.trim().toLowerCase();
    if (wanted.length < HANDLE.min) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/handles?handle=${encodeURIComponent(wanted)}`,
          { signal: controller.signal }
        );
        if (res.ok) setCheck((await res.json()) as HandleCheck);
      } catch {
        // Aborted by the next key, or offline: the server checks on send.
      }
    }, CHECK_AFTER_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [handle]);
  // An answer for what's in the box now, never for an earlier value.
  return check?.handle === handle.trim().toLowerCase() ? check : null;
}

const field =
  'min-h-control border-lv-border bg-lv-card text-lv-text w-full rounded-xl border-2 px-3 text-base focus-visible:border-lv-primary sm:text-sm';

/**
 * The site's name and address. Works before the page's script loads, and
 * keeps what was typed when the server sends it back with a problem.
 */
export function NewSiteForm() {
  const [state, action, pending] = useActionState(createSite, {
    name: '',
    handle: '',
  });
  const id = useId();
  const handleInput = useRef<HTMLInputElement>(null);
  const [handle, setHandle] = useState(state.handle);
  const check = useHandleCheck(handle);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-name`} className="font-semibold">
          Site name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          maxLength={60}
          autoComplete="off"
          defaultValue={state.name}
          className={field}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-handle`} className="font-semibold">
          Address
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-handle`}
            name="handle"
            required
            minLength={HANDLE.min}
            maxLength={HANDLE.max}
            pattern={HANDLE.pattern}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${id}-handle-hint ${id}-handle-check`}
            defaultValue={state.handle}
            onChange={(event) => setHandle(event.target.value)}
            ref={handleInput}
            className={field}
          />
          <span className="text-lv-text-2 shrink-0">.levuche.page</span>
        </div>
        <p id={`${id}-handle-hint`} className="text-lv-text-2 m-0 text-sm">
          3 to 30 lowercase letters and numbers, with single hyphens between
          them.
        </p>
        <div id={`${id}-handle-check`} role="status" className="text-sm">
          {check?.available && (
            <p className="text-lv-success m-0 font-semibold">
              {siteAddress(check.handle)} is free.
            </p>
          )}
          {check && !check.available && (
            <p className="text-lv-danger m-0 font-semibold">{check.message}</p>
          )}
        </div>
        {check && check.suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lv-text-2 text-sm">Free instead:</span>
            {check.suggestions.map((name) => (
              <button
                key={name}
                type="button"
                className={buttonClasses('outline')}
                aria-label={`Use ${siteAddress(name)}`}
                onClick={() => {
                  if (handleInput.current) {
                    handleInput.current.value = name;
                    handleInput.current.focus();
                  }
                  setHandle(name);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-lv-danger m-0 font-semibold">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        aria-busy={pending}
        disabled={pending}
        className={buttonClasses('primary', 'self-start')}
      >
        {pending ? 'Making your site…' : 'Make the site'}
      </button>
    </form>
  );
}
