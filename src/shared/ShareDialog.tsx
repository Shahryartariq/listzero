import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../components/Icon";
import { ListSheet } from "../components/ListSheet";
import { Picker } from "../components/Picker";
import { Confirm, Sheet } from "../components/Sheet";
import { useStore } from "../state/store-context";
import { callShared, type Person, type SharedList } from "./space";

const ROLE_NAME = { owner: "Owner", edit: "Can edit", view: "Can view" } as const;

/**
 * Sharing a list, the way Google Drive shares a file: add people by email with a role, change or
 * remove them, and choose who can join: only people added ("Restricted"), or anyone with the link.
 * People who aren't the owner see who is in the list and can leave it.
 */
export function ShareDialog({ list, onClose }: { list: SharedList; onClose(): void }) {
  const store = useStore();
  const navigate = useNavigate();
  const owner = list.role === "owner";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"edit" | "view">("edit");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "leave" | "delete" | { owner: Person }>(null);
  const [renaming, setRenaming] = useState(false);

  /** Runs one change; says what went wrong, if anything, in the dialog. */
  const act = async (action: string, body: Record<string, unknown>, done = "") => {
    setBusy(true);
    try {
      await callShared(action, { listId: list.id, ...body });
      setNote(done);
      return true;
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!to) return;
    if (await act("invite", { email: to, role }, `Invite sent to ${to}.`)) setEmail("");
  };

  const copy = async () => {
    if (!list.link) return;
    try {
      await navigator.clipboard.writeText(list.link);
      setNote("Link copied.");
    } catch {
      setNote(`Copy this link: ${list.link}`);
    }
  };

  return (
    <>
      <Sheet
        title={`Share “${list.name}”`}
        onClose={onClose}
        footer={
          <>
            {owner ? (
              <button type="button" className="btn btn--danger" onClick={() => setConfirm("delete")}>
                <Icon name="trash" size={18} />
                Delete list
              </button>
            ) : (
              <button type="button" className="btn btn--danger" onClick={() => setConfirm("leave")}>
                Leave list
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>
              Done
            </button>
          </>
        }
      >
        {owner && (
          <form className="share__add" onSubmit={send}>
            <label className="sr-only" htmlFor="share-email">
              Add people by email
            </label>
            <input
              id="share-email"
              className="field"
              type="email"
              autoComplete="off"
              placeholder="Add people by email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Picker
              label="Role for new people"
              value={role}
              options={[
                { value: "edit" as const, label: "Can edit" },
                { value: "view" as const, label: "Can view" },
              ]}
              onChange={(r) => setRole(r)}
            />
            <button type="submit" className="btn" disabled={busy || !email.trim()}>
              Send
            </button>
          </form>
        )}

        <p className="share__note" role="status">
          {note}
        </p>

        <h3 className="label share__heading">People with access</h3>
        <ul className="share__people">
          {list.people.map((p) => (
            <li key={p.id} className="share__person">
              <span className="share__avatar" aria-hidden="true">
                {(p.name || p.email).slice(0, 1).toUpperCase()}
              </span>
              <span className="share__who">
                <span className="share__name">{p.name || p.email}</span>
                <span className="share__email">{p.email}</span>
              </span>
              {owner && p.role !== "owner" ? (
                <Picker
                  label={`Access for ${p.name || p.email}`}
                  value={p.role}
                  options={[
                    { value: "edit", label: "Can edit" },
                    { value: "view", label: "Can view" },
                    { value: "owner", label: "Make owner" },
                    { value: "remove", label: "Remove access" },
                  ]}
                  onChange={(next) => {
                    if (next === "owner") setConfirm({ owner: p });
                    else if (next === "remove") void act("member", { userId: p.id, remove: true }, `${p.name || p.email} removed.`);
                    else void act("member", { userId: p.id, role: next });
                  }}
                />
              ) : (
                <span className="share__role">{ROLE_NAME[p.role]}</span>
              )}
            </li>
          ))}
          {list.invited.map((i) => (
            <li key={i.email} className="share__person">
              <span className="share__avatar" aria-hidden="true">
                {i.email.slice(0, 1).toUpperCase()}
              </span>
              <span className="share__who">
                <span className="share__name">{i.email}</span>
                <span className="share__email">Invited · {ROLE_NAME[i.role]}</span>
              </span>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => void act("member", { email: i.email }, "Invite cancelled.")}>
                Cancel invite
              </button>
            </li>
          ))}
        </ul>

        {owner && (
          <>
            <h3 className="label share__heading">General access</h3>
            <div className="share__access">
              <span className="share__access-icon" aria-hidden="true">
                <Icon name={list.access === "link" ? "link" : "lock"} size={18} />
              </span>
              <div className="share__access-text">
                <Picker
                  label="General access"
                  value={list.access}
                  options={[
                    { value: "restricted", label: "Restricted" },
                    { value: "link", label: "Anyone with the link" },
                  ]}
                  onChange={(access) => void act("update", { access })}
                />
                <span className="hint">
                  {list.access === "link" ? "Anyone signed in with the link can join." : "Only people added can open it."}
                </span>
              </div>
              {list.access === "link" && (
                <Picker
                  label="Role for people with the link"
                  value={list.linkRole}
                  options={[
                    { value: "edit", label: "Can edit" },
                    { value: "view", label: "Can view" },
                  ]}
                  onChange={(linkRole) => void act("update", { linkRole })}
                />
              )}
            </div>
            {list.access === "link" && (
              <div className="share__link">
                <button type="button" className="btn btn--quiet" onClick={() => void copy()}>
                  <Icon name="link" size={18} />
                  Copy link
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => void act("update", { newLink: true }, "New link made. The old one no longer works.")}>
                  New link
                </button>
              </div>
            )}
            <button type="button" className="btn btn--ghost btn--small share__rename" onClick={() => setRenaming(true)}>
              Rename or recolour
            </button>
          </>
        )}
      </Sheet>

      {confirm === "leave" && (
        <Confirm
          title={`Leave “${list.name}”?`}
          body="It leaves your sidebar. The others keep it, and someone can add you again."
          confirmLabel="Leave list"
          onClose={() => setConfirm(null)}
          onConfirm={() => void act("leave", {}).then((ok) => ok && navigate("/today"))}
        />
      )}
      {confirm === "delete" && (
        <Confirm
          title={`Delete “${list.name}” for everyone?`}
          body={
            list.people.length > 1
              ? `${list.people
                  .filter((p) => p.role !== "owner")
                  .map((p) => p.name || p.email)
                  .join(", ")} will lose it too, with all its tasks.`
              : "Its tasks are deleted too."
          }
          confirmLabel="Delete for everyone"
          onClose={() => setConfirm(null)}
          onConfirm={() => void act("delete", {}).then((ok) => ok && navigate("/today"))}
        />
      )}
      {confirm && typeof confirm === "object" && (
        <Confirm
          title={`Make ${confirm.owner.name || confirm.owner.email} the owner?`}
          body="They'll manage sharing and can delete the list. You'll still be able to edit it."
          confirmLabel="Make owner"
          onClose={() => setConfirm(null)}
          onConfirm={() => void act("member", { userId: confirm.owner.id, role: "owner" })}
        />
      )}
      {renaming && (
        <ListSheet
          list={{ id: list.id, name: list.name, color: list.color, createdAt: 0 }}
          taken={[]}
          onClose={() => setRenaming(false)}
          onSave={(name, color) => store.updateList(list.id, { name, color })}
        />
      )}
    </>
  );
}
