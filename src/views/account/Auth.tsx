/**
 * The screens for getting into an account: sign in, create one, confirm the email,
 * reset a forgotten password, and the two-factor code.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { authClient } from "../../account/client";
import { useAccountConfig } from "../../account/config";
import { authMessage, checkEmail, checkPassword, checkUsername, oauthMessage, safeNext } from "../../account/messages";
import { isAdminRole, mayAdmin } from "../../account/roles";
import { FormMessage, GoogleMark, PasswordField, TextField } from "../../account/ui";
import { Icon } from "../../components/Icon";
import { usePageTitle } from "../../state/usePageTitle";

/** Where to go once signed in. Kept for the two-factor step, which arrives by a fresh page load. */
const NEXT_KEY = "listzero:after-sign-in";
const rememberNext = (next: string) => {
  try {
    sessionStorage.setItem(NEXT_KEY, next);
  } catch {
    /* falls back to Today */
  }
};
const recallNext = () => {
  try {
    return safeNext(sessionStorage.getItem(NEXT_KEY));
  } catch {
    return "/today";
  }
};

/** The address in a verification email comes back to this page, which then moves on to `next`. */
const landing = (next: string) => `/verify-email?next=${encodeURIComponent(next)}`;

function AuthPage({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="view auth">
      <header className="head">
        <h1 className="title">{title}</h1>
      </header>
      {lead && <p className="auth__lead">{lead}</p>}
      {children}
    </div>
  );
}

/** Accounts are off on this copy, or the answer is not in yet. */
function useGate(): "loading" | "off" | "on" {
  const config = useAccountConfig();
  return config === null ? "loading" : config.accounts ? "on" : "off";
}

function Unavailable() {
  usePageTitle("Accounts are not available");
  return (
    <div className="view">
      <div className="empty" style={{ paddingTop: 0 }}>
        <h1 className="empty__title">Accounts are not available here.</h1>
        <p>This copy of Listzero keeps tasks in the browser only. Everything else works as usual.</p>
        <div className="empty__actions">
          <Link to="/today" className="btn">
            Go to Today
          </Link>
        </div>
      </div>
    </div>
  );
}

function GoogleButton({ next, label }: { next: string; label: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn--quiet auth__wide"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const { error: failed } = await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/sign-in" });
          if (failed) {
            setError(authMessage(failed));
            setBusy(false);
          }
        }}
      >
        <GoogleMark />
        {label}
      </button>
      <FormMessage error={error} />
    </>
  );
}

const Divider = () => (
  <p className="auth__or">
    <span>or</span>
  </p>
);

/**
 * /admin/login, the way into the admin panel. Nothing links to it. With Google sign-in on (as in
 * production), the admin signs in with Google and nothing else: the server opens the admin tools
 * only to a Google session, so a Listzero password never opens them. Without Google (a local copy),
 * the usual sign-in form. Once signed in, an admin goes on to the panel; anyone else is told no.
 */
export function AdminSignIn() {
  const session = authClient.useSession();
  const gate = useGate();
  const config = useAccountConfig();
  if (gate !== "on" || !config) return <SignIn admin />;
  const data = session.data;
  if (mayAdmin(data, config.google)) return <Navigate to="/admin" replace />;
  if (data && !isAdminRole(data.user.role)) return <NotAnAdmin email={data.user.email} />;
  if (config.google) return <AdminWithGoogle again={Boolean(data)} />;
  return <SignIn admin />;
}

/** Google only: the admin account is guarded by Google's own sign-in and two-step verification. */
function AdminWithGoogle({ again }: { again: boolean }) {
  usePageTitle("Admin sign-in");
  return (
    <AuthPage
      title="Admin sign-in"
      lead={
        again
          ? "The admin panel opens only when you sign in with Google. Sign in with Google to continue."
          : "Sign in with the Google account that runs Listzero."
      }
    >
      <GoogleButton next="/admin/login" label="Continue with Google" />
    </AuthPage>
  );
}

function NotAnAdmin({ email }: { email: string }) {
  usePageTitle("Admin sign-in");
  return (
    <AuthPage title="Not an admin account" lead={`You are signed in as ${email}, which can't open the admin panel.`}>
      <p>To use an admin account, sign out from Account first, then come back here.</p>
      <div className="setting__row">
        <Link to="/account" className="btn">
          Go to Account
        </Link>
        <Link to="/today" className="btn btn--quiet">
          Go to Today
        </Link>
      </div>
    </AuthPage>
  );
}

export function SignIn({ admin = false }: { admin?: boolean }) {
  usePageTitle(admin ? "Admin sign-in" : "Sign in");
  const gate = useGate();
  const config = useAccountConfig();
  const [params] = useSearchParams();
  // An admin comes back to /admin/login, which sends them on to the panel (or says it can't).
  const next = admin ? "/admin/login" : safeNext(params.get("next"));
  const navigate = useNavigate();
  const session = authClient.useSession();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(oauthMessage(params.get("error")));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // A saved passkey is offered in the browser's own autofill, where the browser supports that.
  const offered = useRef(false);
  useEffect(() => {
    if (gate !== "on" || offered.current) return;
    offered.current = true;
    void (async () => {
      const supported = await window.PublicKeyCredential?.isConditionalMediationAvailable?.().catch(() => false);
      if (!supported) return;
      void authClient.signIn.passkey({ autoFill: true, fetchOptions: { onSuccess: () => void navigate(next, { replace: true }) } });
    })();
  }, [gate, navigate, next]);

  if (gate === "loading") return null;
  if (gate === "off") return <Unavailable />;
  if (session.data) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const name = identifier.trim();
    if (!name || !password) return setError("Enter your email or username, and your password.");
    setBusy(true);
    rememberNext(next);
    const result = name.includes("@")
      ? await authClient.signIn.email({ email: name, password, callbackURL: landing(next) })
      : await authClient.signIn.username({ username: name, password, callbackURL: landing(next) });
    setBusy(false);
    if (result.error) {
      if (result.error.code === "EMAIL_NOT_VERIFIED") return setNotice(authMessage(result.error));
      return setError(authMessage(result.error));
    }
    // A full page load follows (to the landing page, or to the two-factor step).
  };

  const usePasskey = async () => {
    setError("");
    let result = await authClient.signIn.passkey();
    // The autofill request above can use up the challenge; one retry gets a fresh one.
    if (result.error && "code" in result.error && result.error.code === "CHALLENGE_NOT_FOUND") {
      result = await authClient.signIn.passkey();
    }
    if (result.error) {
      // Closing the browser's passkey sheet is not an error worth showing.
      const message = result.error.message ?? "";
      if (!/cancel|abort|not allowed|timed out/i.test(message)) setError(authMessage(result.error));
      return;
    }
    void navigate(next, { replace: true });
  };

  return (
    <AuthPage
      title={admin ? "Admin sign-in" : "Sign in"}
      lead={admin ? "For Listzero admins." : "Signing in backs up your tasks and keeps them the same on all your devices."}
    >
      {config?.google && (
        <>
          <GoogleButton next={next} label="Continue with Google" />
          <Divider />
        </>
      )}
      <form className="form" onSubmit={submit} noValidate>
        <TextField
          label="Email or username"
          value={identifier}
          onChange={setIdentifier}
          autoComplete="username webauthn"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <FormMessage error={error} notice={notice} />
        <button type="submit" className="btn auth__wide" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button type="button" className="btn btn--quiet auth__wide" onClick={usePasskey}>
        <Icon name="key" size={20} />
        Sign in with a passkey
      </button>
      {admin ? (
        <p className="auth__links">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      ) : (
        <>
          <p className="auth__links">
            <Link to="/forgot-password">Forgot your password?</Link>
            <Link to={next === "/today" ? "/sign-up" : `/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link>
          </p>
          <p className="hint">You do not need an account to use Listzero. Without one, tasks stay in this browser.</p>
        </>
      )}
    </AuthPage>
  );
}

function CheckYourEmail({ email, next }: { email: string; next: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState("");
  return (
    <AuthPage title="Check your email">
      <p className="auth__lead">
        We sent a link to <strong>{email}</strong>. Open it to confirm the address and finish making your account. It works
        for 1 hour.
      </p>
      <p className="hint">Nothing there after a minute? Look in spam, or send it again.</p>
      <div className="note__actions">
        <button
          type="button"
          className="btn btn--quiet"
          disabled={state === "sending"}
          onClick={async () => {
            setState("sending");
            const { error } = await authClient.sendVerificationEmail({ email, callbackURL: landing(next) });
            setState(error ? "failed" : "sent");
            setMessage(error ? authMessage(error) : "Sent again.");
          }}
        >
          {state === "sending" ? "Sending…" : "Send the link again"}
        </button>
        <Link to="/sign-in" className="btn btn--quiet">
          Back to sign in
        </Link>
      </div>
      <FormMessage error={state === "failed" ? message : ""} notice={state === "sent" ? message : ""} />
    </AuthPage>
  );
}

export function SignUp() {
  usePageTitle("Create an account");
  const gate = useGate();
  const config = useAccountConfig();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const session = authClient.useSession();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; username?: string; password?: string; form?: string }>({});
  // Editing a field clears what was said about it, so an old error never sits under a fixed value.
  const edited =
    (field: "email" | "username" | "password", set: (value: string) => void) =>
    (value: string) => {
      set(value);
      setErrors((current) => (current[field] || current.form ? { ...current, [field]: undefined, form: undefined } : current));
    };
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");

  if (gate === "loading") return null;
  if (gate === "off") return <Unavailable />;
  if (session.data) return <Navigate to={next} replace />;
  if (sentTo) return <CheckYourEmail email={sentTo} next={next} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = { email: checkEmail(email), username: checkUsername(username), password: checkPassword(password) };
    setErrors(found);
    if (found.email || found.username || found.password) return;
    setBusy(true);
    const { error } = await authClient.signUp.email({
      email: email.trim(),
      username: username.trim(),
      // The name shown in the app starts as the username and can be changed under Account.
      name: username.trim(),
      password,
      callbackURL: landing(next),
    });
    setBusy(false);
    if (error) {
      const message = authMessage(error);
      if (error.code?.startsWith("USERNAME") || error.code === "INVALID_USERNAME") return setErrors({ username: message });
      if (error.code?.startsWith("PASSWORD")) return setErrors({ password: message });
      if (error.code?.startsWith("USER_ALREADY")) return setErrors({ email: message });
      return setErrors({ form: message });
    }
    if (config?.emailVerification) setSentTo(email.trim());
    // Otherwise the session is live and the redirect above takes over on the next render.
  };

  return (
    <AuthPage title="Create an account" lead="Free. Your tasks on this device are added to the account when you sign in.">
      {config?.google && (
        <>
          <GoogleButton next={next} label="Sign up with Google" />
          <Divider />
        </>
      )}
      <form className="form" onSubmit={submit} noValidate>
        <TextField label="Email" type="email" value={email} onChange={edited("email", setEmail)} error={errors.email} autoComplete="email" inputMode="email" required />
        <TextField
          label="Username"
          value={username}
          onChange={edited("username", setUsername)}
          error={errors.username}
          hint="You can sign in with this instead of your email. 3 to 30 letters, numbers, dots, dashes or underscores."
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={30}
          required
        />
        <PasswordField label="Password" value={password} onChange={edited("password", setPassword)} error={errors.password} autoComplete="new-password" meter hint="At least 8 characters. A few random words work well." />
        <FormMessage error={errors.form} />
        <button type="submit" className="btn auth__wide" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="auth__links">
        <Link to={next === "/today" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`}>I already have an account</Link>
        <Link to="/about#privacy">What is stored</Link>
      </p>
    </AuthPage>
  );
}

/** Where the link in a "confirm your email" message lands, and where a successful sign-in passes through. */
export function VerifyEmail() {
  usePageTitle("Confirm your email");
  const gate = useGate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const failed = params.get("error");
  const session = authClient.useSession();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});

  if (gate === "loading" || session.isPending) return null;
  if (gate === "off") return <Unavailable />;
  if (session.data && !failed) return <Navigate to={next} replace />;

  if (failed) {
    return (
      <AuthPage title="That link did not work" lead="It may have run out of time, or been used already. Enter your email and we will send a new one.">
        <form
          className="form"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const problem = checkEmail(email);
            if (problem) return setMessage({ error: problem });
            const { error } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: landing(next) });
            // The same words whether or not the address has an account.
            setMessage(error && error.status === 429 ? { error: authMessage(error) } : { notice: "If that address has an account waiting, a new link is on its way." });
          }}
        >
          <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
          <FormMessage {...message} />
          <button type="submit" className="btn auth__wide">
            Send a new link
          </button>
        </form>
        <p className="auth__links">
          <Link to="/sign-in">Back to sign in</Link>
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Confirm your email" lead="Open the link we emailed you to finish making your account.">
      <p className="auth__links">
        <Link to="/sign-in">Back to sign in</Link>
      </p>
    </AuthPage>
  );
}

export function ForgotPassword() {
  usePageTitle("Reset your password");
  const gate = useGate();
  const config = useAccountConfig();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const [busy, setBusy] = useState(false);

  if (gate === "loading") return null;
  if (gate === "off") return <Unavailable />;

  if (!config?.email) {
    return (
      <AuthPage title="Reset your password" lead="This copy of Listzero cannot send email yet, so passwords cannot be reset here.">
        <p className="auth__links">
          <Link to="/sign-in">Back to sign in</Link>
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Reset your password" lead="Enter the email of your account. We will send a link to choose a new password.">
      <form
        className="form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const problem = checkEmail(email);
          if (problem) return setMessage({ error: problem });
          setBusy(true);
          const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
          setBusy(false);
          // The same words whether or not the address has an account, so nobody can use this to find out.
          setMessage(error && error.status === 429 ? { error: authMessage(error) } : { notice: "If that address has an account, a link is on its way. It works for 1 hour." });
        }}
      >
        <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" required />
        <FormMessage {...message} />
        <button type="submit" className="btn auth__wide" disabled={busy}>
          {busy ? "Sending…" : "Send the link"}
        </button>
      </form>
      <p className="auth__links">
        <Link to="/sign-in">Back to sign in</Link>
      </p>
    </AuthPage>
  );
}

export function ResetPassword() {
  usePageTitle("Choose a new password");
  const gate = useGate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (gate === "loading") return null;
  if (gate === "off") return <Unavailable />;

  if (done) {
    return (
      <AuthPage title="Password changed" lead="Every device was signed out. Sign in with your new password.">
        <Link to="/sign-in" className="btn auth__wide">
          Sign in
        </Link>
      </AuthPage>
    );
  }

  if (!token || params.get("error")) {
    return (
      <AuthPage title="That link did not work" lead="It may have run out of time, or been used already.">
        <Link to="/forgot-password" className="btn auth__wide">
          Ask for a new link
        </Link>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Choose a new password">
      <form
        className="form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const problem = checkPassword(password);
          if (problem) return setError(problem);
          setBusy(true);
          const { error: failed } = await authClient.resetPassword({ newPassword: password, token });
          setBusy(false);
          if (failed) return setError(authMessage(failed));
          setDone(true);
        }}
      >
        <PasswordField
          label="New password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            setError("");
          }}
          error={error}
          autoComplete="new-password"
          meter
        />
        <button type="submit" className="btn auth__wide" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthPage>
  );
}

/** The second step of signing in for accounts with two-factor on. */
export function TwoFactor() {
  usePageTitle("Two-factor code");
  const gate = useGate();
  const navigate = useNavigate();
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (gate === "loading") return null;
  if (gate === "off") return <Unavailable />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const value = code.trim();
    if (!backup && !/^\d{6}$/.test(value)) return setError("Enter the 6-digit code from your authenticator app.");
    if (backup && value.length < 6) return setError("Enter one of your backup codes.");
    setBusy(true);
    const result = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trust })
      : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust });
    setBusy(false);
    if (result.error) return setError(authMessage(result.error));
    void navigate(recallNext(), { replace: true });
  };

  return (
    <AuthPage title="Two-factor code" lead={backup ? "Enter one of the backup codes you saved. Each works once." : "Enter the 6-digit code from your authenticator app."}>
      <form className="form" onSubmit={submit} noValidate>
        <TextField
          key={backup ? "backup" : "code"}
          label={backup ? "Backup code" : "Code"}
          value={code}
          onChange={setCode}
          error={error}
          autoComplete="one-time-code"
          inputMode={backup ? "text" : "numeric"}
          maxLength={backup ? 20 : 6}
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
        />
        <label className="form__check">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
          Do not ask again on this device for 30 days
        </label>
        <button type="submit" className="btn auth__wide" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
      <p className="auth__links">
        <button
          type="button"
          className="link"
          onClick={() => {
            setBackup((v) => !v);
            setCode("");
            setError("");
          }}
        >
          {backup ? "Use the authenticator app instead" : "Use a backup code instead"}
        </button>
        <Link to="/sign-in">Start again</Link>
      </p>
    </AuthPage>
  );
}
