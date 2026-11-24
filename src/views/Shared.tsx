import { Link, useParams } from "react-router";
import { useSpace, useSpaceLoading } from "../shared/space";
import { usePageTitle } from "../state/usePageTitle";
import { ListView } from "./Lists";

/** A shared list's page: the list page, working on the shared list (see SharedScope). */
export function SharedListView() {
  const { sharedId = "" } = useParams();
  const space = useSpace();
  const list = space?.lists.find((l) => l.id === sharedId);
  const loading = useSpaceLoading();
  usePageTitle(list?.name ?? "Shared list");
  if (list) return <ListView listId={list.id} shared={list} />;
  // Just opened: wait to know who is signed in before saying the list isn't theirs.
  if (loading) return <div className="view" aria-busy="true" />;

  return (
    <div className="view">
      <header className="head">
        <h1 className="title">Shared list</h1>
      </header>
      <div className="empty">
        {space ? (
          <>
            <h2 className="empty__title">This list isn’t shared with you.</h2>
            <p>It may have been deleted, or you were removed from it.</p>
          </>
        ) : (
          <>
            <h2 className="empty__title">Sign in to see this list.</h2>
            <p>Shared lists need an account, so the people in them know who’s who.</p>
          </>
        )}
        <div className="empty__actions">
          <Link to={space ? "/today" : "/sign-in"} className="btn btn--quiet">
            {space ? "Back to Today" : "Sign in"}
          </Link>
        </div>
      </div>
    </div>
  );
}
