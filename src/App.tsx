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

// Accounts are optional, so nothing about them is in the main download.
const auth = () => import("./views/account/Auth");
const SignIn = lazyView(() => auth().then((m) => m.SignIn));
const SignUp = lazyView(() => auth().then((m) => m.SignUp));
const VerifyEmail = lazyView(() => auth().then((m) => m.VerifyEmail));
const ForgotPassword = lazyView(() => auth().then((m) => m.ForgotPassword));
const ResetPassword = lazyView(() => auth().then((m) => m.ResetPassword));
const TwoFactor = lazyView(() => auth().then((m) => m.TwoFactor));
const Account = lazyView(() => import("./views/account/Account").then((m) => m.Account));
const Admin = lazyView(() => import("./views/account/Admin").then((m) => m.Admin));

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
            <Route path="sign-in" element={<SignIn />} />
            <Route path="sign-up" element={<SignUp />} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="two-factor" element={<TwoFactor />} />
            <Route path="account" element={<Account />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
