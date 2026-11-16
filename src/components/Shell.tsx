import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { inboxView, todayView } from "../lib/store";
import { useStore } from "../state/store-context";
import { useTheme } from "../state/useTheme";
import { AppearanceSheet } from "./Appearance";
import { Icon, type IconName } from "./Icon";
import { ListSheet } from "./ListSheet";
import { TaskSheet } from "./TaskSheet";
import { Toasts } from "./Toasts";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const GO: Record<string, string> = { i: "/inbox", t: "/today", u: "/upcoming", d: "/done", f: "/focus", s: "/settings" };

export function NavItems({ onNewList, onAppearance }: { onNewList(): void; onAppearance(): void }) {
  const store = useStore();
  const today = todayView(store.data, store.today);
  const counts: Record<string, number> = {
    "/inbox": inboxView(store.data).length,
    "/today": today.due.length + today.carried.length,
  };
  const main: { to: string; label: string; icon: IconName }[] = [
    { to: "/inbox", label: "Inbox", icon: "inbox" },
    { to: "/today", label: "Today", icon: "today" },
    { to: "/upcoming", label: "Upcoming", icon: "upcoming" },
    { to: "/done", label: "Done", icon: "done" },
  ];
  return (
    <>
      <nav className="nav" aria-label="Views">
        {main.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav__link">
            <Icon name={item.icon} />
            {item.label}
            {counts[item.to] ? (
              <span className="nav__count">
                {counts[item.to]}
                <span className="sr-only"> open</span>
              </span>
            ) : null}
          </NavLink>
        ))}
        <NavLink to="/focus" className="nav__link">
          <Icon name="focus" />
          Focus
        </NavLink>
        <NavLink to="/search" className="nav__link">
          <Icon name="search" />
          Search
        </NavLink>
      </nav>

      <div>
        <div className="side__heading">
          <span id="lists-heading">Lists</span>
          <button type="button" className="icon-btn" onClick={onNewList} aria-label="New list">
            <Icon name="plus" size={18} />
          </button>
        </div>
        <nav className="nav" aria-labelledby="lists-heading">
          {store.data.lists.map((list) => (
            <NavLink key={list.id} to={`/list/${list.id}`} className="nav__link">
              <span className="dot" style={{ "--dot": `var(--c-${list.color})`, margin: "0 0.28rem" } as React.CSSProperties} />
              {list.name}
              <span className="nav__count">
                {store.data.tasks.filter((t) => t.listId === list.id && t.completedAt === null).length || ""}
              </span>
            </NavLink>
          ))}
          {store.data.lists.length === 0 && (
            <p className="hint" style={{ padding: "0.25rem 0.6rem" }}>
              Lists group tasks, like Work or Home.
            </p>
          )}
        </nav>
      </div>

      <nav className="nav side__foot" aria-label="More">
        <button type="button" className="nav__link nav__button" onClick={onAppearance}>
          <Icon name="palette" />
          Appearance
        </button>
        <NavLink to="/settings" className="nav__link">
          <Icon name="settings" />
          Settings
        </NavLink>
        <NavLink to="/about" className="nav__link">
          <Icon name="about" />
          How it works
        </NavLink>
      </nav>
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
  useTheme(store.data.settings);

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
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to tasks
      </a>
      <aside className="side">
        <Link to="/today" className="brand" aria-label="Listzero, go to Today">
          <span className="brand__zero" aria-hidden="true" />
          Listzero
        </Link>
        <NavItems onNewList={() => setNewList(true)} onAppearance={() => setAppearance(true)} />
      </aside>

      <main className="main" id="main" tabIndex={-1}>
        {!store.persistent && (
          <div className="note" role="alert" style={{ marginTop: 0, marginBottom: "1.5rem" }}>
            <p>
              This browser is not saving data for this site, so your tasks will be gone when you close the tab. Turn
              off private mode, or export a backup from Settings before you leave.
            </p>
          </div>
        )}
        <Outlet context={{ openNewList: () => setNewList(true), openAppearance: () => setAppearance(true) }} />
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

      <TaskSheet />
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
      <Toasts />
    </div>
  );
}
