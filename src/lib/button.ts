import { cn } from '@levuche/kit';

const looks = {
  primary: 'bg-lv-primary text-lv-on-primary border-transparent',
  outline: 'border-lv-border text-lv-link hover:border-lv-link bg-transparent',
  quiet: 'text-lv-link border-transparent bg-transparent hover:bg-lv-surface-2',
};

/**
 * The app's buttons, in Levuche's product colours (creator pages use the
 * blocks' own SiteButton instead). Pill-shaped, at least 40 px tall with a
 * mouse and 44 px on touch screens.
 */
export function buttonClasses(
  look: keyof typeof looks = 'primary',
  className?: string
) {
  return cn(
    'min-h-control inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-2 px-5 font-[inherit] text-sm font-bold no-underline transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress motion-reduce:transition-none',
    looks[look],
    className
  );
}
