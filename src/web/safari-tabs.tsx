import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Link, NavLink, useLocation } from "react-router";
import {
  ArrowLeft,
  BookOpen,
  ListChecks,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  Ticket,
} from "lucide-react";

export const tripTabs = [
  { path: "itinerary", label: "しおり", icon: BookOpen },
  { path: "places", label: "行きたい場所", icon: MapPin },
  { path: "packing", label: "準備", icon: ListChecks },
  { path: "bookings", label: "予約", icon: Ticket },
  { path: "notes", label: "メモ", icon: NotebookPen },
];

/** The same five icons spread out; compact mode is one generous touch target. */
export function SafariTabs({
  tripId,
  onMenu,
}: {
  tripId: string;
  onMenu: () => void;
}) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const id = useId();
  const active = tripTabs.findIndex((tab) =>
    location.pathname.endsWith(`/${tab.path}`),
  );
  const collapse = () => {
    restoreFocus.current = true;
    setExpanded(false);
  };
  useEffect(() => {
    if (!expanded) {
      if (restoreFocus.current) trigger.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
      return;
    }
    (
      nav.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]') ??
      nav.current?.querySelector<HTMLAnchorElement>("a")
    )?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      collapse();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [expanded]);
  return (
    <>
      {expanded && (
        <button
          className="safari-dismiss"
          aria-label="タブ選択を閉じる"
          tabIndex={-1}
          onClick={collapse}
        />
      )}
      <div className="safari-dock" data-expanded={expanded}>
        <span className="safari-circle safari-left" aria-hidden="true" />
        <span className="safari-circle safari-right" aria-hidden="true" />
        <span className="safari-bridge safari-left" aria-hidden="true" />
        <span className="safari-bridge safari-right" aria-hidden="true" />
        <div
          className="safari-side safari-left"
          inert={expanded}
          aria-hidden={expanded}
        >
          <Link
            to="/"
            className="safari-side-button"
            aria-label="旅行一覧へ戻る"
          >
            <ArrowLeft size={22} />
          </Link>
        </div>
        <div
          className="safari-side safari-right"
          inert={expanded}
          aria-hidden={expanded}
        >
          <button
            className="safari-side-button"
            aria-label="旅行メニュー"
            onClick={onMenu}
          >
            <MoreHorizontal size={24} />
          </button>
        </div>
        <div className="safari-center">
          <div className="safari-material" aria-hidden="true" />
          <nav
            ref={nav}
            id={id}
            className="safari-tabs"
            aria-label="旅行のページ"
            inert={!expanded}
            style={{ "--active-tab": active } as CSSProperties}
          >
            {tripTabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={`/trips/${tripId}/${tab.path}`}
                tabIndex={expanded ? 0 : -1}
                onClick={collapse}
              >
                <tab.icon size={21} />
                <span>{tab.label}</span>
              </NavLink>
            ))}
          </nav>
          <button
            ref={trigger}
            className="safari-expand"
            aria-label={`ページを切り替え（現在：${tripTabs[active]?.label ?? "メンバー"}）`}
            aria-expanded={expanded}
            aria-controls={id}
            tabIndex={expanded ? -1 : 0}
            onClick={() => {
              setExpanded(true);
            }}
          />
        </div>
      </div>
    </>
  );
}
