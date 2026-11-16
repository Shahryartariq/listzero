import { useEffect } from "react";

const SITE = "https://listzero.vercel.app";

/** The only addresses worth a place in search results, with the address each should be known by. */
const INDEXED: Record<string, string> = {
  "/today": "/",
  "/about": "/about",
};

function head<T extends HTMLElement>(selector: string, create: () => T): T {
  const found = document.head.querySelector<T>(selector);
  if (found) return found;
  const made = create();
  document.head.append(made);
  return made;
}

/**
 * Tells search engines which screens are pages and which are just the app.
 * The home page and "How it works" are indexed; a visitor's Inbox, Settings and the rest
 * are empty to a crawler, so they are marked noindex and carry no canonical address.
 */
export function useSeo(pathname: string) {
  useEffect(() => {
    const clean = pathname.replace(/\/+$/, "") || "/";
    const canonical = INDEXED[clean];
    const robots = head('meta[name="robots"]', () => {
      const meta = document.createElement("meta");
      meta.name = "robots";
      return meta;
    });
    robots.content = canonical ? "index, follow" : "noindex, follow";

    const link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      const target = link ?? head('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }));
      target.href = `${SITE}${canonical}`;
    } else {
      link?.remove();
    }
  }, [pathname]);
}
