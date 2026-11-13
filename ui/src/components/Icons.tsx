export function Logo() {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="kumoSwitch">
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="#102019" stroke="#3b5648" strokeWidth="1.2" />
      <rect x="4.5" y="4.5" width="23" height="23" rx="6.5" fill="#142820" opacity="0.92" />
      <path
        d="M8 11.5h10M14 7.5l4 4-4 4"
        stroke="#5ee0ad"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M24 20.5H14M18 16.5l-4 4 4 4"
        stroke="#efb35f"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="25.5" cy="7" r="1.7" fill="#5ee0ad" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path
        d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" strokeLinejoin="round" />
    </svg>
  );
}

export function AutoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M8.5 20.5h7" strokeLinecap="round" />
      <path d="M12 4.5v13" />
    </svg>
  );
}

export function WarnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 4.5 21 19.5H3L12 4.5Z" strokeLinejoin="round" />
      <path d="M12 10v4.2M12 17.1v.1" strokeLinecap="round" />
    </svg>
  );
}
export function IconArrowRight({ className }: { className?: string } = {}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h15" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck({ className }: { className?: string } = {}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}
