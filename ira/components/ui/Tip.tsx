/** Info tooltip from the design: (i) button, dark bubble on hover/focus. */
export function Tip({ text, label }: { text: string; label: string }) {
  return (
    <span className="tip">
      <button type="button" aria-label={`What is ${label}?`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
        </svg>
      </button>
      <span className="tipbox" role="tooltip">{text}</span>
    </span>
  );
}
