import type { ReactNode } from "react"

export type IconName =
  | "alert" | "arrow-right" | "calendar" | "camera" | "check" | "clock" | "contrast" | "elevator"
  | "eye" | "ear" | "info" | "location" | "lock" | "people" | "phone" | "route" | "shield"
  | "speaker" | "stairs" | "swap" | "train" | "user" | "wheelchair" | "x" | "walker" | "dog" | "bag" | "senior"
  | "plus" | "minus" | "expand" | "chevron-down" | "search" | "map" | "list"

const icons: Record<IconName, ReactNode> = {
  alert: (<><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4m0 3h.01" /></>),
  "arrow-right": <path d="M5 12h14m-5-5 5 5-5 5" />,
  calendar: (<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16" /></>),
  camera: (<><path d="M4 8h3l2-3h6l2 3h3v11H4Z" /><circle cx="12" cy="13" r="3.5" /></>),
  check: <path d="m5 12 4 4 10-10" />,
  clock: (<><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>),
  contrast: (<><circle cx="12" cy="12" r="9" /><path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" stroke="none" /></>),
  elevator: (<><rect x="6" y="3" width="12" height="18" rx="1" /><path d="M12 17V7m0 0L9.5 9.5M12 7l2.5 2.5M9 15l3 3 3-3" /></>),
  eye: (<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>),
  ear: (<><path d="M7 9a5 5 0 1 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0" /><path d="M10 9a2 2 0 0 1 4 0" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-9h.01" /></>),
  location: (<><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>),
  lock: (<><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
  people: (<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 20c.5-5 2.5-7 6-7s5.5 2 6 7m0-6c3 0 4.5 1.8 5 5" /></>),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />,
  route: (<><circle cx="7" cy="6" r="2" /><circle cx="17" cy="18" r="2" /><path d="M7 8v3c0 1.7 1.3 3 3 3h4c1.7 0 3 1.3 3 3v-1" /></>),
  shield: (<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" /><path d="m9 12 2 2 4-4" /></>),
  speaker: (<><path d="M5 10v4h3l4 4V6L8 10H5Z" /><path d="M16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12" /></>),
  stairs: <path d="M4 19h4v-4h4v-4h4V7h4" />,
  swap: <path d="m7 7 3-3m-3 3 3 3M7 7h10a3 3 0 0 1 3 3v1M17 17l-3 3m3-3-3-3m3 3H7a3 3 0 0 1-3-3v-1" />,
  train: (<><rect x="5" y="3" width="14" height="16" rx="4" /><path d="M8 7h8M8 12h.01M16 12h.01M8 19l-2 2m10-2 2 2" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>),
  wheelchair: (<><circle cx="10" cy="5" r="2" /><path d="m10 8 1 6h5l2 4m-8-7a5 5 0 1 0 4.5 7.2" /></>),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  walker: (<><circle cx="9" cy="4" r="2" /><path d="M9 7v6l-2 7m2-7 3 2v5M12 9h6v11M15 9v11" /></>),
  dog: (<><path d="M4 18v-5l2-4h7l3-3 3 1-1 3v8" /><path d="M7 18v-3m6 3v-4M4 13l-2-2" /></>),
  bag: (<><rect x="5" y="8" width="14" height="12" rx="2" /><path d="M9 8V5h6v3M5 13h14" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>),
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  senior: (<><circle cx="11" cy="4" r="2" /><path d="M11 7v6l-3 7m3-7 3 3 1 4M8 10l3-2 3 2M17 10v10" /></>),
}

export function Icon({ name, size = "md", className = "" }: { name: IconName; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizeClass = size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5"
  return (
    <svg aria-hidden="true" className={`${sizeClass} shrink-0 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  )
}
