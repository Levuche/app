import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClasses, type ButtonLook } from '@/lib/button';
import { cn } from '@levuche/kit';

type TipSide = 'top' | 'bottom';
type TipAlign = 'start' | 'center' | 'end';

const tipPlace: Record<TipSide, string> = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2',
};
const tipAlign: Record<TipAlign, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

/**
 * A short label that shows above (or below) a control while the mouse is
 * on it or the keyboard has reached it. It only repeats the control's own
 * name, which screen readers already hear, so it's hidden from them.
 */
export function Tooltip({
  text,
  side = 'top',
  align = 'center',
}: {
  text: string;
  side?: TipSide;
  align?: TipAlign;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-lv-text text-lv-bg pointer-events-none absolute z-30 rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap opacity-0 shadow-md transition-opacity delay-0 duration-150 group-hover/tip:opacity-100 group-hover/tip:delay-300 group-focus-visible/tip:opacity-100 motion-reduce:transition-none',
        tipPlace[side],
        tipAlign[align]
      )}
    >
      {text}
    </span>
  );
}

type Shared = {
  /** What the control does, read out by screen readers. */
  label: string;
  /** The words in the tooltip, when shorter than `label`. */
  tip?: string;
  icon: ReactNode;
  look?: ButtonLook;
  side?: TipSide;
  align?: TipAlign;
  className?: string;
};

const square = 'relative aspect-square px-0 group/tip';

/** A button that shows only an icon, with its name in a tooltip. */
export function IconButton({
  label,
  tip,
  icon,
  look = 'quiet',
  side,
  align,
  className,
  ...button
}: Shared & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...button}
      className={buttonClasses(look, cn(square, className))}
    >
      {icon}
      <Tooltip text={tip ?? label} side={side} align={align} />
    </button>
  );
}

/** A link that shows only an icon, with its name in a tooltip. */
export function IconLink({
  label,
  tip,
  icon,
  look = 'quiet',
  side,
  align,
  className,
  href,
  external = false,
}: Shared & { href: string; external?: boolean }) {
  const classes = buttonClasses(look, cn(square, className));
  const inside = (
    <>
      {icon}
      <Tooltip text={tip ?? label} side={side} align={align} />
    </>
  );
  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={label}
      className={classes}
    >
      {inside}
    </a>
  ) : (
    <Link href={href} aria-label={label} className={classes}>
      {inside}
    </Link>
  );
}
