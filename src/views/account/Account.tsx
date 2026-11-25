/** The Account page: who is signed in, how sync is doing, and every way of signing in they have set up. */
import qrcode from "qrcode-generator";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { authClient, type SessionUser } from "../../account/client";
import { useAccountConfig, type AccountConfig } from "../../account/config";
import { authMessage, checkPassword, checkUsername } from "../../account/messages";
import { SignOutSheet, syncLabel } from "../../account/parts";
import { CannotReach, FormMessage, GoogleMark, PasswordField, TextField } from "../../account/ui";
import { Confirm } from "../../components/Sheet";
import { describeDevice } from "../../account/devices";
import { isAdminRole } from "../../account/roles";
import { downloadText } from "../../lib/download";
import { useSpace } from "../../shared/space";
import { useStore } from "../../state/store-context";
import { usePageTitle } from "../../state/usePageTitle";
import { requestSync, useSyncStatus } from "../../sync/status";

type Message = { error?: string; notice?: string };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="setting" aria-label={title}>
      <h2 className="setting__name">{title}</h2>
      {children}
    </section>
  );
}

const when = (value: string | Date | null | undefined) =>
  value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";

function SyncSection() {
  const status = useSyncStatus();
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Sync">
      <p role="status">
        <span className="sync-dot" data-phase={status.phase} aria-hidden="true" /> {syncLabel(status)}
        {status.phase === "synced" && status.at ? `, ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(status.at)}` : ""}
      </p>
      <p className="hint">
        Tasks and lists sync between your devices. Changes made offline are kept and sent later. Appearance and other
        settings stay on each device.
      </p>
      <div className="setting__row">
        <button
          type="button"
          className="btn btn--quiet"
          disabled={busy || status.phase === "syncing"}
          onClick={async () => {
            setBusy(true);
            await requestSync();
            setBusy(false);
          }}
        >
          Sync now
        </button>
      </div>
    </Section>
  );
}

function ProfileSection({ user }: { user: SessionUser }) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.displayUsername ?? user.username ?? "");
  const [message, setMessage] = useState<Message>({});
  const [busy, setBusy] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage({});
    setUsernameError("");
    const cleanName = name.trim();
    const cleanUsername = username.trim();
    if (!cleanName) return setMessage({ error: "Enter a name." });
    if (cleanUsername && checkUsername(cleanUsername)) return setUsernameError(checkUsername(cleanUsername));
    setBusy(true);
    const changed = cleanUsername && cleanUsername.toLowerCase() !== (user.username ?? "");
    const { error } = await authClient.updateUser({ name: cleanName.slice(0, 80), ...(changed ? { username: cleanUsername } : {}) });
    setBusy(false);
    if (error) {
      if (error.code?.includes("USERNAME")) return setUsernameError(authMessage(error));
      return setMessage({ error: authMessage(error) });
    }
    setMessage({ notice: "Saved." });
  };

  return (
    <Section title="Profile">
      <form className="form" onSubmit={submit} noValidate>
        <TextField label="Name" value={name} onChange={setName} autoComplete="name" maxLength={80} required />
        <TextField
          label="Username"
          value={username}
          onChange={setUsername}
          error={usernameError}
          hint={user.username ? "You can sign in with this instead of your email." : "Optional. Add one to sign in with it instead of your email."}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={30}
        />
        <p className="hint">
          Email: <strong>{user.email}</strong> {user.emailVerified ? "(confirmed)" : "(not confirmed yet)"}
        </p>
        <FormMessage {...message} />
        <div className="setting__row">
          <button type="submit" className="btn btn--quiet" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </Section>
  );
}

/** Adds a password to an account that signs in with Google. Everyone stays signed in. */
async function addPassword(newPassword: string): Promise<{ error?: string }> {
  try {
    const response = await fetch("/api/account/set-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ newPassword }),
    });
    if (response.ok) return {};
    const detail = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
    return { error: authMessage({ status: response.status, code: detail?.code, message: detail?.message }) };
  } catch {
    return { error: "You are offline. Connect to the internet and try again." };
  }
}

function PasswordSection({ user, hasPassword, onAdded }: { user: SessionUser; hasPassword: boolean; onAdded(): void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [others, setOthers] = useState(true);
  const [message, setMessage] = useState<Message>({});
  const [busy, setBusy] = useState(false);

  if (!hasPassword) {
    const add = async (e: FormEvent) => {
      e.preventDefault();
      setMessage({});
      const problem = checkPassword(next);
      if (problem) return setMessage({ error: problem });
      setBusy(true);
      const { error } = await addPassword(next);
      setBusy(false);
      if (error) return setMessage({ error });
      setNext("");
      setMessage({ notice: `Password added. You can also sign in with ${user.email} and this password.` });
      onAdded();
    };
    return (
      <Section title="Password">
        <p>You sign in with Google and have no password here. Add one to also sign in with your email.</p>
        <form className="form" onSubmit={add} noValidate>
          <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" meter />
          <FormMessage {...message} />
          <div className="setting__row">
            <button type="submit" className="btn btn--quiet" disabled={busy}>
              {busy ? "Adding…" : "Add password"}
            </button>
          </div>
        </form>
      </Section>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage({});
    if (!current) return setMessage({ error: "Enter your current password." });
    const problem = checkPassword(next);
    if (problem) return setMessage({ error: problem });
    if (next === current) return setMessage({ error: "Choose a password different from your current one." });
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: others });
    setBusy(false);
    if (error) return setMessage({ error: authMessage(error) });
    setCurrent("");
    setNext("");
    setMessage({ notice: others ? "Password changed. Your other devices were signed out." : "Password changed." });
  };

  return (
    <Section title="Password">
      <form className="form" onSubmit={submit} noValidate>
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" meter />
        <label className="form__check">
          <input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} />
          Sign out my other devices
        </label>
        <FormMessage {...message} />
        <div className="setting__row">
          <button type="submit" className="btn btn--quiet" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </Section>
  );
}

/** A QR code drawn as plain SVG, so no image has to come from anywhere. */
function QrCode({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(text);
    code.make();
    const count = code.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (code.isDark(row, col)) d += `M${col + 2},${row + 2}h1v1h-1z`;
      }
    }
    return { size: count + 4, path: d };
  }, [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const store = useStore();
  return (
    <>
      <p>
        <strong>Save these backup codes.</strong> Each one works once, for when you do not have your phone. They are shown
        only now.
      </p>
      <ul className="codes" aria-label="Backup codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <div className="setting__row">
        <button
          type="button"
          className="btn btn--quiet"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              store.notify("Backup codes copied.");
            } catch {
              store.notify("Could not copy. Select the codes and copy them by hand.");
            }
          }}
        >
          Copy
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => downloadText("listzero-backup-codes.txt", `Listzero backup codes\n\n${codes.join("\n")}\n`, "text/plain")}>
          Download
        </button>
      </div>
    </>
  );
}

type TwoFactorStep =
  | { kind: "idle" }
  | { kind: "password"; then: "enable" | "disable" | "codes" }
  | { kind: "scan"; uri: string; codes: string[] }
  | { kind: "codes"; codes: string[] };

function TwoFactorSection({ user, hasPassword }: { user: SessionUser; hasPassword: boolean }) {
  const enabled = user.twoFactorEnabled === true;
  const [step, setStep] = useState<TwoFactorStep>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<Message>({});
  const [busy, setBusy] = useState(false);

  if (!hasPassword) {
    return (
      <Section title="Two-factor sign-in">
        <p className="hint">Google already protects how you sign in. Add a password first to turn on two-factor codes here.</p>
      </Section>
    );
  }

  const withPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== "password") return;
    if (!password) return setMessage({ error: "Enter your password." });
    setBusy(true);
    setMessage({});
    if (step.then === "enable") {
      const { data, error } = await authClient.twoFactor.enable({ password, issuer: "Listzero" });
      setBusy(false);
      if (error || !data || data.method !== "totp") return setMessage({ error: authMessage(error) });
      setPassword("");
      return setStep({ kind: "scan", uri: data.totpURI, codes: data.backupCodes });
    }
    if (step.then === "disable") {
      const { error } = await authClient.twoFactor.disable({ password });
      setBusy(false);
      if (error) return setMessage({ error: authMessage(error) });
      setPassword("");
      setStep({ kind: "idle" });
      return setMessage({ notice: "Two-factor sign-in is off." });
    }
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    setBusy(false);
    if (error || !data) return setMessage({ error: authMessage(error) });
    setPassword("");
    setStep({ kind: "codes", codes: data.backupCodes });
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== "scan") return;
    if (!/^\d{6}$/.test(code.trim())) return setMessage({ error: "Enter the 6-digit code from your authenticator app." });
    setBusy(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setBusy(false);
    if (error) return setMessage({ error: authMessage(error) });
    setCode("");
    setMessage({ notice: "Two-factor sign-in is on." });
    setStep({ kind: "codes", codes: step.codes });
  };

  const secret = step.kind === "scan" ? (new URL(step.uri).searchParams.get("secret") ?? "") : "";

  return (
    <Section title="Two-factor sign-in">
      {step.kind === "idle" && (
        <>
          <p>
            {enabled
              ? "On. Signing in asks for a code from your authenticator app after your password."
              : "Off. Turn it on to ask for a code from an authenticator app after your password."}
          </p>
          <div className="setting__row">
            {enabled ? (
              <>
                <button type="button" className="btn btn--quiet" onClick={() => setStep({ kind: "password", then: "codes" })}>
                  New backup codes
                </button>
                <button type="button" className="btn btn--quiet" onClick={() => setStep({ kind: "password", then: "disable" })}>
                  Turn off
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--quiet" onClick={() => setStep({ kind: "password", then: "enable" })}>
                Turn on two-factor
              </button>
            )}
          </div>
        </>
      )}

      {step.kind === "password" && (
        <form className="form" onSubmit={withPassword} noValidate>
          <PasswordField label="Your password, to confirm it is you" value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="setting__row">
            <button type="submit" className="btn btn--quiet" disabled={busy}>
              Continue
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => {
                setStep({ kind: "idle" });
                setPassword("");
                setMessage({});
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {step.kind === "scan" && (
        <form className="form" onSubmit={confirm} noValidate>
          <p>Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the code it shows.</p>
          <QrCode text={step.uri} label="QR code to add Listzero to an authenticator app" />
          <p className="hint">Cannot scan? Enter this key by hand (the spaces are optional):</p>
          <code className="secret">{secret.match(/.{1,4}/g)?.join(" ")}</code>
          <TextField label="6-digit code" value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
          <div className="setting__row">
            <button type="submit" className="btn btn--quiet" disabled={busy}>
              Turn on
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setStep({ kind: "idle" })}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {step.kind === "codes" && (
        <>
          <BackupCodes codes={step.codes} />
          <div className="setting__row">
            <button type="button" className="btn btn--quiet" onClick={() => setStep({ kind: "idle" })}>
              I have saved them
            </button>
          </div>
        </>
      )}
      <FormMessage {...message} />
    </Section>
  );
}

function PasskeysSection() {
  const passkeys = authClient.useListPasskeys();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<Message>({});
  const [busy, setBusy] = useState(false);
  const supported = typeof window.PublicKeyCredential !== "undefined";

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setMessage({});
    setBusy(true);
    const result = await authClient.passkey.addPasskey({ name: name.trim() || "Passkey" });
    setBusy(false);
    if (result?.error) {
      const text = result.error.message ?? "";
      if (!/cancel|abort|not allowed|timed out/i.test(text)) setMessage({ error: authMessage(result.error) });
      return;
    }
    setName("");
    setMessage({ notice: "Passkey added." });
  };

  return (
    <Section title="Passkeys">
      <p className="hint">Sign in with your fingerprint, face or device PIN instead of a password.</p>
      {(passkeys.data ?? []).length > 0 && (
        <ul className="rowlist">
          {(passkeys.data ?? []).map((key) => (
            <li key={key.id}>
              <span>
                <strong>{key.name || "Passkey"}</strong>
                <span className="hint"> added {when(key.createdAt)}</span>
              </span>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                aria-label={`Remove passkey ${key.name || ""}`}
                onClick={async () => {
                  const { error } = await authClient.passkey.deletePasskey({ id: key.id });
                  setMessage(error ? { error: authMessage(error) } : { notice: "Passkey removed." });
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <form className="form form--inline" onSubmit={add} noValidate>
          <TextField label="Name for a new passkey" value={name} onChange={setName} maxLength={40} placeholder="This laptop" />
          <button type="submit" className="btn btn--quiet" disabled={busy}>
            {busy ? "Waiting for your device…" : "Add a passkey"}
          </button>
        </form>
      ) : (
        <p className="hint">This browser does not support passkeys.</p>
      )}
      <FormMessage {...message} />
    </Section>
  );
}

interface Linked {
  id: string;
  providerId: string;
  accountId: string;
}

function ConnectedSection({ accounts, reload }: { accounts: Linked[]; reload(): void }) {
  const google = accounts.find((a) => a.providerId === "google");
  const [message, setMessage] = useState<Message>({});
  return (
    <Section title="Google">
      <p>{google ? "Connected. You can sign in with Google." : "Not connected. Connect it to sign in with one tap."}</p>
      <div className="setting__row">
        {google ? (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={async () => {
              const { error } = await authClient.unlinkAccount({ accountId: google.id });
              setMessage(error ? { error: authMessage(error) } : { notice: "Google disconnected." });
              reload();
            }}
          >
            Disconnect Google
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--quiet"
            onClick={async () => {
              const { error } = await authClient.linkSocial({ provider: "google", callbackURL: "/account" });
              if (error) setMessage({ error: authMessage(error) });
            }}
          >
            <GoogleMark />
            Connect Google
          </button>
        )}
      </div>
      <FormMessage {...message} />
    </Section>
  );
}

interface DeviceSession {
  id: string;
  token: string;
  userAgent?: string | null;
  createdAt: Date | string;
}

function SessionsSection({ sessions, currentToken, reload }: { sessions: DeviceSession[]; currentToken: string; reload(): void }) {
  const [message, setMessage] = useState<Message>({});
  const others = sessions.filter((s) => s.token !== currentToken);
  return (
    <Section title="Where you are signed in">
      <ul className="rowlist">
        {sessions.map((s) => (
          <li key={s.id}>
            <span>
              <strong>{describeDevice(s.userAgent)}</strong>
              {s.token === currentToken ? <span className="meta meta--doing">This device</span> : null}
              <span className="hint"> since {when(s.createdAt)}</span>
            </span>
            {s.token !== currentToken && (
              <button
                type="button"
                className="btn btn--quiet btn--small"
                aria-label={`Sign out ${describeDevice(s.userAgent)}`}
                onClick={async () => {
                  const { error } = await authClient.revokeSession({ token: s.token });
                  setMessage(error ? { error: authMessage(error) } : { notice: "That device was signed out." });
                  reload();
                }}
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <div className="setting__row">
          <button
            type="button"
            className="btn btn--quiet"
            onClick={async () => {
              const { error } = await authClient.revokeOtherSessions();
              setMessage(error ? { error: authMessage(error) } : { notice: "All other devices were signed out." });
              reload();
            }}
          >
            Sign out all other devices
          </button>
        </div>
      )}
      <FormMessage {...message} />
    </Section>
  );
}

function DeleteSection({ hasPassword, config }: { hasPassword: boolean; config: AccountConfig }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message>({});
  const owned = (useSpace()?.lists ?? []).filter((l) => l.role === "owner");
  // Lists with nobody to manage them can't be left behind: they go too, for everyone in them.
  const sharedNote =
    owned.length === 0
      ? ""
      : ` Shared lists you own are deleted for everyone in them: ${owned
          .map((l) => {
            const others = l.people.length - 1;
            return others > 0 ? `“${l.name}” (${others} ${others === 1 ? "other person" : "other people"})` : `“${l.name}”`;
          })
          .join(", ")}.`;

  const remove = async (withPassword?: string) => {
    const { error } = await authClient.deleteUser({ callbackURL: "/today", ...(withPassword ? { password: withPassword } : {}) });
    if (error) return setMessage({ error: authMessage(error) });
    setMessage({ notice: config.email ? "Check your email. The link in it deletes the account." : "Account deleted." });
    setAsking(false);
  };

  return (
    <Section title="Delete account">
      <p className="hint">
        Deletes your account and its tasks, on every device. Guest tasks in this browser are not affected. It cannot be
        undone.{sharedNote}
      </p>
      {asking ? (
        <form
          className="form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!password) return setMessage({ error: "Enter your password." });
            void remove(password);
          }}
        >
          <PasswordField label="Your password, to confirm" value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="setting__row">
            <button type="submit" className="btn btn--danger">
              Delete my account
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="setting__row">
          <button type="button" className="btn btn--danger" onClick={() => setOpen(true)}>
            Delete my account
          </button>
        </div>
      )}
      <FormMessage {...message} />
      {open && (
        <Confirm
          title="Delete your account?"
          body={
            (config.email
              ? "We will email you a link to confirm. Nothing is deleted until you open it."
              : "Your account and its tasks are deleted. Guest tasks in this browser stay.") + sharedNote
          }
          confirmLabel={config.email ? "Email me the link" : "Continue"}
          onClose={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            // With email, the link is the confirmation. Without, the password is.
            if (config.email || !hasPassword) void remove();
            else setAsking(true);
          }}
        />
      )}
    </Section>
  );
}

export function Account() {
  usePageTitle("Account");
  const config = useAccountConfig();
  const session = authClient.useSession();
  const [accounts, setAccounts] = useState<Linked[] | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const userId = session.data?.user.id;

  const reload = useCallback(() => {
    void authClient.listAccounts().then(({ data }) => setAccounts((data ?? []) as Linked[]));
    void authClient.listSessions().then(({ data }) => setSessions((data ?? []) as DeviceSession[]));
  }, []);
  useEffect(() => {
    if (userId) reload();
  }, [userId, reload]);

  if (config === null || (session.isPending && !session.data)) return null;
  if (!config.accounts) return <Navigate to="/today" replace />;
  if (!session.data) {
    if (session.error) return <CannotReach title="Account" onRetry={() => void session.refetch()} />;
    return <Navigate to="/sign-in?next=/account" replace />;
  }

  const { user } = session.data;
  const hasPassword = accounts?.some((a) => a.providerId === "credential") ?? true;

  return (
    <div className="view prose account">
      <header className="head">
        <h1 className="title">Account</h1>
      </header>
      <p className="auth__lead">
        Signed in as <strong>{user.email}</strong>
      </p>

      <SyncSection />
      <ProfileSection key={user.id} user={user} />
      {accounts !== null && <PasswordSection user={user} hasPassword={hasPassword} onAdded={reload} />}
      {accounts !== null && <TwoFactorSection user={user} hasPassword={hasPassword} />}
      <PasskeysSection />
      {config.google && accounts !== null && <ConnectedSection accounts={accounts} reload={reload} />}
      <SessionsSection sessions={sessions} currentToken={session.data.session.token} reload={reload} />

      {isAdminRole(user.role) && (
        <Section title="Admin">
          <div className="setting__row">
            <Link to="/admin/login" className="btn btn--quiet">
              Open the admin panel
            </Link>
          </div>
        </Section>
      )}

      <Section title="Sign out">
        <div className="setting__row">
          <button type="button" className="btn" onClick={() => setSigningOut(true)}>
            Sign out
          </button>
        </div>
      </Section>
      {accounts !== null && <DeleteSection hasPassword={hasPassword} config={config} />}
      {signingOut && <SignOutSheet onClose={() => setSigningOut(false)} />}
    </div>
  );
}
