/** For admins: who has an account, with the few things an admin may do about it. */
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { authClient } from "../../account/client";
import { useAccountConfig } from "../../account/config";
import { authMessage } from "../../account/messages";
import { CannotReach, FormMessage } from "../../account/ui";
import { Picker } from "../../components/Picker";
import { Confirm, Sheet } from "../../components/Sheet";
import { usePageTitle } from "../../state/usePageTitle";

interface Person {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  emailVerified: boolean;
  createdAt: string | Date;
}

const PAGE = 20;
const day = (value: string | Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

type Pending = { kind: "ban"; person: Person } | { kind: "delete"; person: Person } | null;

export function Admin() {
  usePageTitle("People");
  const config = useAccountConfig();
  const session = authClient.useSession();
  const me = session.data?.user;
  const isAdmin = me?.role === "admin";

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("0");

  const load = useCallback(async () => {
    const { data, error } = await authClient.admin.listUsers({
      query: {
        limit: PAGE,
        offset: page * PAGE,
        sortBy: "createdAt",
        sortDirection: "desc",
        ...(search ? { searchValue: search, searchField: "email" as const, searchOperator: "contains" as const } : {}),
      },
    });
    if (error || !data) return setMessage({ error: authMessage(error) });
    setPeople(data.users as Person[]);
    setTotal(data.total);
  }, [page, search]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (config === null || (session.isPending && !session.data)) return null;
  if (!config.accounts) return <Navigate to="/today" replace />;
  if (!me) {
    if (session.error) return <CannotReach title="People" onRetry={() => void session.refetch()} />;
    return <Navigate to="/sign-in?next=/admin" replace />;
  }
  if (!isAdmin) {
    return (
      <div className="view">
        <div className="empty" style={{ paddingTop: 0 }}>
          <h1 className="empty__title">This page is for admins.</h1>
          <div className="empty__actions">
            <Link to="/account" className="btn">
              Back to Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const act = async (work: () => Promise<{ error: { code?: string; message?: string; status?: number } | null }>, done: string) => {
    setMessage({});
    const { error } = await work();
    setMessage(error ? { error: authMessage(error) } : { notice: done });
    void load();
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="view view--wide">
      <header className="head">
        <h1 className="title">People</h1>
      </header>
      <p className="auth__lead">
        {total} {total === 1 ? "account" : "accounts"}. Admins can see who has an account, never anyone’s tasks.
      </p>

      <form
        className="form form--inline"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setSearch(query.trim());
        }}
      >
        <label className="sr-only" htmlFor="admin-search">
          Search by email
        </label>
        <input id="admin-search" className="field" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by email" />
        <button type="submit" className="btn btn--quiet">
          Search
        </button>
      </form>
      <FormMessage {...message} />

      {/* Explicit roles keep this a table for screen readers when the phone layout changes its display. */}
      <div className="table-scroll table-scroll--people" role="region" aria-label="Accounts" tabIndex={0}>
        <table className="grid grid--people" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Person</th>
              <th role="columnheader" scope="col">Joined</th>
              <th role="columnheader" scope="col">Role</th>
              <th role="columnheader" scope="col">Status</th>
              <th role="columnheader" scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody role="rowgroup">
            {people.map((person) => {
              const self = person.id === me.id;
              const admin = person.role === "admin";
              return (
                <tr role="row" key={person.id}>
                  <th role="rowheader" scope="row">
                    {person.name}
                    {self ? " (you)" : ""}
                    <br />
                    <span className="hint">
                      {person.email}
                      {person.username ? ` · @${person.username}` : ""}
                    </span>
                  </th>
                  <td role="cell" data-label="Joined" className="grid__date">
                    {day(person.createdAt)}
                  </td>
                  <td role="cell" data-label="Role">{admin ? "Admin" : "User"}</td>
                  <td role="cell" data-label="Status">{person.banned ? `Suspended${person.banReason ? `: ${person.banReason}` : ""}` : person.emailVerified ? "Active" : "Email not confirmed"}</td>
                  <td role="cell">
                    {!self && (
                      <div className="setting__row">
                        <button
                          type="button"
                          className="btn btn--quiet btn--small"
                          onClick={() =>
                            void act(
                              () => authClient.admin.setRole({ userId: person.id, role: admin ? "user" : "admin" }),
                              admin ? `${person.name} is now a user.` : `${person.name} is now an admin.`,
                            )
                          }
                        >
                          {admin ? "Make user" : "Make admin"}
                        </button>
                        {person.banned ? (
                          <button
                            type="button"
                            className="btn btn--quiet btn--small"
                            onClick={() => void act(() => authClient.admin.unbanUser({ userId: person.id }), `${person.name} can sign in again.`)}
                          >
                            Lift suspension
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn--quiet btn--small"
                            onClick={() => {
                              setReason("");
                              setDays("0");
                              setPending({ kind: "ban", person });
                            }}
                          >
                            Suspend
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--quiet btn--small"
                          onClick={() => void act(() => authClient.admin.revokeUserSessions({ userId: person.id }), `${person.name} was signed out everywhere.`)}
                        >
                          Sign out everywhere
                        </button>
                        <button type="button" className="btn btn--quiet btn--small" onClick={() => setPending({ kind: "delete", person })}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {people.length === 0 && (
              <tr role="row">
                <td role="cell" colSpan={5}>No accounts match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="setting__row">
          <button type="button" className="btn btn--quiet" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <button type="button" className="btn btn--quiet" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {pending?.kind === "ban" && (
        <Sheet
          title={`Suspend ${pending.person.name}`}
          small
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="btn btn--quiet" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  const person = pending.person;
                  const length = Number(days);
                  setPending(null);
                  void act(
                    () =>
                      authClient.admin.banUser({
                        userId: person.id,
                        ...(reason.trim() ? { banReason: reason.trim().slice(0, 200) } : {}),
                        ...(length > 0 ? { banExpiresIn: length * 24 * 60 * 60 } : {}),
                      }),
                    `${person.name} was suspended and signed out.`,
                  );
                }}
              >
                Suspend
              </button>
            </>
          }
        >
          <div className="form">
            <p>They are signed out everywhere and cannot sign in. Their tasks are kept.</p>
            <label className="label" htmlFor="ban-reason">
              Reason (they see this)
            </label>
            <input id="ban-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            <span className="label" aria-hidden="true">
              For how long
            </span>
            <Picker
              label="For how long"
              wide
              value={days}
              options={[
                { value: "1", label: "1 day" },
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "0", label: "Until lifted" },
              ]}
              onChange={setDays}
            />
          </div>
        </Sheet>
      )}

      {pending?.kind === "delete" && (
        <Confirm
          title={`Delete ${pending.person.email}?`}
          body="Their account and the tasks stored with it are deleted for good. This cannot be undone."
          confirmLabel="Delete account"
          onClose={() => setPending(null)}
          onConfirm={() => {
            const person = pending.person;
            setPending(null);
            void act(() => authClient.admin.removeUser({ userId: person.id }), `${person.email} was deleted.`);
          }}
        />
      )}
    </div>
  );
}
