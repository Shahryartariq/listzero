import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { callShared, useSpace } from "../shared/space";
import { usePageTitle } from "../state/usePageTitle";

interface Peek {
  listId: string;
  name: string;
  owner: string;
  role: "edit" | "view";
  member: boolean;
}

/** Where a share link lands: says whose list it is, then joins it (signed in only). */
export function Join() {
  const { token = "" } = useParams();
  const space = useSpace();
  const navigate = useNavigate();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  usePageTitle(peek ? `Join ${peek.name}` : "Join a shared list");
  const signedIn = space !== null;

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    callShared<Peek>("peek", { token })
      .then((found) => {
        if (!live) return;
        if (found.member) navigate(`/shared/${found.listId}`, { replace: true });
        else setPeek(found);
      })
      .catch(() => live && setProblem("This link doesn’t work anymore. Ask for a new one."));
    return () => {
      live = false;
    };
  }, [signedIn, token, navigate]);

  const join = async () => {
    setBusy(true);
    try {
      const { listId } = await callShared<{ listId: string }>("join", { token });
      navigate(`/shared/${listId}`, { replace: true });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That didn’t work. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="view">
      <header className="head">
        <h1 className="title">{peek ? peek.name : "Shared list"}</h1>
      </header>
      <div className="empty">
        {!signedIn ? (
          <>
            <h2 className="empty__title">Sign in to join this list.</h2>
            <p>Shared lists need an account, so everyone in a list can see who’s in it.</p>
            <div className="empty__actions">
              <Link to={`/sign-in?next=${encodeURIComponent(`/join/${token}`)}`} className="btn">
                Sign in
              </Link>
            </div>
          </>
        ) : problem ? (
          <>
            <h2 className="empty__title">{problem}</h2>
            <div className="empty__actions">
              <Link to="/today" className="btn btn--quiet">
                Back to Today
              </Link>
            </div>
          </>
        ) : peek ? (
          <>
            <h2 className="empty__title">
              {peek.owner || "Someone"} shared “{peek.name}” with you.
            </h2>
            <p>{peek.role === "edit" ? "You’ll be able to add, edit and tick off its tasks." : "You’ll be able to see its tasks."} It stays apart from your own tasks.</p>
            <div className="empty__actions">
              <button type="button" className="btn" onClick={() => void join()} disabled={busy}>
                Join list
              </button>
              <Link to="/today" className="btn btn--quiet">
                Not now
              </Link>
            </div>
          </>
        ) : (
          <p role="status">Opening the link…</p>
        )}
      </div>
    </div>
  );
}
