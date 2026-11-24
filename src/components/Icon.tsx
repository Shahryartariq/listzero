/** A small set of line icons drawn for this app, so there is no icon library to ship. */

const PATHS = {
  inbox: "M4 13.5 6.4 6h11.2L20 13.5M4 13.5V18h16v-4.5M4 13.5h4.5l1 2h5l1-2H20",
  today: "M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  upcoming: "M5 6.5h14V19H5zM5 10.5h14M9 4v4M15 4v4",
  done: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM8.5 12.2l2.4 2.4 4.6-5",
  focus: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  search: "M10.5 5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM15 15l4.5 4.5",
  settings: "M5 8h9M18 8h1M5 16h1M10 16h9M16 6v4M8 14v4",
  about: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 11v5M12 8v.5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  list: "M5 7h.01M9 7h10M5 12h.01M9 12h10M5 17h.01M9 17h10",
  cards: "M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z",
  table: "M4.5 6h15v12h-15zM4.5 10h15M4.5 14h15M10 6v12",
  display: "M5 7h14M8 12h8M10.5 17h3",
  chevronLeft: "M14.5 6l-6 6 6 6",
  chevronRight: "M9.5 6l6 6-6 6",
  chevronDown: "M6.5 9.5l5.5 5.5 5.5-5.5",
  flag: "M6.5 20V4.5M6.5 5h10.5l-2 4 2 4H6.5",
  timer: "M10 3.5h4M12 3.5v2.5M12 20a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM12 13V10M17.5 7.5l1-1",
  sidebar: "M6 5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 6 5ZM9.5 5v14",
  board: "M5 5h4v14H5zM10.5 5h4v9h-4zM16 5h3.5v11H16z",
  palette: "M12 4a8 8 0 1 0 0 16c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.4 1.6-2.4H17a3 3 0 0 0 3-3c0-4.3-3.6-8.7-8-8.7ZM8.2 11.5h.01M10.5 8h.01M14.5 8h.01",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5.5 12.5l4.2 4.2L18.5 7.5",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4.5l3 1.8",
  repeat: "M6 9V8a2 2 0 0 1 2-2h9l-2.2-2.2M18 15v1a2 2 0 0 1-2 2H7l2.2 2.2",
  calendar: "M5 6.5h14V19H5zM5 10.5h14M9 4v4M15 4v4",
  later: "M5 12h13M13 7l5 5-5 5",
  steps: "M5 7h2M10 7h9M5 12h2M10 12h9M5 17h2M10 17h9",
  trash: "M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7M10.5 10.5v5M13.5 10.5v5",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  play: "M8.5 6.2v11.6a.6.6 0 0 0 .9.5l9.2-5.8a.6.6 0 0 0 0-1L9.4 5.7a.6.6 0 0 0-.9.5Z",
  pause: "M9 6.5v11M15 6.5v11",
  eye: "M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  eyeOff: "M4 4l16 16M9.9 6.3A8.6 8.6 0 0 1 12 6c5.7 0 9 6 9 6a15 15 0 0 1-2.7 3.4M14 14.1A2.5 2.5 0 0 1 9.9 10M6.3 7.7A15.2 15.2 0 0 0 3 12s3.3 6 9 6c1.2 0 2.3-.3 3.3-.7",
  user: "M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.5 19a6.5 6.5 0 0 1 13 0",
  cloud: "M7.5 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17.6 9 4.5 4.5 0 0 1 17 18Z",
  key: "M8 14a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM11.5 10.5H20M17 10.5v3M20 10.5v2",
  menu: "M5 7h14M5 12h14M5 17h14",
  note: "M6 4.5h9l3 3V19.5H6zM9 10h6M9 13.5h6",
  grip: "M9.5 6.5h.01M14.5 6.5h.01M9.5 12h.01M14.5 12h.01M9.5 17.5h.01M14.5 17.5h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" || name === "grip" ? 2.6 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
