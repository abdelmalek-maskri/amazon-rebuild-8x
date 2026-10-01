// Inline SVG icons: no icon font or extra package for a handful of shapes.
type IconProps = { className?: string };

export function SearchIcon({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function BasketIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 5h4l3.2 15.2a2 2 0 0 0 2 1.6h11.6a2 2 0 0 0 2-1.5L28 10H8.2" />
      <circle cx="13" cy="26.5" r="1.8" />
      <circle cx="24" cy="26.5" r="1.8" />
    </svg>
  );
}

export function Smile({ className = "h-2.5 w-14" }: IconProps) {
  return (
    <svg viewBox="0 0 56 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden>
      <path d="M2 2.5c14 7.5 34 7.5 48 0" />
      <path d="M46 1.2l4.6 1.3-1.9 4.3" strokeLinejoin="round" />
    </svg>
  );
}
