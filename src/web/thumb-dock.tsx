import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { reduceMotion } from "./motion";

type DockEntry = {
  content: ReactNode;
  mode: "browse" | "detail" | "edit" | "context";
  target?: () => HTMLElement | null;
  disabled?: boolean;
  navigation?: DockNavigation;
};
type DockNavigation = {
  back: () => void;
  action: ReactNode;
  beforeNavigate: (navigate: () => void) => void;
};
export const DockNavigationContext = createContext<DockNavigation | null>(null);
type Entry = {
  value: DockEntry | ReactNode;
  order: number;
  scope: "dock" | "action";
};
const Registry = createContext<{
  put: (id: string, scope: Entry["scope"], value: Entry["value"]) => void;
  remove: (id: string) => void;
} | null>(null);
const Actions = createContext<ReactNode[]>([]);

/** One live surface, moved into the active dialog's top layer without remounting. */
export function ThumbDockProvider({ children }: PropsWithChildren) {
  const [entries, setEntries] = useState(new Map<string, Entry>());
  const sequence = useRef(0);
  const [host] = useState(() =>
    Object.assign(document.createElement("div"), {
      className: "thumb-dock-host",
    }),
  );
  const surface = useRef<HTMLDivElement>(null);
  const previous = useRef<DOMRect | null>(null);
  const pendingBounds = useRef<DOMRect | null>(null);
  const animation = useRef<Animation | null>(null);
  const registry = useMemo(() => {
    const capture = () => {
      if (pendingBounds.current) return;
      const bounds = surface.current
        ?.querySelector(".thumb-dock-material")
        ?.getBoundingClientRect();
      if (bounds?.width) pendingBounds.current = bounds;
    };
    return {
      put: (id: string, scope: Entry["scope"], value: Entry["value"]) => {
        capture();
        setEntries((old) => {
          const next = new Map(old);
          next.set(id, {
            value,
            scope,
            order: old.get(id)?.order ?? ++sequence.current,
          });
          return next;
        });
      },
      remove: (id: string) => {
        capture();
        setEntries((old) => {
          const next = new Map(old);
          next.delete(id);
          return next;
        });
      },
    };
  }, []);
  const ordered = [...entries.values()].sort((a, b) => a.order - b.order);
  const active = ordered.filter((entry) => entry.scope === "dock").at(-1)
    ?.value as DockEntry | undefined;
  const browse = ordered
    .filter(
      (entry) =>
        entry.scope === "dock" && (entry.value as DockEntry).mode === "browse",
    )
    .at(-1)?.value as DockEntry | undefined;
  const visible = active?.navigation && browse ? browse : active;
  const actions = useMemo(
    () =>
      [...entries.values()]
        .filter((entry) => entry.scope === "action")
        .map((entry) => entry.value as ReactNode),
    [entries],
  );
  useLayoutEffect(() => {
    const parent = active?.target?.() ?? document.body;
    if (host.parentElement !== parent) parent.appendChild(host);
    host.hidden = !active;
    const node = surface.current;
    if (!node || !active) {
      previous.current = null;
      pendingBounds.current = null;
      return;
    }
    const bounds = node.getBoundingClientRect();
    const from = pendingBounds.current ?? previous.current;
    pendingBounds.current = null;
    // Deform only the material. Labels and touch targets stay sharp and full size.
    if (
      from?.width &&
      bounds.width &&
      !reduceMotion() &&
      typeof node.animate === "function" &&
      (Math.abs(from.width - bounds.width) > 1 ||
        Math.abs(from.height - bounds.height) > 1)
    ) {
      animation.current?.cancel();
      const material = node.querySelector<HTMLElement>(".thumb-dock-material")!;
      animation.current = material.animate(
        [
          {
            transform: `translateY(${from.bottom - bounds.bottom}px) scale(${from.width / bounds.width}, ${from.height / bounds.height})`,
            borderRadius: "30px",
          },
          {
            transform: "scale(1.018, .982)",
            borderRadius: "32px",
            offset: 0.7,
          },
          { transform: "scale(1, 1)", borderRadius: "28px" },
        ],
        { duration: 480, easing: "cubic-bezier(.22,.8,.28,1)" },
      );
      void animation.current.finished.catch(() => undefined);
    }
    previous.current = bounds;
  });
  useLayoutEffect(
    () => () => {
      animation.current?.cancel();
      host.remove();
    },
    [host],
  );
  return (
    <Registry.Provider value={registry}>
      <Actions.Provider value={actions}>
        {children}
        {createPortal(
          <DockNavigationContext.Provider value={active?.navigation ?? null}>
            <div
              ref={surface}
              className="thumb-dock"
              data-mode={visible?.mode ?? "browse"}
              inert={active?.disabled}
            >
              <div className="thumb-dock-material" aria-hidden="true" />
              <div className="thumb-dock-content" key={visible?.mode}>
                {visible?.content}
              </div>
            </div>
          </DockNavigationContext.Provider>,
          host,
        )}
      </Actions.Provider>
    </Registry.Provider>
  );
}

function useEntry(scope: Entry["scope"], value: Entry["value"]) {
  const registry = useContext(Registry);
  const id = useId();
  // Registry methods are stable: publishing updates the host, not the authoring tree.
  useLayoutEffect(() => {
    registry?.put(id, scope, value);
  });
  useLayoutEffect(() => () => registry?.remove(id), [id, registry]);
}
export function ThumbDock({
  children,
  ...entry
}: PropsWithChildren<Omit<DockEntry, "content">>) {
  useEntry("dock", { ...entry, content: children });
  return null;
}
export function ThumbAction({ children }: PropsWithChildren) {
  const id = useId();
  useEntry(
    "action",
    <span className="thumb-action" key={id}>
      {children}
    </span>,
  );
  return null;
}
export function ThumbActions() {
  return <>{useContext(Actions)}</>;
}

/** Separate surfaces for the current screen's back, primary and icon actions. */
export function ContextDock({
  back,
  primary,
  actions,
}: {
  back?: ReactNode;
  primary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="context-dock">
      {back && <div className="context-island context-back">{back}</div>}
      <div className={`context-primary${primary ? " context-island" : ""}`}>
        {primary}
      </div>
      {actions && (
        <div className="context-island context-actions">{actions}</div>
      )}
    </div>
  );
}

type SaveAction = { formId: string; busy: boolean };
export const ThumbFormContext = createContext<
  ((action: SaveAction | null) => void) | null
>(null);
export function useThumbForm(
  button: React.RefObject<HTMLButtonElement | null>,
  busy: boolean,
) {
  const register = useContext(ThumbFormContext);
  const id = useId();
  useLayoutEffect(() => {
    const form = button.current?.form;
    if (!form || !register) return;
    const previousId = form.id;
    form.id ||= `thumb-form-${id}`;
    register({ formId: form.id, busy });
    return () => {
      register(null);
      form.id = previousId;
    };
  }, [register, id, busy, button]);
}
