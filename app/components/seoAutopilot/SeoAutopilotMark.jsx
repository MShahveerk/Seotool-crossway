/**
 * Brand mark for SEO Autopilot — orbit (continuous loop) + radar sweep (site scan).
 * Lucide-compatible: pass className (e.g. size-4) like other sidebar icons.
 */
export default function SeoAutopilotMark({
  className,
  size,
  strokeWidth = 2,
  ...props
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Autopilot orbit */}
      <circle cx="12" cy="12" r="9" opacity="0.28" />
      <path d="M12 3a9 9 0 0 1 8.5 6.2" />
      {/* SEO radar / scan arcs */}
      <path d="M12 12 18.4 7.2" />
      <path d="M14.8 14.8a4 4 0 0 0-5.6 0" opacity="0.85" />
      <path d="M17.2 17.2a7.4 7.4 0 0 0-10.4 0" opacity="0.55" />
      {/* Locked target (the site) */}
      <circle cx="12" cy="12" r="2.15" fill="currentColor" stroke="none" />
    </svg>
  );
}
