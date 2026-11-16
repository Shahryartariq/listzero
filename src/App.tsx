import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Shell } from "./components/Shell";
import { StoreProvider } from "./state/StoreProvider";
import { About, Menu, NotFound } from "./views/About";
import { Board } from "./views/Board";
import { Done } from "./views/Done";
import { Focus } from "./views/Focus";
import { Inbox, ListView, Upcoming } from "./views/Lists";
import { Search } from "./views/Search";
import { Settings } from "./views/Settings";
import { Today } from "./views/Today";

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
