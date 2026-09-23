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
  const surface = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const contentAnimation = useRef<Animation | null>(null);
  const updateContour = useRef<() => void>(() => {});
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
    const materialStyle = window.getComputedStyle(surface.current!);
    const material = {
      backgroundColor: materialStyle.backgroundColor,
      boxShadow: materialStyle.boxShadow,
    };
    const contour = () => {
      const origin = source?.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      const sourceStyle = source ? window.getComputedStyle(source) : null;
      return origin && bounds.width
        ? [
            {
              transform: `translate(${origin.left - bounds.left}px, ${origin.top - bounds.top}px)`,
              width: `${origin.width}px`,
              height: `${origin.height}px`,
              borderRadius: `${Math.min(origin.width, origin.height) / 2}px`,
              backgroundColor:
                sourceStyle?.backgroundColor ?? material.backgroundColor,
              boxShadow: sourceStyle?.boxShadow ?? "none",
            },
            {
              transform: "translate(0px, 0px)",
              width: `${bounds.width}px`,
              height: `${bounds.height}px`,
              borderRadius: "26px",
              backgroundColor: material.backgroundColor,
              boxShadow: material.boxShadow,
            },
          ]
        : null;
    };
    const contentFrames = () => {
      const origin = source?.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      return [
        {
          opacity: 0,
          offset: 0,
          clipPath: origin
            ? `inset(${origin.top - bounds.top}px ${bounds.right - origin.right}px ${bounds.bottom - origin.bottom}px ${origin.left - bounds.left}px round 26px)`
            : "inset(0px round 26px)",
        },
        { opacity: 0, offset: 0.25 },
        { opacity: 1, offset: 1, clipPath: "inset(0px round 26px)" },
      ];
    };
    const position = () => {
      const origin = source?.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      const width = bounds.width || Math.min(300, window.innerWidth - 24);
      const height = bounds.height || 340;
      // The persistent three-dot icon remains at the original button center.
      node.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, (origin?.right ?? window.innerWidth - 12) + 8 - width))}px`;
      node.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, (origin?.top ?? 20) - 8))}px`;
      const frames = contour();
      if (frames)
        (animation.current?.effect as KeyframeEffect | null)?.setKeyframes(
          frames,
        );
      (contentAnimation.current?.effect as KeyframeEffect | null)?.setKeyframes(
        contentFrames(),
      );
    };
    position();
    const frames = contour();
    if (frames && surface.current?.animate && !reduceMotion()) {
      const timing: KeyframeAnimationOptions = {
        duration: 440,
        easing: "cubic-bezier(.22,.8,.2,1)",
        fill: "both",
      };
      animation.current = surface.current.animate(frames, timing);
      contentAnimation.current = body.current!.animate(contentFrames(), timing);
    }
    // Replace the button visually with the same material and icon, instead of
    // leaving a second button underneath an expanding overlay.
    const previousVisibility = source?.style.visibility ?? "";
    if (source) source.style.visibility = "hidden";
    updateContour.current = position;
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      animation.current?.cancel();
      contentAnimation.current?.cancel();
      node.close();
      if (source) source.style.visibility = previousVisibility;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [trigger]);
  useLayoutEffect(() => {
    if (!closing) return;
    const motion = animation.current;
    if (motion && !reduceMotion()) {
      updateContour.current();
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
      <div ref={surface} className="trip-menu-surface" aria-hidden="true" />
      <div ref={body} className="trip-menu-body" inert={closing}>
        <div className="trip-menu-heading">
          <h2 id={id}>旅行メニュー</h2>
        </div>
        {children(close)}
      </div>
      <button
        className="icon-button trip-menu-close"
        aria-label="旅行メニューを閉じる"
        disabled={closing}
        onClick={() => close()}
      >
        <MoreHorizontal />
      </button>
    </dialog>
  );
}
