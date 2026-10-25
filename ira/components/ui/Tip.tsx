"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Info tooltip from the design: (i) button, dark bubble on hover, focus or tap.
 * Esc dismisses it (WCAG 1.4.13). The bubble exists only while open and is
 * nudged to stay inside the viewport, so it never widens the page on phones.
 */
export function Tip({ text, label }: { text: string; label: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const box = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const gutter = 12;
    setShift(r.left < gutter ? gutter - r.left : r.right > innerWidth - gutter ? innerWidth - gutter - r.right : 0);
  }, [open]);

  const show = () => setOpen(true);
  const hide = () => { setOpen(false); setShift(0); };

  return (
    <span className="tip" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onKeyDown={(e) => { if (e.key === "Escape") hide(); }}>
      <button type="button" aria-label={`What is ${label}?`} aria-describedby={open ? id : undefined} aria-expanded={open} onClick={() => (open ? hide() : show())}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <span ref={box} id={id} className="tipbox" role="tooltip" style={{ marginLeft: shift }}>{text}</span>
      )}
    </span>
  );
}
