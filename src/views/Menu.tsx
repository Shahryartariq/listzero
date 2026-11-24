import { Link, useOutletContext } from "react-router";
import { NavItems } from "../components/Shell";
import { usePageTitle } from "../state/usePageTitle";

/** The phone's "Menu" tab: everything the sidebar holds on larger screens. */
export function Menu() {
  const { openNewList, openAppearance } = useOutletContext<{ openNewList(): void; openAppearance(): void }>();
  usePageTitle("Menu");
  return (
    <div className="view">
      <header className="head">
        <h1 className="title">Menu</h1>
      </header>
      <div style={{ display: "grid", gap: "1.5rem" }}>
        <NavItems onNewList={openNewList} onAppearance={openAppearance} />
      </div>
    </div>
  );
}

export function NotFound({ list = false }: { list?: boolean }) {
  usePageTitle(list ? "List not found" : "Page not found");
  return (
    <div className="view">
      <div className="empty" style={{ paddingTop: 0 }}>
        <h1 className="empty__title">{list ? "This list does not exist." : "This page does not exist."}</h1>
        <p>
          {list
            ? "It may have been deleted, or made in another browser. Tasks from deleted lists are in the Inbox."
            : "The address may be mistyped. Your tasks are safe."}
        </p>
        <div className="empty__actions">
          <Link to="/today" className="btn">
            Go to Today
          </Link>
          {list && (
            <Link to="/inbox" className="btn btn--quiet">
              Open the Inbox
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
