/**
 * The frame for pages outside the app: the landing page and the sign-in screens. The brand, one
 * way onward, and the page itself; no sidebar or tab bar.
 */
import { Suspense, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useAccountConfig } from "../account/config";
import { countScreen } from "../lib/analytics";
import { useStore } from "../state/store-context";
import { useSeo } from "../state/useSeo";
import { useTheme } from "../state/useTheme";
import { ScreenBoundary } from "./ScreenBoundary";

export function Solo() {
  const store = useStore();
  const location = useLocation();
  const accounts = useAccountConfig()?.accounts === true;
  useTheme(store.data.settings);
  useSeo(location.pathname);

  const counting = store.data.settings.analytics;
  useEffect(() => {
    countScreen(location.pathname, counting);
  }, [location.pathname, counting]);

  const toSection = location.hash.length > 1;
  useEffect(() => {
    if (!toSection) window.scrollTo(0, 0);
  }, [location.pathname, toSection]);

  const home = location.pathname === "/";
  const signedIn = store.workspace.kind === "account";

  return (
    <div className="solo">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="solo__top">
        <Link to="/" className="brand" aria-label="Listzero home">
          <span className="brand__zero" aria-hidden="true" />
          <span className="brand__name">Listzero</span>
        </Link>
        {home ? (
          accounts &&
          !signedIn && (
            <Link to="/sign-in" className="btn btn--quiet btn--small">
              Sign in
            </Link>
          )
        ) : (
          <Link to="/today" className="link">
            {signedIn ? "Back to your tasks" : "Continue as a guest"}
          </Link>
        )}
      </header>
      <main className="solo__main" id="main" tabIndex={-1}>
        <ScreenBoundary key={location.pathname}>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </ScreenBoundary>
      </main>
    </div>
  );
}
