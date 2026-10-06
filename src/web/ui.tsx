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
import { createPortal } from "react-dom";
import { referenceUrl, registeredGoogleMapsUrl } from "@/data/places";
import { menuDepth } from "./menu-depth";
import { lockModalPage } from "./modal-scroll-lock";
import {
  animateDialog,
  dismissModal,
  motionOrigin,
  reduceMotion,
} from "./motion";
import {
  X,
  Check,
  Plus,
  LoaderCircle,
  Keyboard,
  ChevronDown,
  SlidersHorizontal,
  ExternalLink as ExternalLinkIcon,
} from "lucide-react";
import {
  ThumbDock,
  ContextDock,
  ThumbAction,
  FloatingAddAction,
  ThumbFormContext,
  useThumbForm,
} from "./thumb-dock";
import { Button } from "./obsidian/button";
import { DockBackIcon } from "./cartoon-dock";
import { spring } from "./cartoon";
import {
  cardOrigin,
  closeToCard,
  openFromCard,
  sheetIn,
  sheetOut,
} from "./transitions";
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
        ?.setAttribute("content", theme === "dark" ? "#141312" : "#FFFFFF");
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
/**
 * Keep the pointer-down action stable even when the browser blurs on tap.
 * While an editor is focused it closes the keyboard; otherwise it leaves.
 * A sheet may name its way out (「やめる」) as text instead of an arrow, or
 * pass an icon, in which case the label is only the accessible name.
 */
export function FormBackButton({
  onBack,
  label,
  icon,
}: {
  onBack: () => void;
  label?: string;
  icon?: ReactNode;
}) {
  const [editor, setEditor] = useState<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pressedEditor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const focused = document.activeElement;
      const dialog = button.current?.closest("dialog");
      setEditor(
        focused instanceof HTMLElement &&
          dialog?.contains(focused) &&
          focused.matches(
            "input, textarea, select, [contenteditable='true']",
          ) &&
          !focused.matches(
            ':disabled, [readonly], input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"], input[type="range"], input[type="file"], input[type="color"]',
          )
          ? focused
          : null,
      );
    };
    const afterBlur = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", afterBlur);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", afterBlur);
    };
  }, []);
  return (
    <button
      ref={button}
      type="button"
      aria-label={
        editor
          ? "キーボードを閉じる"
          : label && !icon
            ? undefined
            : (label ?? "戻る")
      }
      className={label && !icon && !editor ? "context-back-label" : undefined}
      onPointerDown={(event) => {
        pressedEditor.current = editor;
        if (editor) event.preventDefault();
      }}
      onPointerCancel={() => {
        pressedEditor.current = null;
      }}
      onClick={() => {
        const target = pressedEditor.current ?? editor;
        pressedEditor.current = null;
        if (target) {
          target.blur();
          setEditor(null);
        } else onBack();
      }}
    >
      {editor ? (
        <span className="keyboard-dismiss-icon" aria-hidden="true">
          <Keyboard size={20} />
          <ChevronDown size={12} />
        </span>
      ) : (
        (icon ?? label ?? <DockBackIcon />)
      )}
    </button>
  );
}

export type ModalTransition = {
  enter: (panel: HTMLElement, card: HTMLElement | null) => unknown;
  exit: (panel: HTMLElement, card: HTMLElement | null) => Promise<unknown>;
};
export function Modal({
  title,
  children,
  onClose,
  full = false,
  fullscreen = false,
  action,
  preserveNavigation = false,
  dockActions,
  plain = false,
  sheet,
  transition,
}: PropsWithChildren<{
  title: string;
  /** "bottom": kondo-detail's sheet on phones: it rises from the bottom edge
      on the split spring and drops on lead, instead of opening out of the
      pressed card. */
  sheet?: "bottom";
  onClose: () => void;
  full?: boolean;
  fullscreen?: boolean;
  action?: ReactNode;
  preserveNavigation?: boolean;
  dockActions?: {
    primary?: ReactNode;
    actions?: ReactNode;
    backLabel?: string;
    /** Replaces the back circle on the left island (kondo-detail's 削除 and
        編集 circles). */
    back?: ReactNode;
    /** Many tools in a row where the tabs sit (a note's editor). */
    wide?: boolean;
  };
  /** kondo-prep3's sheets: always rise from the bottom edge, and the page
      stays put under the scrim (no card stretch, no receding). */
  plain?: boolean;
  /** A screen's own phone move in place of the shared card/sheet one. */
  transition?: ModalTransition;
}>) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const [closing, setClosing] = useState(false);
  const [saveAction, setSaveAction] = useState<{
    formId: string;
    busy: boolean;
  } | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const animation = useRef<Animation | null>(null);
  const cartoon = useRef<{ card: HTMLElement | null } | null>(null);
  const depth = useRef<ReturnType<typeof menuDepth> | null>(null);
  const backdropAnimation = useRef<Animation | undefined>(undefined);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const pendingClose = useRef<(() => void) | null>(null);
  const swipeStart = useRef<number | null>(null);
  const close = () => setClosing(true);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const focus = document.activeElement as HTMLElement | null;
    const releasePage = lockModalPage();
    origin.current = motionOrigin();
    const opener = origin.current ?? focus;
    dialog.showModal();
    // Start on the title: opening a screen must not activate an input/keyboard.
    heading.current?.focus({ preventScroll: true });
    // Phones get the mocks' moves: out of the pressed card (kondo-cartoon §4)
    // or up from the bottom as a sheet; wider screens keep the panel unfold.
    const panel = dialog.querySelector<HTMLElement>(".modal-inner");
    const phone =
      panel && !reduceMotion() && matchMedia("(max-width: 759px)").matches;
    cartoon.current = phone
      ? {
          card: plain || sheet === "bottom" ? null : cardOrigin(origin.current),
        }
      : null;
    if (phone && transition)
      void transition.enter(panel, cartoon.current!.card);
    else if (phone && sheet === "bottom")
      void spring(
        panel,
        [{ transform: "translateY(105%)" }, { transform: "none" }],
        "split",
      );
    else if (phone && cartoon.current?.card)
      void openFromCard(cartoon.current.card, panel, {
        parent: dialog,
        parts: [
          ...panel.querySelectorAll<HTMLElement>(
            ":scope > .modal-header, :scope > .modal-body > *",
          ),
        ].slice(0, 8),
      });
    else if (phone) void sheetIn(panel);
    const enter = phone ? null : animateDialog(dialog, origin.current);
    animation.current = enter;
    // kondo-detail's sheet slides over a plain #0006 scrim, and a screen's
    // own move draws over the page as it is: no receding page.
    depth.current =
      plain || (phone && (sheet === "bottom" || transition))
        ? null
        : menuDepth(
            reduceMotion(),
            {
              duration: 320,
              easing: "cubic-bezier(.32, 0, .2, 1)",
              fill: "both",
            },
            dialog,
          );
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
      const card = cartoon.current?.card;
      if (card) card.style.visibility = "";
      dialog.removeEventListener("tabi:modal-close", requestClose);
      depth.current?.cancel();
      depth.current = null;
      animation.current?.cancel();
      backdropAnimation.current?.cancel();
      dialog.close();
      releasePage();
      if (document.documentElement.dataset.inputModality === "pointer") {
        // Native dialog.close() may restore a stale tab panel on touch Safari.
        // Clear that restoration without stealing focus from a newer dialog.
        const restored = document.activeElement;
        if (
          restored instanceof HTMLElement &&
          (restored === focus ||
            restored === opener ||
            dialog.contains(restored))
        )
          restored.blur();
      } else if (
        opener?.isConnected &&
        !dialog.contains(opener) &&
        !opener.closest("[inert], [hidden], dialog:not([open])")
      ) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const dialog = ref.current;
    const panel = dialog?.querySelector<HTMLElement>(".modal-inner");
    if (cartoon.current && dialog && panel && !reduceMotion()) {
      const { card } = cartoon.current;
      depth.current?.reverse(320, -1.15);
      const backdrop = backdropAnimation.current;
      if (backdrop) {
        backdrop.playbackRate = -1.15;
        backdrop.play();
        void backdrop.finished.catch(() => undefined);
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        (pendingClose.current ?? closeCallback.current)();
      };
      void (
        transition
          ? transition.exit(panel, card)
          : sheet === "bottom"
            ? spring(
                panel,
                [{ transform: "none" }, { transform: "translateY(105%)" }],
                "lead",
                { fill: "forwards" },
              )
            : card
              ? closeToCard(card, panel, { parent: dialog })
              : sheetOut(panel)
      ).then(finish);
      const timer = setTimeout(finish, 900);
      return () => {
        done = true;
        clearTimeout(timer);
      };
    }
    const exit = animation.current;
    if (exit && !reduceMotion()) {
      exit.playbackRate = -1.15;
      exit.play();
      depth.current?.reverse(exit.currentTime, -1.15);
      const backdrop = backdropAnimation.current;
      if (backdrop) {
        backdrop.currentTime = exit.currentTime;
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
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={id}
      data-sheet={sheet}
      className={`modal ${full || fullscreen ? "full" : ""} ${fullscreen ? "fullscreen" : ""} ${closing ? "closing" : ""}`}
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
                !(event.target as Element).closest("button, a")
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
            <h2 ref={heading} id={id} tabIndex={-1} autoFocus>
              {title}
            </h2>
            {action ?? <span className="icon-spacer" />}
          </header>
          <div className="modal-body">{children}</div>
          <ToastMessage />
        </div>
        <ThumbDock
          mode={saveAction ? "edit" : dockActions ? "context" : "detail"}
          target={() => ref.current}
          disabled={closing}
          navigation={
            preserveNavigation && !saveAction && !dockActions
              ? {
                  back: close,
                  action,
                  beforeNavigate: (navigate) =>
                    dismissModal(() => {
                      closeCallback.current();
                      navigate();
                    }, ref.current),
                }
              : undefined
          }
        >
          {saveAction || dockActions ? (
            <ContextDock
              back={
                dockActions?.back && !saveAction ? (
                  dockActions.back
                ) : fullscreen ? (
                  <button aria-label="閉じる" onClick={close}>
                    <X size={22} />
                  </button>
                ) : (
                  <FormBackButton
                    onBack={close}
                    label={dockActions?.backLabel}
                  />
                )
              }
              primary={
                saveAction ? (
                  <Button
                    variant="ghost"
                    type="submit"
                    form={saveAction.formId}
                    disabled={saveAction.busy}
                  >
                    <Check size={18} aria-hidden="true" />
                    {saveAction.busy ? "保存中…" : "保存する"}
                  </Button>
                ) : (
                  dockActions?.primary
                )
              }
              actions={dockActions?.actions}
              wide={dockActions?.wide}
            />
          ) : (
            <ContextDock
              back={
                <button aria-label="戻る" onClick={close}>
                  <DockBackIcon />
                </button>
              }
              actions={action}
            />
          )}
        </ThumbDock>
      </ThumbFormContext.Provider>
    </dialog>,
    document.body,
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
          className="cdock-btn"
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
/** The screen's add action: the one round ink ＋ at the bottom right, just
    above the dock (FloatingAddAction in thumb-dock.tsx), on every screen. */
export function AddButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return <FloatingAddAction label={label} onClick={onClick} />;
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
      <Check size={18} aria-hidden="true" />
      {busy ? "保存しています…" : "保存する"}
    </Button>
  );
}
export function ExternalLink({
  url,
  label = "サイトを開く",
}: {
  url: string;
  label?: string;
}) {
  const href = referenceUrl(url);
  if (!href) return null;
  const host = new URL(href).hostname.replace(/^www\./, "");
  return (
    <a className="reference-link" href={href} target="_blank" rel="noreferrer">
      <span>
        <strong>{label}</strong>
        <small>{host}</small>
      </span>
      <ExternalLinkIcon size={16} aria-hidden="true" />
    </a>
  );
}
export function MapLink({ url }: { url: string | null }) {
  return url ? (
    <ExternalLink
      url={url}
      label={
        registeredGoogleMapsUrl(url) ? "Google Mapsで開く" : "サイトを開く"
      }
    />
  ) : null;
}
export async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}
