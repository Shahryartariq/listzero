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
  menu: "M5 7h14M5 12h14M5 17h14",
  note: "M6 4.5h9l3 3V19.5H6zM9 10h6M9 13.5h6",
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
      strokeWidth={name === "more" ? 2.6 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
