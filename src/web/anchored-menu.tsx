import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { MoreHorizontal } from "lucide-react";
import { reduceMotion } from "./motion";

/** A menu whose retained contour opens from, and closes into, its trigger. */
export function AnchoredMenu({
  trigger,
  onClose,
  children,
}: {
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: (close: (after?: () => void) => void) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const animation = useRef<Animation | null>(null);
  const [closing, setClosing] = useState(false);
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
    const node = dialog.current!;
    const source = trigger.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    node.showModal();
    const position = () => {
      const origin = source?.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      const width = bounds.width || Math.min(300, window.innerWidth - 24);
      const height = bounds.height || 340;
      node.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, (origin?.right ?? window.innerWidth - 12) - width))}px`;
      node.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, origin?.top ?? 12))}px`;
    };
    position();
    const origin = source?.getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    if (origin && bounds.width && node.animate && !reduceMotion()) {
      const left = Math.max(0, origin.left - bounds.left);
      const top = Math.max(0, origin.top - bounds.top);
      const right = Math.max(0, bounds.right - origin.right);
      const bottom = Math.max(0, bounds.bottom - origin.bottom);
      animation.current = node.animate(
        [
          {
            clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round 26px)`,
            opacity: 0.65,
          },
          { clipPath: "inset(0px 0px 0px 0px round 26px)", opacity: 1 },
        ],
        { duration: 440, easing: "cubic-bezier(.22,.8,.2,1)", fill: "both" },
      );
    }
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      animation.current?.cancel();
      node.close();
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [trigger]);
  useLayoutEffect(() => {
    if (!closing) return;
    const motion = animation.current;
    if (motion && !reduceMotion()) {
      motion.playbackRate = -1;
      motion.play();
    }
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      finish.current();
      pending.current?.();
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
    >
      <div className="trip-menu-body" inert={closing}>
        <div className="trip-menu-heading">
          <h2 id={id}>旅行メニュー</h2>
          <button
            className="icon-button"
            aria-label="旅行メニューを閉じる"
            onClick={() => close()}
          >
            <MoreHorizontal />
          </button>
        </div>
        {children(close)}
      </div>
    </dialog>
  );
}
