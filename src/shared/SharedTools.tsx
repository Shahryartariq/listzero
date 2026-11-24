import { useState } from "react";
import { useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { ShareDialog } from "./ShareDialog";
import type { SharedList } from "./space";

/** A shared list's header: who it's shared with, and the Share dialog behind it. */
export function SharedTools({ list }: { list: SharedList }) {
  const [params, setParams] = useSearchParams();
  // A list that has just been shared opens with the dialog (`?share`), so the next step is in view.
  const [open, setOpen] = useState(params.has("share"));
  const others = list.people.length - 1;
  const close = () => {
    setOpen(false);
    if (params.has("share")) setParams({}, { replace: true });
  };
  return (
    <>
      <button
        type="button"
        className="btn btn--quiet btn--small shared-chip"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title={list.people.map((p) => p.name || p.email).join(", ")}
      >
        <Icon name="people" size={16} />
        {list.role === "owner" ? "Share" : others > 0 ? `You and ${others} ${others === 1 ? "other" : "others"}` : "Only you"}
      </button>
      {open && <ShareDialog list={list} onClose={close} />}
    </>
  );
}
