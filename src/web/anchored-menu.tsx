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
import { ease, linearSupported } from "./cartoon";
import { reduceMotion } from "./motion";

// The header's … menu, as uchino's space menu (Tsubasa 2026-10-06): the page
// blurs behind a veil and the items, label then icon, stand right-aligned
// under the button. Opening, the button gives a jelly bounce and each item
// pops out of it on the boing spring, 30 ms apart; closing pulls them back in.

const BOING_FALLBACK = "cubic-bezier(.34,1.56,.64,1)";
const jelly = (): KeyframeAnimationOptions => {
  const curve = ease("boing");
  return {
    duration: curve.ms,
    easing: linearSupported() ? curve.easing : BOING_FALLBACK,
    fill: "both",
  };
};
/** The button's プルン: squashed wide, then wobbling back on boing. */
const bounce = (control: HTMLElement) => {
  if (reduceMotion() || typeof control.animate !== "function") return;
  control.animate([{ transform: "scale(1.2, .8)" }, { transform: "none" }], {
    ...jelly(),
    fill: "none",
  });
};

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
  const items = useRef<{ node: HTMLElement; from: string }[]>([]);
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
    node.appendChild(host);
    const origin = anchor.current!.getBoundingClientRect();
    node.style.left = `${origin.left}px`;
    node.style.top = `${origin.top}px`;
    host.style.setProperty(
      "--menu-height",
      `${Math.max(44, window.innerHeight - origin.bottom - 24)}px`,
    );
    node.showModal();
    const animated = typeof control.animate === "function" && !reduceMotion();
    if (animated) {
      bounce(control);
      try {
        node.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 300,
          easing: "cubic-bezier(.22, 1, .36, 1)",
          pseudoElement: "::backdrop",
        });
      } catch {
        /* no ::backdrop animation here */
      }
    }
    // Each item starts inside the button: lifted to its centre and shrunk.
    const centre = origin.top + origin.height / 2;
    items.current = Array.from(
      body.current!.querySelectorAll<HTMLElement>("[data-menu-item]"),
    ).map((item) => {
      const box = item.getBoundingClientRect();
      const lift = centre - (box.top + box.height / 2);
      return {
        node: item,
        from: `translateY(${Math.round(lift)}px) scale(.4)`,
      };
    });
    if (animated)
      items.current.forEach(({ node: item, from }, index) =>
        item.animate(
          [
            { opacity: 0, transform: from },
            { opacity: 1, offset: 0.25 },
            { opacity: 1, transform: "none" },
          ],
          { ...jelly(), delay: index * 30 },
        ),
      );
    const resize = () => close();
    const preventBackgroundScroll = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !body.current?.contains(event.target)
      )
        event.preventDefault();
    };
    window.addEventListener("resize", resize);
    document.addEventListener("wheel", preventBackgroundScroll, {
      passive: false,
    });
    document.addEventListener("touchmove", preventBackgroundScroll, {
      passive: false,
    });
    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("wheel", preventBackgroundScroll);
      document.removeEventListener("touchmove", preventBackgroundScroll);
      items.current = [];
      anchor.current?.appendChild(host);
      node.close();
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [anchor, host, open]);
  useLayoutEffect(() => {
    if (!closing) return;
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      setClosing(false);
      finish.current();
      pending.current?.();
      pending.current = undefined;
    };
    if (reduceMotion() || typeof button.current?.animate !== "function") {
      const timer = setTimeout(complete, 0);
      return () => clearTimeout(timer);
    }
    bounce(button.current);
    const last = items.current.length - 1;
    const motions = items.current.map(({ node, from }, index) =>
      node.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: from },
        ],
        {
          duration: 200,
          easing: "cubic-bezier(.5, 0, .75, 0)",
          delay: (last - index) * 18,
          fill: "both",
        },
      ),
    );
    try {
      dialog.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 200 + Math.max(0, last) * 18,
        fill: "both",
        pseudoElement: "::backdrop",
      });
    } catch {
      /* no ::backdrop animation here */
    }
    void Promise.all(motions.map((motion) => motion.finished))
      .then(complete)
      .catch(() => undefined);
    const timer = setTimeout(complete, 600);
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
            disabled={closing}
            onClick={() => {
              if (open) close();
              else onOpen();
            }}
          >
            <MoreHorizontal />
          </button>
          {open && (
            <div ref={body} className="trip-menu-body" inert={closing}>
              <h2 id={id} className="trip-menu-heading">
                旅行メニュー
              </h2>
              {children(close)}
            </div>
          )}
        </>,
        host,
      )}
    </>
  );
}
