import { useSearchParams } from "react-router";
import { TaskRows } from "../components/TaskRow";
import { searchTasks } from "../lib/store";
import { SharedResults, useSharedResults } from "../shared/SharedResults";
import { useStore } from "../state/store-context";
import { usePageTitle } from "../state/usePageTitle";

export function Search() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const results = searchTasks(store.data, query);
  const shared = useSharedResults(query);
  const found = results.length + shared.reduce((n, group) => n + group.tasks.length, 0);
  usePageTitle("Search");

  return (
    <div className="view">
      <header className="head">
        <h1 className="title">Search</h1>
      </header>
      <div className="search">
        <label className="sr-only" htmlFor="search-input">
          Search tasks
        </label>
        <input
          id="search-input"
          type="search"
          className="field"
          placeholder="Search names, notes, steps and lists"
          value={query}
          autoFocus
          autoComplete="off"
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("q", e.target.value);
            else next.delete("q");
            setParams(next, { replace: true });
          }}
        />
      </div>
      <p className="hint" role="status">
        {query.trim() === ""
          ? "Finished tasks are searched too."
          : `${found} ${found === 1 ? "task" : "tasks"} found.`}
      </p>
      {results.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <TaskRows tasks={results} />
        </div>
      )}
      {shared.length > 0 && (
        <section className="section" aria-labelledby="shared-results">
          <div className="section__head">
            <h2 className="section__title" id="shared-results">
              In shared lists
            </h2>
          </div>
          {shared.map((group) => (
            <SharedResults key={group.list.id} list={group.list} tasks={group.tasks} />
          ))}
        </section>
      )}
    </div>
  );
}
