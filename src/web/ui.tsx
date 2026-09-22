import {
  createContext,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { animateDialog, motionOrigin, reduceMotion } from "./motion";
import {
  X,
  Plus,
  LoaderCircle,
  ArrowLeft,
  SlidersHorizontal,
} from "lucide-react";
import {
  ThumbDock,
  ThumbAction,
  ThumbFormContext,
  useThumbForm,
} from "./thumb-dock";
import { Button } from "./obsidian/button";
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
        ?.setAttribute("content", theme === "dark" ? "#111315" : "#F7F7F7");
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
  const [saveAction, setSaveAction] = useState<{
    formId: string;
    busy: boolean;
  } | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const animation = useRef<Animation | null>(null);
  const backdropAnimation = useRef<Animation | undefined>(undefined);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const pendingClose = useRef<(() => void) | null>(null);
  const swipeStart = useRef<number | null>(null);
  const close = () => setClosing(true);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const focus = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    origin.current = motionOrigin();
    dialog.showModal();
    const enter = animateDialog(dialog, origin.current);
    animation.current = enter;
    backdropAnimation.current = dialog
      .getAnimations?.({ subtree: true })
      .find(
        (entry) =>
          "animationName" in entry && entry.animationName === "backdrop-enter",
      );
    // Do not cancel the finished entrance: its exact geometry is needed to reverse.
    void enter?.finished.catch(() => undefined);
    const requestClose = (event: Event) => {
      pendingClose.current ??= (event as CustomEvent<() => void>).detail;
      setClosing(true);
    };
    dialog.addEventListener("tabi:modal-close", requestClose);
    return () => {
      dialog.removeEventListener("tabi:modal-close", requestClose);
      animation.current?.cancel();
      backdropAnimation.current?.cancel();
      dialog.close();
      document.body.style.overflow = previous;
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const exit = animation.current;
    if (exit && !reduceMotion()) {
      exit.playbackRate = -1.15;
      exit.play();
      const backdrop = backdropAnimation.current;
      if (backdrop) {
        backdrop.playbackRate = -1.15;
        backdrop.play();
        void backdrop.finished.catch(() => undefined);
      }
    }
    let cancelled = false;
    const finish = () => {
      if (!cancelled) {
        cancelled = true;
        (pendingClose.current ?? closeCallback.current)();
      }
    };
    if (exit && !reduceMotion())
      void exit.finished.then(finish).catch(() => undefined);
    // Safety timeout must never truncate the normal reverse animation.
    const timer = setTimeout(finish, exit && !reduceMotion() ? 600 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      exit?.cancel();
    };
  }, [closing]);
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
      <ThumbFormContext.Provider value={setSaveAction}>
        <div className="modal-inner" inert={closing}>
          <header
            className="modal-header"
            onPointerDown={(event) => {
              if (
                event.pointerType === "touch" &&
                !(event.target as Element).closest("button")
              ) {
                swipeStart.current = event.clientY;
                event.currentTarget.setPointerCapture(event.pointerId);
              }
            }}
            onPointerUp={(event) => {
              if (
                swipeStart.current !== null &&
                event.clientY - swipeStart.current > 72
              )
                close();
              swipeStart.current = null;
            }}
            onPointerCancel={() => {
              swipeStart.current = null;
            }}
          >
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="閉じる"
              onClick={close}
            >
              <X />
            </Button>
            <h2 id={id}>{title}</h2>
            {action ?? <span className="icon-spacer" />}
          </header>
          <div className="modal-body">{children}</div>
          <ToastMessage />
        </div>
        <ThumbDock
          mode={saveAction ? "edit" : "detail"}
          target={() => ref.current}
          disabled={closing}
        >
          <button className="thumb-control" onClick={close}>
            <ArrowLeft size={20} />
            {saveAction ? "キャンセル" : "戻る"}
          </button>
          {saveAction ? (
            <Button
              className="thumb-control primary"
              type="submit"
              form={saveAction.formId}
              disabled={saveAction.busy}
            >
              {saveAction.busy ? "保存中…" : "保存する"}
            </Button>
          ) : (
            action
          )}
        </ThumbDock>
      </ThumbFormContext.Provider>
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
export function ThumbTools({
  title,
  label = "表示",
  children,
}: PropsWithChildren<{ title: string; label?: string }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ThumbAction>
        <button
          className="thumb-control"
          aria-label={title}
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal size={18} />
          {label}
        </button>
      </ThumbAction>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          {children}
        </Modal>
      )}
    </>
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
  floating = false,
}: {
  onClick: () => void;
  label: string;
  floating?: boolean;
}) {
  return (
    <>
      <ThumbAction>
        <button
          className="thumb-control thumb-add"
          onClick={onClick}
          aria-label={label}
        >
          <Plus size={18} />
          <span>{label.replace(/を追加$/, "")}</span>
        </button>
      </ThumbAction>
      <Button
        className={floating ? "floating-add" : "primary add-action"}
        onClick={onClick}
        aria-label={label}
      >
        <Plus />
        <span>{label}</span>
      </Button>
    </>
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
  const ref = useRef<HTMLButtonElement>(null);
  useThumbForm(ref, busy);
  return (
    <Button
      ref={ref}
      variant="ghost"
      className="primary form-save"
      type="submit"
      disabled={busy}
    >
      {busy ? "保存しています…" : "保存する"}
    </Button>
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
