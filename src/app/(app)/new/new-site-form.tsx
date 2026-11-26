'use client';

import { useActionState, useId } from 'react';
import { buttonClasses } from '@/lib/button';
import { HANDLE } from '@/lib/handle';
import { createSite } from './actions';

const field =
  'min-h-control border-lv-border bg-lv-card text-lv-text w-full rounded-xl border-2 px-4 text-base focus-visible:border-lv-primary';

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
            aria-describedby={`${id}-handle-hint`}
            defaultValue={state.handle}
            className={field}
          />
          <span className="text-lv-text-2 shrink-0">.levuche.page</span>
        </div>
        <p id={`${id}-handle-hint`} className="text-lv-text-2 m-0 text-sm">
          3 to 30 lowercase letters and numbers, with single hyphens between
          them.
        </p>
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
