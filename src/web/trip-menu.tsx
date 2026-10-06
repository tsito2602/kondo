import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Check,
  Download,
  Pencil,
  RefreshCw,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { useTravel } from "@/data/travel-provider";
import { AnchoredMenu } from "./anchored-menu";
import { TripEditor } from "./editors";
import { useAction, useToast } from "./ui";

// The trip's … menu (メンバー管理, 旅行を編集, オフライン保存, 設定, 旅行を削除
// and the sync line). No mock draws a shared trip header, so a screen places
// this button in its own header (the しおり screen does; wide layouts keep it
// in TripLayout's header).

function SyncStatus() {
  const { syncing, pendingCount, error, sync } = useTravel();
  const { isDemo } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <button
      className={`sync-status ${error && online ? "warning" : ""}`}
      onClick={() => void sync()}
      title={error ?? "同期する"}
    >
      {syncing || pendingCount || error || !online ? (
        <RefreshCw size={12} className={syncing ? "spin" : ""} />
      ) : (
        <Check size={12} />
      )}
      <span>
        {isDemo
          ? "この端末に保存"
          : syncing
            ? "同期中"
            : !online
              ? `オフライン${pendingCount ? ` · ${pendingCount}件待ち` : ""}`
              : pendingCount
                ? `${pendingCount}件の変更を同期待ち`
                : error
                  ? "同期を再試行"
                  : "同期済み"}
      </span>
    </button>
  );
}

/** The mocks' mono line under the trip name (kondo-itinerary #tripSub):
    "10/19(月) – 10/23(金) · 5日間 · 2人", or while travelling
    "旅行中 · 3日目 · 10/21(水)". */
export function tripSpan(
  trip: { startsOn: string; endsOn: string; memberCount: number },
  today = new Date(),
) {
  const at = (iso: string) => new Date(`${iso}T00:00:00`);
  const md = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}(${"日月火水木金土"[d.getDay()]})`;
  const start = at(trip.startsOn),
    end = at(trip.endsOn);
  const day = (d: Date) => Math.round((d.getTime() - start.getTime()) / 864e5);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (now >= start && now <= end)
    return `旅行中 · ${day(now) + 1}日目 · ${md(now)}`;
  return `${md(start)} – ${md(end)} · ${day(end) + 1}日間 · ${trip.memberCount}人`;
}

/** The … button and its menu for one trip. */
export function TripMenuButton({ tripId }: { tripId: string }) {
  const travel = useTravel();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useToast();
  const { busy, run } = useAction();
  const [menu, setMenu] = useState(false);
  const menuTrigger = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState("");
  const trip = travel.trips.find((trip) => trip.id === tripId);
  if (!trip) return null;
  return (
    <>
      <div ref={menuTrigger} className="trip-menu-anchor" />
      <AnchoredMenu
        anchor={menuTrigger}
        open={menu}
        onOpen={() => setMenu(true)}
        onClose={() => setMenu(false)}
      >
        {(closeMenu) => (
          <>
            <div className="menu-list">
              <button
                onClick={() => {
                  closeMenu(() => {
                    navigate(`/trips/${trip.id}/members`, {
                      state: { background: location },
                    });
                  });
                }}
              >
                <Users />
                メンバー管理
              </button>
              {travel.canEdit && (
                <button
                  onClick={() => {
                    closeMenu(() => {
                      setEditing(true);
                    });
                  }}
                >
                  <Pencil />
                  旅行を編集
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const count = await travel.saveTripOffline((done, total) =>
                      setProgress(`${done} / ${total}件の書類を保存中`),
                    );
                    setProgress("");
                    notify(`旅行と${count}件の書類をオフライン保存しました`);
                  })
                }
              >
                <Download />
                オフライン保存
              </button>
              {progress && <p role="status">{progress}</p>}
              <button
                onClick={() =>
                  closeMenu(() =>
                    navigate("/settings", {
                      state: {
                        returnTo: location.pathname,
                        background: location,
                      },
                    }),
                  )
                }
              >
                <Settings />
                設定
              </button>
              {trip.role === "owner" && (
                <button
                  disabled={busy}
                  className="danger"
                  onClick={() =>
                    void run(async () => {
                      if (
                        confirm(
                          `「${trip.name}」と旅行内のすべてのデータを削除しますか？この操作は取り消せません。`,
                        )
                      ) {
                        await travel.deleteTrip(trip.id);
                        navigate("/");
                      }
                    })
                  }
                >
                  <Trash2 />
                  旅行を削除
                </button>
              )}
            </div>
            <div className="trip-menu-sync">
              <SyncStatus />
            </div>
          </>
        )}
      </AnchoredMenu>
      {editing && <TripEditor trip={trip} onClose={() => setEditing(false)} />}
    </>
  );
}
