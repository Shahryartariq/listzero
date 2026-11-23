import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAccountConfig } from "../account/config";
import { countScreen } from "../lib/analytics";
import { downloadText } from "../lib/download";
import { lazyView } from "../lib/lazyView";
import { inboxView, todayView } from "../lib/store";
import { useStore } from "../state/store-context";
import { useSeo } from "../state/useSeo";
import { useTheme } from "../state/useTheme";
import { AppearanceSheet } from "./Appearance";
import { Icon, type IconName } from "./Icon";
import { ListSheet } from "./ListSheet";
import { ScreenBoundary } from "./ScreenBoundary";
import { useScrollHint } from "./scrollHint";
import { SideTips } from "./SideTips";

// The task sheet is the largest single component and is only needed once a task is opened.
const TaskSheet = lazyView(() => import("./TaskSheet").then((m) => m.TaskSheet));

// The account's parts are fetched only on a copy of Listzero that has accounts.
const AccountEntry = lazyView(() => import("../account/parts").then((m) => m.AccountEntry));

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const GO: Record<string, string> = {
  i: "/inbox",
  t: "/today",
  u: "/upcoming",
  b: "/board",
  d: "/done",
  f: "/focus",
  s: "/settings",
};

/**
 * The views, the lists, and the rest. In the sidebar (`compact`) the rest is one row of icons under
 * the account; the phone's menu page shows them as full rows.
 */
export function NavItems({ onNewList, onAppearance, compact = false }: { onNewList(): void; onAppearance(): void; compact?: boolean }) {
  const store = useStore();
  const accounts = useAccountConfig()?.accounts === true;
  const today = todayView(store.data, store.today);
  const counts: Record<string, number> = {
    "/inbox": inboxView(store.data).length,
    "/today": today.due.length + today.carried.length,
  };
  const main: { to: string; label: string; icon: IconName }[] = [
    { to: "/inbox", label: "Inbox", icon: "inbox" },
    { to: "/today", label: "Today", icon: "today" },
    { to: "/upcoming", label: "Upcoming", icon: "upcoming" },
    { to: "/board", label: "Board", icon: "board" },
    { to: "/done", label: "Done", icon: "done" },
  ];
  // In the sidebar the views and lists scroll between the name at the top and the footer.
  const body = useRef<HTMLDivElement>(null);
  useScrollHint(body, compact ? store.data.lists.length : null);
  const views = (
    <>
      <nav className="nav" aria-label="Views">
        {main.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav__link" data-tip={item.label}>
            <Icon name={item.icon} />
            <span className="nav__label">{item.label}</span>
            {counts[item.to] ? (
              <span className="nav__count">
                {counts[item.to]}
                <span className="sr-only"> open</span>
              </span>
            ) : null}
          </NavLink>
        ))}
        <NavLink to="/focus" className="nav__link" data-tip="Focus">
          <Icon name="focus" />
          <span className="nav__label">Focus</span>
        </NavLink>
        <NavLink to="/search" className="nav__link" data-tip="Search" data-tip-keys="/">
          <Icon name="search" />
          <span className="nav__label">Search</span>
        </NavLink>
      </nav>

      <div className="side__lists">
        <div className="side__heading">
          <span id="lists-heading">Lists</span>
          <button type="button" className="icon-btn" onClick={onNewList} aria-label="New list" data-tip="New list" data-tip-always>
            <Icon name="plus" size={18} />
          </button>
        </div>
        <nav className="nav" aria-labelledby="lists-heading">
          {store.data.lists.map((list) => (
            <NavLink key={list.id} to={`/list/${list.id}`} className="nav__link" data-tip={list.name}>
              <span className="dot" style={{ "--dot": `var(--c-${list.color})` } as React.CSSProperties} />
              <span className="nav__label">{list.name}</span>
              <span className="nav__count">
                {store.data.tasks.filter((t) => t.listId === list.id && t.completedAt === null).length || ""}
              </span>
            </NavLink>
          ))}
          {store.data.lists.length === 0 && (
            <p className="hint side__empty" style={{ padding: "0.25rem 0.6rem" }}>
              Lists group tasks, like Work or Home.
            </p>
          )}
        </nav>
      </div>
    </>
  );
  return (
    <>
      {compact ? (
        <div className="side__body" ref={body}>
          {views}
        </div>
      ) : (
        views
      )}

      {compact ? (
        <nav className="side__foot" aria-label="More">
          {accounts && (
            <div className="nav">
              <Suspense fallback={null}>
                <AccountEntry />
              </Suspense>
            </div>
          )}
          <div className="side__tools">
            <button type="button" className="icon-btn" onClick={onAppearance} aria-label="Appearance" data-tip="Appearance" data-tip-always>
              <Icon name="palette" size={20} />
            </button>
            <NavLink to="/settings" className="icon-btn" aria-label="Settings" data-tip="Settings" data-tip-keys="g s" data-tip-always>
              <Icon name="settings" size={20} />
            </NavLink>
            <NavLink to="/about" className="icon-btn" aria-label="How it works" data-tip="How it works" data-tip-keys="?" data-tip-always>
              <Icon name="about" size={20} />
            </NavLink>
          </div>
        </nav>
      ) : (
        <nav className="nav side__foot" aria-label="More">
          {accounts && (
            <Suspense fallback={null}>
              <AccountEntry />
            </Suspense>
          )}
          <button type="button" className="nav__link nav__button" onClick={onAppearance} data-tip="Appearance">
            <Icon name="palette" />
            <span className="nav__label">Appearance</span>
          </button>
          <NavLink to="/settings" className="nav__link" data-tip="Settings">
            <Icon name="settings" />
            <span className="nav__label">Settings</span>
          </NavLink>
          <NavLink to="/about" className="nav__link" data-tip="How it works" data-tip-keys="?">
            <Icon name="about" />
            <span className="nav__label">How it works</span>
          </NavLink>
        </nav>
      )}
    </>
  );
}

export function Shell() {
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [newList, setNewList] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const pendingG = useRef(0);
  const side = useRef<HTMLElement>(null);
  useTheme(store.data.settings);

  // The narrow sidebar is a per-device choice. public/theme.js sets the same attribute before the
  // first paint; this keeps it in step when it changes.
  const narrow = store.data.settings.sidebarCollapsed;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (narrow) root.dataset.sidebar = "collapsed";
    else delete root.dataset.sidebar;
  }, [narrow]);
  const toggleSide = useRef(() => {});
  toggleSide.current = () => store.updateSettings({ sidebarCollapsed: !store.read().settings.sidebarCollapsed });
  useSeo(location.pathname);

  // Visit counting for the public site. Only the kind of screen is sent; see lib/analytics.
  const counting = store.data.settings.analytics;
  useEffect(() => {
    countScreen(location.pathname, counting);
  }, [location.pathname, counting]);

  const focusAdd = () => {
    const input = document.getElementById("quick-add");
    if (input) {
      input.focus();
      input.scrollIntoView({ block: "center" });
    } else {
      navigate("/inbox", { state: { add: Date.now() } });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      const key = e.key.toLowerCase();

      if (Date.now() - pendingG.current < 1200 && GO[key]) {
        pendingG.current = 0;
        e.preventDefault();
        navigate(GO[key]);
        return;
      }
      if (key === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (key === "q" || key === "n") {
        e.preventDefault();
        const input = document.getElementById("quick-add");
        if (input) input.focus();
        else navigate("/inbox", { state: { add: Date.now() } });
      } else if (key === "/") {
        e.preventDefault();
        navigate("/search");
      } else if (e.key === "?") {
        navigate("/about");
      } else if (e.key === "[") {
        // Only where there is a sidebar to resize.
        if (side.current && getComputedStyle(side.current).display !== "none") {
          e.preventDefault();
          toggleSide.current();
        }
      } else if (key === "j" || key === "k") {
        const rows = [...document.querySelectorAll<HTMLElement>("[data-row]")];
        if (rows.length === 0) return;
        const at = rows.indexOf(document.activeElement as HTMLElement);
        const next = key === "j" ? Math.min(rows.length - 1, at + 1) : Math.max(0, at === -1 ? 0 : at - 1);
        rows[next]?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Each view starts at the top, and screen readers hear where they are.
  // (A link to a section, like /about#privacy, is left for that page to scroll to.)
  const toSection = location.hash.length > 1;
  useEffect(() => {
    if (!toSection) window.scrollTo(0, 0);
  }, [location.pathname, toSection]);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to tasks
      </a>
      <aside className="side" ref={side}>
        <div className="side__top">
          <Link to="/today" className="brand" aria-label="Listzero, go to Today" data-tip="Go to Today">
            <span className="brand__zero" aria-hidden="true" />
            <span className="brand__name">Listzero</span>
          </Link>
          <button
            type="button"
            className="icon-btn side__toggle"
            onClick={() => toggleSide.current()}
            aria-label={narrow ? "Expand sidebar" : "Collapse sidebar"}
            aria-keyshortcuts="["
            data-tip={narrow ? "Expand sidebar" : "Collapse sidebar"}
            data-tip-keys="["
            data-tip-always
          >
            <Icon name="sidebar" size={20} />
          </button>
        </div>
        <NavItems onNewList={() => setNewList(true)} onAppearance={() => setAppearance(true)} compact />
      </aside>
      <SideTips side={side} narrow={narrow} />

      <main className="main" id="main" tabIndex={-1}>
        {store.saving === "blocked" && (
          <div className="note" role="alert" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            <p>
              This browser is not saving data for this site, so your tasks will be gone when you close the tab. Turn
              off private mode, or save a backup from <Link to="/settings">Settings</Link> before you leave.
            </p>
          </div>
        )}
        {store.saving === "full" && (
          <div className="note" role="alert" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            <p>
              This browser has run out of room for this site, so your latest changes are not being saved. Save a
              backup from <Link to="/settings">Settings</Link> now, then clear finished tasks in{" "}
              <Link to="/done">Done</Link> to make room.
            </p>
          </div>
        )}
        {store.damaged !== null && (
          <div className="note" role="alert" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            <p>
              The tasks saved in this browser could not be read, so Listzero started empty. A copy of what was there
              has been kept. Download it before you clear anything; it can often be repaired.
            </p>
            <div className="note__actions">
              <button
                type="button"
                className="btn btn--small"
                onClick={() => downloadText(`listzero-unreadable-${store.today}.txt`, store.damaged ?? "", "text/plain")}
              >
                Download the copy
              </button>
              <button type="button" className="btn btn--quiet btn--small" onClick={store.forgetDamaged}>
                Delete the copy
              </button>
            </div>
          </div>
        )}
        <ScreenBoundary key={location.pathname}>
          <Suspense fallback={null}>
            <Outlet context={{ openNewList: () => setNewList(true), openAppearance: () => setAppearance(true) }} />
          </Suspense>
        </ScreenBoundary>
      </main>

      <nav className="tabs" aria-label="Main">
        <NavLink to="/inbox" className="tabs__link">
          <Icon name="inbox" size={22} />
          Inbox
        </NavLink>
        <NavLink to="/today" className="tabs__link">
          <Icon name="today" size={22} />
          Today
        </NavLink>
        <button type="button" className="tabs__add" onClick={focusAdd} aria-label="Add a task">
          <Icon name="plus" size={24} />
        </button>
        <NavLink to="/upcoming" className="tabs__link">
          <Icon name="upcoming" size={22} />
          Upcoming
        </NavLink>
        <NavLink to="/menu" className="tabs__link">
          <Icon name="menu" size={22} />
          Menu
        </NavLink>
      </nav>

      {new URLSearchParams(location.search).has("task") && (
        <Suspense fallback={null}>
          <TaskSheet />
        </Suspense>
      )}
      {newList && (
        <ListSheet
          taken={store.data.lists.map((l) => l.name)}
          onClose={() => setNewList(false)}
          onSave={(name, color) => {
            const id = store.addList(name, color);
            navigate(`/list/${id}`);
          }}
        />
      )}
      {appearance && <AppearanceSheet onClose={() => setAppearance(false)} />}
    </div>
  );
}
