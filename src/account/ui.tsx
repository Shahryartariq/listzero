/** Small form pieces shared by the sign-in screens and the Account page. */
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { passwordStrength } from "./messages";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  hint?: ReactNode;
}

export function TextField({ label, value, onChange, error, hint, ...input }: TextFieldProps) {
  const id = useId();
  const described = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="form__field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
      />
      {error && (
        <p className="form__error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

const STRENGTH = ["", "Weak", "Fair", "Good", "Strong"] as const;

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  /** "current-password" for signing in, "new-password" when choosing one. */
  autoComplete: "current-password" | "new-password";
  /** Show how strong the password is while it is typed. */
  meter?: boolean;
  hint?: ReactNode;
}

export function PasswordField({ label, value, onChange, error, autoComplete, meter, hint }: PasswordFieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const strength = passwordStrength(value);
  const described = [error ? `${id}-error` : "", meter && value ? `${id}-meter` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="form__field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="form__password">
        <input
          id={id}
          className="field"
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          maxLength={128}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
        />
        <button
          type="button"
          className="icon-btn form__reveal"
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((v) => !v)}
        >
          <Icon name={shown ? "eyeOff" : "eye"} size={20} />
        </button>
      </div>
      {meter && value && (
        <p className="meter" id={`${id}-meter`} data-strength={strength}>
          <span className="meter__bar" aria-hidden="true">
            <span />
          </span>
          <span>{STRENGTH[strength] || "Too short"}</span>
        </p>
      )}
      {error && (
        <p className="form__error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** A message about the whole form: red for a problem, plain for good news. */
export function FormMessage({ error, notice }: { error?: string; notice?: string }) {
  if (error) {
    return (
      <p className="form__alert" role="alert">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p className="form__notice" role="status">
        {notice}
      </p>
    );
  }
  return null;
}

/** The mark Google asks sign-in buttons to carry. */
export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
