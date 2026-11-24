import { useMemo } from "react";
import { useNavigate } from "react-router";
import { TaskRows } from "../components/TaskRow";
import { searchTasks } from "../lib/store";
import type { Task } from "../lib/types";
import { StoreContext, useStore } from "../state/store-context";
import { OpenTaskContext } from "../state/useOpenTask";
import { sharedStore } from "./sharedStore";
import { asTaskList, useSpace, type SharedList } from "./space";

/** Search results from shared lists, one group per list. Tasks there stay in their lists. */
export function useSharedResults(query: string): { list: SharedList; tasks: Task[] }[] {
  const personal = useStore();
  const space = useSpace();
  return useMemo(() => {
    if (!space || query.trim() === "") return [];
    return space.lists
      .map((list) => ({
        list,
        tasks: searchTasks(
          { ...personal.data, tasks: space.tasks.filter((t) => t.listId === list.id), lists: [asTaskList(list)] },
          query,
        ),
      }))
      .filter((group) => group.tasks.length > 0);
  }, [personal.data, space, query]);
}

/** One shared list's results. Ticking works here; opening a task takes you to its list. */
export function SharedResults({ list, tasks }: { list: SharedList; tasks: Task[] }) {
  const personal = useStore();
  const navigate = useNavigate();
  const space = useSpace();
  const store = useMemo(() => sharedStore(personal, list), [personal, list, space]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useMemo(
    () => (id: string) => navigate(`/shared/${list.id}?task=${id}`, { state: { sheet: true } }),
    [navigate, list.id],
  );
  return (
    <StoreContext.Provider value={store}>
      <OpenTaskContext.Provider value={open}>
        <TaskRows tasks={tasks} />
      </OpenTaskContext.Provider>
    </StoreContext.Provider>
  );
}
