import { cn } from '@levuche/kit';

const looks = {
  primary:
    'bg-lv-primary text-lv-on-primary border-transparent shadow-sm hover:opacity-90 hover:shadow-md',
  outline:
    'border-lv-border text-lv-link hover:border-lv-link hover:bg-lv-surface-2 bg-transparent',
  quiet: 'text-lv-link border-transparent bg-transparent hover:bg-lv-surface-2',
  danger:
    'border-lv-danger-border text-lv-danger hover:border-lv-danger hover:bg-lv-danger/10 bg-transparent',
};

export type ButtonLook = keyof typeof looks;

/**
 * The app's buttons, in Levuche's product colours (creator pages use the
 * blocks' own SiteButton instead). Pill-shaped, 14 px text, at least 40 px tall with a
 * mouse and 44 px on touch screens. Each one answers the pointer: a tint or
 * lift on hover, a small press when clicked, and the focus ring for the keyboard.
 */
export function buttonClasses(
  look: ButtonLook = 'primary',
  className?: string
) {
  return cn(
    'min-h-control inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-2 px-4 font-[inherit] text-sm font-bold no-underline transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 aria-busy:cursor-progress motion-reduce:transition-none motion-reduce:active:scale-100',
    looks[look],
    className
  );
}
