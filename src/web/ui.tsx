import {
  createContext,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { X, Plus, LoaderCircle } from "lucide-react";
import {
  normalizeThemePreference,
  resolveTheme,
  THEME_KEY,
  type ThemePreference,
} from "@/theme/preferences";
const ThemeContext = createContext({
  preference: "system" as ThemePreference,
  setPreference: (_: ThemePreference) => {},
});
export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] = useState(() =>
    normalizeThemePreference(localStorage.getItem(THEME_KEY)),
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const theme = resolveTheme(preference, media.matches ? "dark" : "light");
      document.documentElement.dataset.theme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#0A0A0A" : "#F7F7F7");
    };
    localStorage.setItem(THEME_KEY, preference);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preference]);
  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
const ToastMessageContext = createContext("");
function ToastMessage() {
  const message = useContext(ToastMessageContext);
  return (
    <div
      role="status"
      aria-live="polite"
      className={message ? "toast visible" : "toast"}
    >
      {message}
    </div>
  );
}
const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 5500);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <ToastContext.Provider value={notify}>
      <ToastMessageContext.Provider value={message}>
        {children}
        <ToastMessage />
      </ToastMessageContext.Provider>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function useAction() {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const run = async (action: () => unknown | Promise<unknown>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "処理に失敗しました");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}
export function Modal({
  title,
  children,
  onClose,
  full = false,
  action,
}: PropsWithChildren<{
  title: string;
  onClose: () => void;
  full?: boolean;
  action?: ReactNode;
}>) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [closing, setClosing] = useState(false);
  const close = () => setClosing(true);
  useEffect(() => {
    const dialog = ref.current!;
    const focus = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
      focus?.focus();
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(
      onClose,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160,
    );
    return () => clearTimeout(timer);
  }, [closing, onClose]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={`modal ${full ? "full" : ""} ${closing ? "closing" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div className="modal-inner">
        <header className="modal-header">
          <button className="icon-button" aria-label="閉じる" onClick={close}>
            <X />
          </button>
          <h2 id={id}>{title}</h2>
          {action ?? <span className="icon-spacer" />}
        </header>
        <div className="modal-body">{children}</div>
        <ToastMessage />
      </div>
    </dialog>
  );
}
export function Field({
  label,
  children,
}: PropsWithChildren<{ label: string }>) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ children }: PropsWithChildren) {
  return <div className="empty">{children}</div>;
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" />
      <span>読み込んでいます…</span>
    </div>
  );
}
export function AddButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button className="floating-add" onClick={onClick} aria-label={label}>
      <Plus />
      <span>{label}</span>
    </button>
  );
}
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
export function SaveButton({ busy = false }: { busy?: boolean }) {
  return (
    <button className="primary" type="submit" disabled={busy}>
      {busy ? "保存しています…" : "保存する"}
    </button>
  );
}
export function MapLink({ url }: { url: string | null }) {
  return url ? (
    <a className="text-link" href={url} target="_blank" rel="noreferrer">
      Google Mapsで開く
    </a>
  ) : null;
}
export async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}
