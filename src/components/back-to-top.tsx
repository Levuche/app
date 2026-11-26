'use client';

import { useEffect, useState } from 'react';

/**
 * A round button in the corner that takes the visitor back to the top of a
 * creator's page. It shows up once they've scrolled most of a screen down,
 * so it's never there when there's nothing above to go back to. It scrolls
 * smoothly unless the visitor's device asks for less motion, and moves the
 * keyboard focus to the top too, so the Tab key carries on from there.
 *
 * Colours come from the creator's theme (--site-*), so it has to sit inside
 * <CreatorTheme>.
 */
export function BackToTop({
  targetId,
  label = 'Back to top',
}: {
  /** The id of the element at the top of the page; it needs tabIndex={-1}. */
  targetId: string;
  label?: string;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setShown(window.scrollY > window.innerHeight * 0.75);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    // A page opened part way down (back from another page) needs it at once.
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  if (!shown) return null;

  const goToTop = () => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
    document.getElementById(targetId)?.focus({ preventScroll: true });
  };

  return (
    <button
      type="button"
      onClick={goToTop}
      data-back-to-top=""
      className="bg-site-accent text-site-on-accent size-control-md fixed end-4 bottom-4 z-20 inline-flex items-center justify-center rounded-full shadow-lg sm:end-6 sm:bottom-6"
    >
      <svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
      <span className="sr-only">{label}</span>
    </button>
  );
}
