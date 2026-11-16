import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Shell } from "./components/Shell";
import { StoreProvider } from "./state/StoreProvider";
import { About } from "./views/About";
import { Inbox, ListView, Upcoming } from "./views/Lists";
import { Menu, NotFound } from "./views/Menu";
import { Today } from "./views/Today";

// The views most visits never open are loaded when asked for (and fetched ahead in idle time,
// see main.tsx), so the first screen downloads and parses less. "How it works" stays in the main
// download: it is a page people and search engines land on directly, and its text is the first paint.
const Board = lazy(() => import("./views/Board").then((m) => ({ default: m.Board })));
const Done = lazy(() => import("./views/Done").then((m) => ({ default: m.Done })));
const Focus = lazy(() => import("./views/Focus").then((m) => ({ default: m.Focus })));
const Search = lazy(() => import("./views/Search").then((m) => ({ default: m.Search })));
const Settings = lazy(() => import("./views/Settings").then((m) => ({ default: m.Settings })));

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
