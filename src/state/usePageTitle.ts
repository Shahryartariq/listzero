import { useEffect } from "react";

/** The title search engines and first-time visitors see. Keep in step with index.html. */
export const SITE_TITLE = "Listzero: a free to-do list for busy minds";

/** Names the tab after the view. Pass null to keep the site's own title. */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title === null ? SITE_TITLE : `${title} | Listzero`;
  }, [title]);
}
