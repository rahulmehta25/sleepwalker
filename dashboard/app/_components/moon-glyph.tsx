export function MoonGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="w-5 h-5 -translate-y-px" aria-hidden="true">
      <defs>
        <radialGradient id="moonHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f3c282" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#f3c282" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#f3c282" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="moonFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fef3da" />
          <stop offset="100%" stopColor="#f3c282" />
        </linearGradient>
      </defs>
      {/* halo */}
      <circle cx="16" cy="16" r="15" fill="url(#moonHalo)" />
      {/* crescent: full disc minus offset disc */}
      <mask id="crescent">
        <rect width="32" height="32" fill="black" />
        <circle cx="16" cy="16" r="9" fill="white" />
        <circle cx="20" cy="14" r="8" fill="black" />
      </mask>
      <rect width="32" height="32" fill="url(#moonFill)" mask="url(#crescent)" />
    </svg>
  );
}
