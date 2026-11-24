import { useMemo, type ReactNode } from "react";
import { useLocation } from "react-router";
import { StoreContext, useStore } from "../state/store-context";
import { sharedStore } from "./sharedStore";
import { useSpace } from "./space";

/**
 * On a shared list's page, everything inside (the page and the task sheet it opens) works on that
 * list's tasks instead of the person's own. Everywhere else it changes nothing.
 */
export function SharedScope({ children }: { children: ReactNode }) {
  const personal = useStore();
  const space = useSpace();
  const { pathname } = useLocation();
  const id = /^\/shared\/([^/]+)/.exec(pathname)?.[1];
  const list = id ? space?.lists.find((l) => l.id === id) : undefined;
  // Rebuilt when the space changes (useSpace), so the screens see each new state.
  const store = useMemo(() => (list ? sharedStore(personal, list) : null), [personal, list, space]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!store) return children;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
