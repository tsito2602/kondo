import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { reduceMotion } from "./motion";

/** Keep the same button in a stable portal, including while in the top layer. */
export function AnchoredMenu({
  anchor,
  open,
  onOpen,
  onClose,
  children,
}: {
  anchor: RefObject<HTMLDivElement | null>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: (close: (after?: () => void) => void) => ReactNode;
}) {
  const [host] = useState(() => document.createElement("div"));
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const contentAnimation = useRef<Animation | null>(null);
  const [closing, setClosing] = useState(false);
  const [pressed, setPressed] = useState(false);
  const pending = useRef<(() => void) | undefined>(undefined);
  const finish = useRef(onClose);
  finish.current = onClose;
  const id = useId();
  const close = (after?: () => void) => {
    if (closing) return;
    pending.current = after;
    setClosing(true);
  };
  useLayoutEffect(() => {
    host.className = "trip-menu-host";
    anchor.current?.appendChild(host);
    return () => {
      host.parentNode?.removeChild(host);
    };
  }, [anchor, host]);
  useLayoutEffect(() => {
    if (!open) return;
    const node = dialog.current!;
    const control = button.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    // Read the live button size before promoting that very same element.
    const initial = control.getBoundingClientRect();
    const style = window.getComputedStyle(control);
    const folded = {
      width: `${initial.width || 44}px`,
      height: `${initial.height || 44}px`,
      borderRadius: style.borderRadius || "22px",
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
    };
    node.appendChild(host);
    const position = () => {
      // The untransformed layout slot is the anchor; press motion never moves it.
      const origin = anchor.current!.getBoundingClientRect();
      node.style.left = `${origin.left}px`;
      node.style.top = `${origin.top}px`;
      host.style.setProperty(
        "--menu-width",
        `${Math.min(300, origin.right - 12)}px`,
      );
      host.style.setProperty(
        "--menu-height",
        `${Math.max(44, window.innerHeight - origin.top - 12)}px`,
      );
    };
    position();
    node.showModal();
    const bounds = body.current!.getBoundingClientRect();
    const expanded = {
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      borderRadius: "26px",
      backgroundColor: window
        .getComputedStyle(document.documentElement)
        .getPropertyValue("--menu-glass")
        .trim(),
      boxShadow: "inset 0 1px 1px var(--surface-glow), 0 12px 40px #0003",
    };
    // The button owns the material. Its icon has fixed top/right coordinates;
    // neither the button nor the icon is translated or replaced.
    Object.assign(control.style, expanded);
    if (control.animate && !reduceMotion()) {
      const timing: KeyframeAnimationOptions = {
        duration: 440,
        easing: "cubic-bezier(.22,.8,.2,1)",
        fill: "both",
      };
      animation.current = control.animate([folded, expanded], timing);
      contentAnimation.current = body.current!.animate(
        [
          {
            opacity: 0,
            clipPath: `inset(0px 0px ${bounds.height - 44}px ${bounds.width - 44}px round 22px)`,
            offset: 0,
          },
          { opacity: 0, offset: 0.25 },
          { opacity: 1, clipPath: "inset(0px round 26px)", offset: 1 },
        ],
        timing,
      );
    }
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("resize", position);
      animation.current?.cancel();
      contentAnimation.current?.cancel();
      animation.current = contentAnimation.current = null;
      control.removeAttribute("style");
      anchor.current?.appendChild(host);
      node.close();
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [anchor, host, open]);
  useLayoutEffect(() => {
    if (!closing) return;
    const motion = animation.current;
    if (motion && !reduceMotion()) {
      motion.playbackRate = -1;
      motion.play();
      if (contentAnimation.current) {
        contentAnimation.current.currentTime = motion.currentTime;
        contentAnimation.current.playbackRate = -1;
        contentAnimation.current.play();
      }
    }
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      setClosing(false);
      setPressed(false);
      finish.current();
      pending.current?.();
      pending.current = undefined;
    };
    if (motion && !reduceMotion())
      void motion.finished.then(complete).catch(() => undefined);
    const timer = setTimeout(complete, motion && !reduceMotion() ? 600 : 0);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [closing]);
  return (
    <>
      {open && (
        <dialog
          ref={dialog}
          className="trip-menu-popover"
          aria-labelledby={id}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        />
      )}
      {createPortal(
        <>
          <button
            ref={button}
            className="icon-button trip-menu-toggle"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={open ? "旅行メニューを閉じる" : "旅行メニュー"}
            data-pressed={pressed && !open}
            disabled={closing}
            onPointerDown={() => {
              if (!open) setPressed(true);
            }}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onBlur={() => setPressed(false)}
            onKeyDown={(event) => {
              if (!open && ["Enter", " "].includes(event.key)) setPressed(true);
            }}
            onKeyUp={() => setPressed(false)}
            onClick={() => {
              setPressed(false);
              if (open) close();
              else onOpen();
            }}
          >
            <MoreHorizontal />
          </button>
          {open && (
            <div ref={body} className="trip-menu-body" inert={closing}>
              <div className="trip-menu-heading">
                <h2 id={id}>旅行メニュー</h2>
              </div>
              {children(close)}
            </div>
          )}
        </>,
        host,
      )}
    </>
  );
}
