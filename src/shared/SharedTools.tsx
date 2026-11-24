import { Icon } from "../components/Icon";
import type { SharedList } from "./space";

/** A shared list's header: who it is shared with. (Sharing itself opens from here.) */
export function SharedTools({ list }: { list: SharedList }) {
  const others = list.people.length - 1;
  return (
    <span className="shared-chip" title={list.people.map((p) => p.name || p.email).join(", ")}>
      <Icon name="people" size={16} />
      {others > 0 ? `You and ${others} ${others === 1 ? "other" : "others"}` : "Only you"}
    </span>
  );
}
