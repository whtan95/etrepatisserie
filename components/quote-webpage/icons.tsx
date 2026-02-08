// Custom SVG icons for the pricing table

export function CanopyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Canopy roof with pointed top */}
      <path d="M12 2L3 10h18L12 2z" />
      {/* Scalloped bottom edge of canopy */}
      <path d="M3 10c1 1 2 1.5 3 1.5s2-.5 3-1.5c1 1 2 1.5 3 1.5s2-.5 3-1.5c1 1 2 1.5 3 1.5s2-.5 3-1.5" />
      {/* Four poles */}
      <line x1="5" y1="11" x2="5" y2="22" />
      <line x1="19" y1="11" x2="19" y2="22" />
      <line x1="9" y1="11" x2="9" y2="22" />
      <line x1="15" y1="11" x2="15" y2="22" />
    </svg>
  )
}

export function RoundTableWithChairsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Center round table */}
      <circle cx="12" cy="12" r="4" />
      {/* 10 chairs around the table */}
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="16.5" cy="5.5" r="1.5" />
      <circle cx="19" cy="9.5" r="1.5" />
      <circle cx="19" cy="14.5" r="1.5" />
      <circle cx="16.5" cy="18.5" r="1.5" />
      <circle cx="12" cy="20" r="1.5" />
      <circle cx="7.5" cy="18.5" r="1.5" />
      <circle cx="5" cy="14.5" r="1.5" />
      <circle cx="5" cy="9.5" r="1.5" />
      <circle cx="7.5" cy="5.5" r="1.5" />
    </svg>
  )
}

export function LongTableIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Table top - long rectangle */}
      <rect x="2" y="8" width="20" height="4" rx="0.5" />
      {/* Table legs */}
      <line x1="4" y1="12" x2="4" y2="18" />
      <line x1="20" y1="12" x2="20" y2="18" />
      {/* Leg supports */}
      <line x1="4" y1="18" x2="6" y2="18" />
      <line x1="18" y1="18" x2="20" y2="18" />
    </svg>
  )
}

export function PlasticChairIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Chair back */}
      <path d="M7 4c0-1 1-2 2-2h6c1 0 2 1 2 2v6H7V4z" />
      {/* Seat */}
      <rect x="6" y="10" width="12" height="3" rx="0.5" />
      {/* Front legs */}
      <line x1="7" y1="13" x2="6" y2="22" />
      <line x1="17" y1="13" x2="18" y2="22" />
      {/* Back legs */}
      <line x1="9" y1="13" x2="9" y2="22" />
      <line x1="15" y1="13" x2="15" y2="22" />
    </svg>
  )
}
