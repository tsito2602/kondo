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
import { DockContent } from "./dock-content";
import { FluidDockSurface, type FluidDockHandle } from "./fluid-dock";

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
export const SharedDockSurfaceContext = createContext(false);
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
  const morph = useRef<FluidDockHandle>(null);
  const registry = useMemo(() => {
    return {
      put: (id: string, scope: Entry["scope"], value: Entry["value"]) => {
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
        setEntries((old) => {
          const next = new Map(old);
          next.delete(id);
          return next;
        });
      },
    };
  }, []);
  const ordered = [...entries.values()].sort((a, b) => a.order - b.order);
  const activeEntry = ordered.filter((entry) => entry.scope === "dock").at(-1);
  const active = activeEntry?.value as DockEntry | undefined;
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
    if (active) morph.current?.measure();
  });
  useLayoutEffect(
    () => () => {
      host.remove();
    },
    [host],
  );
  return (
    <Registry.Provider value={registry}>
      <Actions.Provider value={actions}>
        {children}
        {createPortal(
          <SharedDockSurfaceContext.Provider value={true}>
            <DockNavigationContext.Provider value={active?.navigation ?? null}>
              <div
                ref={surface}
                className="thumb-dock"
                data-mode={visible?.mode ?? "browse"}
                inert={active?.disabled}
              >
                <FluidDockSurface root={surface} ref={morph} />
                <DockContent
                  identity={`${activeEntry?.order}:${visible?.mode}`}
                  mode={visible?.mode ?? "browse"}
                >
                  {visible?.content}
                </DockContent>
              </div>
            </DockNavigationContext.Provider>
          </SharedDockSurfaceContext.Provider>,
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
