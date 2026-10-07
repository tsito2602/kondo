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
import { CartoonDock, DOCK_MOVED, DockGroup } from "./cartoon-dock";
import { UpdateNotice } from "./app-update";
import { spring } from "./cartoon";

type DockEntry = {
  content: ReactNode;
  mode: "browse" | "detail" | "edit" | "context" | "toast";
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
type AddAction = { label: string; onClick: () => void };
type Entry = {
  value: DockEntry | AddAction | ReactNode;
  order: number;
  scope: "dock" | "action" | "add";
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
  // The update notice follows the dock into each sheet's top layer.
  const [noticeHost] = useState(() =>
    Object.assign(document.createElement("div"), {
      className: "update-notice-host",
    }),
  );
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
  const add = ordered.filter((entry) => entry.scope === "add").at(-1)?.value as
    AddAction | undefined;
  // The ＋ pops in (kondo-cartoon's popIn: from .4, k380 d13) whenever it
  // appears or a screen swaps in its own add action.
  const addButton = useRef<HTMLButtonElement>(null);
  const addLabel = add?.label;
  useLayoutEffect(() => {
    if (!addLabel || !addButton.current) return;
    spring(
      addButton.current,
      [
        { transform: "scale(.4)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { k: 380, d: 13 },
      { delay: 110, fill: "backwards" },
    );
  }, [addLabel]);
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
    if (host.parentElement !== parent) {
      parent.appendChild(host);
      // WebKit can leave a moved SVG unpainted (the islands vanish under a
      // dialog opened over another one); ask the dock to redraw itself.
      window.dispatchEvent(new window.Event(DOCK_MOVED));
    }
    if (noticeHost.parentElement !== parent) parent.appendChild(noticeHost);
    host.hidden = !active;
  });
  useLayoutEffect(
    () => () => {
      host.remove();
      noticeHost.remove();
    },
    [host, noticeHost],
  );
  return (
    <Registry.Provider value={registry}>
      <Actions.Provider value={actions}>
        {children}
        {createPortal(
          <button
            ref={addButton}
            type="button"
            className="floating-add persistent-add"
            hidden={!add}
            aria-label={add?.label}
            onClick={add?.onClick}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            </svg>
          </button>,
          document.body,
        )}
        {createPortal(
          <SharedDockSurfaceContext.Provider value={true}>
            <DockNavigationContext.Provider value={active?.navigation ?? null}>
              <div
                className="thumb-dock"
                data-mode={visible?.mode ?? "browse"}
                inert={active?.disabled}
              >
                <CartoonDock
                  identity={`${activeEntry?.order}:${visible?.mode}`}
                >
                  {visible?.content}
                </CartoonDock>
              </div>
            </DockNavigationContext.Provider>
          </SharedDockSurfaceContext.Provider>,
          host,
        )}
        {createPortal(<UpdateNotice />, noticeHost)}
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
/** The mobile button stays mounted while each page supplies its current action. */
export function FloatingAddAction(props: AddAction) {
  useEntry("add", props);
  return null;
}
export function ThumbActions() {
  return <>{useContext(Actions)}</>;
}

/** The current screen's controls on the cartoon dock's islands: the back
    circle on the left island, the context actions on the right one. A lone
    primary (保存, 追加する) turns its island ink; next to other actions it is
    an ink pill on a plain island. A separate function (しおりで見る, 詳細を開く)
    gets its own island between them (Tsubasa 2026-10-06: 「別機能は別の島に」). */
export function ContextDock({
  back,
  primary,
  actions,
  secondary,
  wide,
  primaryFirst,
}: {
  back?: ReactNode;
  /** The primary leads the actions (保存 left of 削除, Tsubasa 2026-10-07). */
  primaryFirst?: boolean;
  primary?: ReactNode;
  actions?: ReactNode;
  /** Its own island left of the actions; only beside actions. */
  secondary?: ReactNode;
  /** Lay the actions out like the tab row (left 90 px to the right edge). */
  wide?: boolean;
}) {
  return (
    <>
      {back && (
        <DockGroup slot="l" className="context-back">
          {back}
        </DockGroup>
      )}
      {secondary && (primary || actions) && (
        <DockGroup slot="m" className="context-secondary">
          {secondary}
        </DockGroup>
      )}
      {(primary || actions) && (
        <DockGroup
          slot="r"
          className="context-actions"
          tone={primary && !actions ? "ink" : undefined}
          mixed={primary && actions ? (primaryFirst ? "first" : true) : false}
          wide={wide}
        >
          {primaryFirst && primary}
          {actions}
          {!primaryFirst && primary}
        </DockGroup>
      )}
    </>
  );
}

/** The undo toast (kondo-cartoon §5): the islands run together into one with
    a bump, holding what happened and 「元に戻す」; leaving it tears them apart.
    With `back`, the back circle stays and the toast takes the right island. */
export function DockToast({
  message,
  onUndo,
  undoLabel = "元に戻す",
  back,
}: {
  message: ReactNode;
  onUndo: () => void;
  undoLabel?: string;
  back?: ReactNode;
}) {
  return (
    <>
      {back && (
        <DockGroup slot="l" className="context-back">
          {back}
        </DockGroup>
      )}
      <DockGroup slot="toast" className={back ? "cdock-toast-r" : undefined}>
        <span role="status">{message}</span>
        <button type="button" onClick={onUndo}>
          {undoLabel}
        </button>
      </DockGroup>
    </>
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
