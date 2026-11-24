/**
 * The admin panel, at /admin. To anyone who isn't a signed-in admin it is the ordinary "page not
 * found", and its API answers 404, so nothing tells a visitor it is there. Admins sign in at
 * /admin/login (src/views/account/Auth.tsx), which nothing links to.
 *
 * Admins see who has an account, who is online now, and one person's details: how they sign in,
 * their devices, and how much they keep here (counts, never the tasks themselves).
 */
import { useCallback, useEffect, useState } from "react";
import { authClient, type SessionUser } from "../../account/client";
import { useAccountConfig } from "../../account/config";
import { describeDevice } from "../../account/devices";
import { authMessage } from "../../account/messages";
import { isAdminRole } from "../../account/roles";
import { FormMessage } from "../../account/ui";
import { Picker } from "../../components/Picker";
import { Confirm, Sheet } from "../../components/Sheet";
import { usePageTitle } from "../../state/usePageTitle";
import { NotFound } from "../Menu";


type Filter = "all" | "online" | "admins" | "suspended" | "unconfirmed";

interface OnlinePerson {
  id: string;
  name: string;
  email: string;
  seenAt: string;
  devices: number;
}

interface Overview {
  people: number;
  admins: number;
  suspended: number;
  unconfirmed: number;
  newThisWeek: number;
  activeToday: number;
  onlineMinutes: number;
  online: OnlinePerson[];
}

interface PersonRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  emailVerified: boolean;
  createdAt: string;
  seenAt: string | null;
  online: boolean;
}

interface PeoplePage {
  people: PersonRow[];
  total: number;
  page: number;
  pages: number;
}

interface PersonDetails extends PersonRow {
  twoFactor: boolean;
  methods: string[];
  passkeys: number;
  lastLoginMethod: string | null;
  devices: { id: string; userAgent: string | null; signedInAt: string; expiresAt: string; seenAt: string | null; online: boolean }[];
  counts: { tasks: number; openTasks: number; lists: number; sharedOwned: number; sharedIn: number };
}

async function ask<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/api/admin/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(response.status === 404 ? "That account no longer exists, or you are no longer an admin." : "The server did not answer. Try again.");
  return (await response.json()) as T;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => DATE.format(new Date(iso));

/** "just now", "4 min ago", "3 h ago", "yesterday", then a date. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "Never";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "Yesterday";
  return DATE.format(new Date(iso));
}

const METHOD: Record<string, string> = { password: "Password", google: "Google", passkey: "Passkey", email: "Email and password", username: "Username and password" };

function status(p: PersonRow): string {
  if (p.banned) return `Suspended${p.banReason ? `: ${p.banReason}` : ""}`;
  return p.emailVerified ? "Active" : "Email not confirmed";
}

export function Admin() {
  const config = useAccountConfig();
  const session = authClient.useSession();
  if (config === null || (session.isPending && !session.data)) return null;
  const me = session.data?.user;
  // Not signed in, not an admin, or no accounts here: the same page as any address that doesn't exist.
  if (!config.accounts || !me || !isAdminRole(me.role)) return <NotFound />;
  return <Panel me={me} />;
}

function Panel({ me }: { me: SessionUser }) {
  usePageTitle("Admin");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [list, setList] = useState<PeoplePage | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([ask<Overview>("overview"), ask<PeoplePage>("people", { page, search, filter })]);
      setOverview(o);
      setList(p);
      setNow(Date.now());
    } catch (e) {
      setMessage({ error: (e as Error).message });
    }
  }, [page, search, filter]);

  // Fresh numbers when the page opens, every 30 seconds while it is on screen, and on coming back to it.
  useEffect(() => {
    void load();
    const tick = window.setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    const back = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", back);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);

  const stats: [string, number | undefined][] = [
    ["Accounts", overview?.people],
    ["Online now", overview?.online.length],
    ["Active today", overview?.activeToday],
    ["New this week", overview?.newThisWeek],
    ["Suspended", overview?.suspended],
  ];

  return (
    <div className="view view--wide admin">
      <header className="head">
        <h1 className="title">Admin</h1>
        <div className="head__tools">
          <button type="button" className="btn btn--quiet btn--small" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>
      <p className="auth__lead">Who has an account and who is here now. Admins never see anyone’s tasks.</p>

      <dl className="stats" aria-label="Summary">
        {stats.map(([label, value]) => (
          <div className="stats__item" key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "–"}</dd>
          </div>
        ))}
      </dl>

      <section className="section" aria-labelledby="online-title">
        <div className="section__head">
          <h2 className="section__title" id="online-title">
            Online now
          </h2>
          <p className="section__note">Used Listzero in the last {overview?.onlineMinutes ?? 3} minutes</p>
        </div>
        {overview && overview.online.length === 0 ? (
          <p className="hint">Nobody right now.</p>
        ) : (
          <ul className="online">
            {overview?.online.map((p) => (
              <li key={p.id}>
                <button type="button" className="online__person" onClick={() => setOpen(p.id)}>
                  <span className="online__name">
                    {p.name}
                    {p.id === me.id ? " (you)" : ""}
                  </span>
                  <span className="hint">{p.email}</span>
                  <span className="hint">
                    {ago(p.seenAt, now)}
                    {p.devices > 1 ? ` · ${p.devices} devices` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="people-title">
        <div className="section__head">
          <h2 className="section__title" id="people-title">
            People
          </h2>
          {list && (
            <p className="section__note">
              {list.total} {list.total === 1 ? "account" : "accounts"}
            </p>
          )}
        </div>
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
            Search by name, email or username
          </label>
          <input
            id="admin-search"
            className="field"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, email or username"
          />
          <button type="submit" className="btn btn--quiet">
            Search
          </button>
          <Picker
            label="Show"
            value={filter}
            options={[
              { value: "all", label: "Everyone" },
              { value: "online", label: "Online now" },
              { value: "admins", label: "Admins" },
              { value: "suspended", label: "Suspended" },
              { value: "unconfirmed", label: "Email not confirmed" },
            ]}
            onChange={(value) => {
              setPage(0);
              setFilter(value as Filter);
            }}
          />
        </form>
        <FormMessage {...message} />

        {/* Explicit roles keep this a table for screen readers when the phone layout changes its display. */}
        <div className="table-scroll table-scroll--people" role="region" aria-label="Accounts" tabIndex={0}>
          <table className="grid grid--people" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  Person
                </th>
                <th role="columnheader" scope="col">
                  Last seen
                </th>
                <th role="columnheader" scope="col">
                  Joined
                </th>
                <th role="columnheader" scope="col">
                  Role
                </th>
                <th role="columnheader" scope="col">
                  Status
                </th>
                <th role="columnheader" scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody role="rowgroup">
              {list?.people.map((person) => (
                <tr role="row" key={person.id}>
                  <th role="rowheader" scope="row">
                    {person.name}
                    {person.id === me.id ? " (you)" : ""}
                    <br />
                    <span className="hint">
                      {person.email}
                      {person.username ? ` · @${person.username}` : ""}
                    </span>
                  </th>
                  <td role="cell" data-label="Last seen" className="grid__date">
                    {person.online ? <span className="meta meta--doing">Online</span> : ago(person.seenAt, now)}
                  </td>
                  <td role="cell" data-label="Joined" className="grid__date">
                    {day(person.createdAt)}
                  </td>
                  <td role="cell" data-label="Role">
                    {isAdminRole(person.role) ? "Admin" : "User"}
                  </td>
                  <td role="cell" data-label="Status">
                    {status(person)}
                  </td>
                  <td role="cell">
                    <button
                      type="button"
                      className="btn btn--quiet btn--small"
                      aria-label={`Details for ${person.email}`}
                      onClick={() => setOpen(person.id)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
              {list?.people.length === 0 && (
                <tr role="row">
                  <td role="cell" colSpan={6}>
                    No accounts match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {list && list.pages > 1 && (
          <div className="setting__row">
            <button type="button" className="btn btn--quiet" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page + 1} of {list.pages}
            </span>
            <button type="button" className="btn btn--quiet" disabled={page + 1 >= list.pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </section>

      {open && (
        <Details
          userId={open}
          self={open === me.id}
          now={now}
          onClose={() => setOpen(null)}
          onChanged={(notice) => {
            setMessage({ notice });
            void load();
          }}
        />
      )}
    </div>
  );
}

type Pending = "ban" | "delete" | null;

function Details({
  userId,
  self,
  now,
  onClose,
  onChanged,
}: {
  userId: string;
  self: boolean;
  now: number;
  onClose(): void;
  onChanged(notice: string): void;
}) {
  const [person, setPerson] = useState<PersonDetails | null>(null);
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("0");

  const load = useCallback(async () => {
    try {
      setPerson(await ask<PersonDetails>("person", { userId }));
    } catch (e) {
      setMessage({ error: (e as Error).message });
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (work: () => Promise<{ error: { code?: string; message?: string; status?: number } | null }>, done: string) => {
    setMessage({});
    const { error } = await work();
    if (error) return setMessage({ error: authMessage(error) });
    setMessage({ notice: done });
    onChanged(done);
    void load();
  };

  const admin = person ? isAdminRole(person.role) : false;
  const rows: [string, string][] = person
    ? [
        ["Email", `${person.email}${person.emailVerified ? "" : " (not confirmed)"}`],
        ["Username", person.username ? `@${person.username}` : "None"],
        ["Role", admin ? "Admin" : "User"],
        ["Status", status(person) + (person.banned && person.banExpires ? `, until ${day(person.banExpires)}` : "")],
        ["Last seen", person.online ? "Online now" : ago(person.seenAt, now)],
        ["Joined", day(person.createdAt)],
        ["Signs in with", person.methods.map((m) => (m === "passkey" ? `Passkey (${person.passkeys})` : (METHOD[m] ?? m))).join(", ") || "Nothing yet"],
        ["Last sign-in", person.lastLoginMethod ? (METHOD[person.lastLoginMethod] ?? person.lastLoginMethod) : "Unknown"],
        ["Two-factor", person.twoFactor ? "On" : "Off"],
        ["Tasks", `${person.counts.openTasks} open, ${person.counts.tasks - person.counts.openTasks} done`],
        ["Lists", String(person.counts.lists)],
        ["Shared lists", `Owns ${person.counts.sharedOwned}, in ${person.counts.sharedIn} more`],
      ]
    : [];

  return (
    <>
      <Sheet
        title={person ? person.name : "Account"}
        onClose={onClose}
        footer={
          person && !self ? (
            <button type="button" className="btn btn--danger" onClick={() => setPending("delete")}>
              Delete account
            </button>
          ) : undefined
        }
      >
        {!person && !message.error && <p className="hint">Loading…</p>}
        <FormMessage {...message} />
        {person && (
          <>
            <dl className="facts">
              {rows.map(([label, value]) => (
                <div className="facts__row" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <h3 className="label">Signed-in devices</h3>
            {person.devices.length === 0 ? (
              <p className="hint">Signed out everywhere.</p>
            ) : (
              <ul className="devices">
                {person.devices.map((d) => (
                  <li key={d.id}>
                    <strong>{describeDevice(d.userAgent)}</strong>
                    {d.online && <span className="meta meta--doing">Online</span>}
                    <span className="hint">
                      Signed in {DATE_TIME.format(new Date(d.signedInAt))}
                      {d.seenAt && !d.online ? ` · last here ${ago(d.seenAt, now).toLowerCase()}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!self && (
              <>
                <h3 className="label">Actions</h3>
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
                        setPending("ban");
                      }}
                    >
                      Suspend
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    disabled={person.devices.length === 0}
                    onClick={() => void act(() => authClient.admin.revokeUserSessions({ userId: person.id }), `${person.name} was signed out everywhere.`)}
                  >
                    Sign out everywhere
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </Sheet>

      {pending === "ban" && person && (
        <Sheet
          title={`Suspend ${person.name}`}
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

      {pending === "delete" && person && (
        <Confirm
          title={`Delete ${person.email}?`}
          body="Their account, their tasks and the shared lists they own are deleted for good. This cannot be undone."
          confirmLabel="Delete account"
          onClose={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void (async () => {
              const { error } = await authClient.admin.removeUser({ userId: person.id });
              if (error) return setMessage({ error: authMessage(error) });
              onChanged(`${person.email} was deleted.`);
              onClose();
            })();
          }}
        />
      )}
    </>
  );
}
