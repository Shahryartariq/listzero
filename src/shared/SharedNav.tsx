import { useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { Icon } from "../components/Icon";
import { ListSheet } from "../components/ListSheet";
import { useStore } from "../state/store-context";
import { callShared, useSpace } from "./space";

/**
 * The sidebar's Shared section: lists shared with or by the person, apart from their own. Shown
 * only to someone signed in, since sharing needs an account.
 */
export function SharedNav() {
  const space = useSpace();
  const store = useStore();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  if (!space) return null;

  return (
    <div className="side__lists">
      <div className="side__heading">
        <span id="shared-heading">Shared</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setCreating(true)}
          aria-label="New shared list"
          data-tip="New shared list"
          data-tip-always
        >
          <Icon name="plus" size={18} />
        </button>
      </div>
      <nav className="nav" aria-labelledby="shared-heading">
        {space.lists.map((list) => (
          <NavLink key={list.id} to={`/shared/${list.id}`} className="nav__link" data-tip={list.name}>
            <span className="dot" style={{ "--dot": `var(--c-${list.color})` } as React.CSSProperties} />
            <span className="nav__label">{list.name}</span>
            <span className="nav__shared" title={`Shared with ${list.people.length} people`}>
              <Icon name="people" size={15} />
              <span className="sr-only">, shared</span>
            </span>
            <span className="nav__count">
              {space.tasks.filter((t) => t.listId === list.id && t.completedAt === null).length || ""}
            </span>
          </NavLink>
        ))}
        {space.lists.length === 0 && (
          <p className="hint side__empty" style={{ padding: "0.25rem 0.6rem" }}>
            Lists you share with others.
          </p>
        )}
      </nav>
      {creating && (
        <ListSheet
          taken={space.lists.map((l) => l.name)}
          onClose={() => setCreating(false)}
          onSave={(name, color) => {
            void callShared<{ listId: string }>("create", { name, color })
              .then(({ listId }) => navigate(`/shared/${listId}`))
              .catch((e: Error) => store.notify(e.message));
          }}
        />
      )}
    </div>
  );
}
