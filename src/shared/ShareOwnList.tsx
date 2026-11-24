import { useState } from "react";
import { useNavigate } from "react-router";
import { useAccountConfig } from "../account/config";
import { Icon } from "../components/Icon";
import { Confirm } from "../components/Sheet";
import type { TaskList } from "../lib/types";
import { useStore } from "../state/store-context";
import { callShared, useSpace } from "./space";

/**
 * Share on one of the person's own lists. The list and its tasks move to Shared (shared lists are
 * kept apart from your own tasks), then the Share dialog opens to choose who sees it. Sharing needs
 * an account: a guest is offered the sign-in page instead.
 */
export function ShareOwnList({ list }: { list: TaskList }) {
  const store = useStore();
  const space = useSpace();
  const navigate = useNavigate();
  const accounts = useAccountConfig()?.accounts === true;
  const [asking, setAsking] = useState(false);
  if (!accounts) return null;

  const count = store.data.tasks.filter((t) => t.listId === list.id && t.completedAt === null).length;

  const share = async () => {
    const tasks = store.read().tasks.filter((t) => t.listId === list.id);
    try {
      const { listId } = await callShared<{ listId: string }>("create", { name: list.name, color: list.color, tasks });
      const data = store.read();
      store.load({ ...data, lists: data.lists.filter((l) => l.id !== list.id), tasks: data.tasks.filter((t) => t.listId !== list.id) });
      store.notify(`“${list.name}” is in Shared now.`);
      navigate(`/shared/${listId}?share`);
    } catch (error) {
      store.notify(error instanceof Error ? error.message : "That didn't work. Try again.");
    }
  };

  return (
    <>
      <button type="button" className="btn btn--quiet btn--small shared-chip" onClick={() => setAsking(true)} aria-haspopup="dialog">
        <Icon name="people" size={16} />
        Share
      </button>
      {asking &&
        (space ? (
          <Confirm
            title={`Share “${list.name}”?`}
            body={`It moves to Shared${count > 0 ? ` with its ${count} open ${count === 1 ? "task" : "tasks"}` : ""}, apart from your own tasks. Next, choose who can see it.`}
            confirmLabel="Move to Shared"
            onClose={() => setAsking(false)}
            onConfirm={() => void share()}
          />
        ) : (
          <Confirm
            title="Sharing needs an account"
            body="Sign in or create a free account, then share this list."
            confirmLabel="Sign in"
            onClose={() => setAsking(false)}
            onConfirm={() => navigate(`/sign-in?next=${encodeURIComponent(`/list/${list.id}`)}`)}
          />
        ))}
    </>
  );
}
