import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Shell } from "./components/Shell";
import { lazyView } from "./lib/lazyView";
import { StoreProvider } from "./state/StoreProvider";
import { About } from "./views/About";
import { Inbox, ListView, Upcoming } from "./views/Lists";
import { Menu, NotFound } from "./views/Menu";
import { Today } from "./views/Today";

// The views most visits never open are loaded when asked for (and fetched ahead in idle time,
// see main.tsx), so the first screen downloads and parses less. "How it works" stays in the main
// download: it is a page people and search engines land on directly, and its text is the first paint.
const Board = lazyView(() => import("./views/Board").then((m) => m.Board));
const Done = lazyView(() => import("./views/Done").then((m) => m.Done));
const Focus = lazyView(() => import("./views/Focus").then((m) => m.Focus));
const Search = lazyView(() => import("./views/Search").then((m) => m.Search));
const Settings = lazyView(() => import("./views/Settings").then((m) => m.Settings));

export function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="today" element={<Today />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="upcoming" element={<Upcoming />} />
            <Route path="board" element={<Board />} />
            <Route path="list/:listId" element={<ListView />} />
            <Route path="done" element={<Done />} />
            <Route path="focus" element={<Focus />} />
            <Route path="search" element={<Search />} />
            <Route path="settings" element={<Settings />} />
            <Route path="about" element={<About />} />
            <Route path="menu" element={<Menu />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
