import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { MapPin } from "lucide-react";
import { PageTop } from "./page-top";
import { useTravel } from "@/data/travel-provider";
import {
  placeNumbers,
  placeVisits,
  type PlaceVisit,
} from "@/data/place-numbers";
import { ordinaryPlans } from "@/data/itinerary";
import {
  mapCoordinates,
  placeCoordinates,
  type Coordinates,
} from "@/data/places";
import {
  distanceMeters,
  formatMeters,
  mercator,
  metersPerUnit,
  walkMinutes,
} from "@/data/place-geo";
import { localDate } from "@/utils/dates";
import type { Booking, ItineraryItem, Place } from "@/data/types";
import { AddButton, Empty } from "./ui";
import { ItemEditor, PlaceEditor } from "./editors";
import { BookingDetail, PlaceDetail } from "./details";
import { reduceMotion } from "./motion";
import { boing, hop, sink } from "./places-motion";
import { useJellyScroll } from "./jelly-scroll";
import { PlaceSheet, placeMapsHref } from "./place-sheet";

/* ---------- model ---------- */

type Mark = {
  key: string;
  name: string;
  type: "hotel" | "plan" | "cand";
  point: Coordinates | null;
  number?: number;
  place?: Place;
  item?: ItineraryItem;
  booking?: Booking;
  /** When a numbered place is scheduled: its plan, or its linked booking. */
  when?: PlaceVisit;
};
type View = { cx: number; cy: number; k: number };

const MAP_HEIGHT = 420;
const JELLY_ITEMS = ".places-map, .places-honest, .places-list h3, .places-row";
const PAD = 52;
// Day tones for 全日程: pale, ink, dark, repeating for longer trips.
const TONES = ["var(--pl-t2)", "var(--pl-ink)", "var(--pl-t4)"];
const shortDate = (day: string) =>
  `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
const dayNumber = (start: string, day: string) =>
  Math.round((Date.parse(day) - Date.parse(start)) / 86400000) + 1;
const timeKey = (when: PlaceVisit) =>
  `${when.day} ${when.time || "99:99"} ${when.key}`;

function usePlacesModel() {
  const travel = useTravel();
  const trip = travel.selectedTrip!;
  return useMemo(() => {
    // Hotel in/out records are the しおり's own; the map shows plans only.
    const schedule = ordinaryPlans(travel.items);
    // A place linked to a booking is scheduled at the booking's time.
    const numbers = placeNumbers(travel.places, schedule, travel.bookings);
    const visits = placeVisits(travel.places, schedule, travel.bookings);
    const marks: Mark[] = travel.places
      .map((place) => {
        const when = visits.get(place.id);
        return {
          key: `place:${place.id}`,
          name: place.title,
          type: when ? ("plan" as const) : ("cand" as const),
          point: placeCoordinates(place),
          number: numbers.get(place.id),
          place,
          item: when?.item,
          when,
        };
      })
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    const hotels: Mark[] = travel.bookings
      .filter((booking) => booking.kind === "hotel")
      .map((booking) => ({
        key: `hotel:${booking.id}`,
        name: booking.title,
        type: "hotel" as const,
        point: mapCoordinates(booking.location),
        booking,
      }))
      .filter((hotel) => hotel.point)
      .sort((a, b) => a.booking!.day.localeCompare(b.booking!.day));
    const plans = marks
      .filter((mark) => mark.when)
      .sort((a, b) => timeKey(a.when!).localeCompare(timeKey(b.when!)));
    const days = [...new Set(plans.map((mark) => mark.when!.day))].sort();
    /** The stay the day starts from: the night before, else the check-in. */
    const hotelFor = (day: string) =>
      hotels.find(
        (hotel) =>
          hotel.booking!.day < day &&
          day <= (hotel.booking!.endDay || hotel.booking!.day),
      ) ??
      hotels.find((hotel) => hotel.booking!.day === day) ??
      null;
    return {
      marks,
      hotels,
      plans,
      candidates: marks.filter((mark) => mark.type === "cand"),
      days,
      hotelFor,
      tone: (day: string) => TONES[days.indexOf(day) % TONES.length],
      byKey: new Map([...marks, ...hotels].map((mark) => [mark.key, mark])),
      start: trip.startsOn,
      count: travel.places.length,
    };
  }, [travel.places, travel.items, travel.bookings, trip.startsOn]);
}
type Model = ReturnType<typeof usePlacesModel>;

/** The stop before a plan on its day: the previous plan, else the stay. */
function previousStop(model: Model, mark: Mark) {
  const day = mark.when!.day;
  const index = model.plans.findIndex((plan) => plan.key === mark.key);
  const before = model.plans[index - 1];
  return before && before.when!.day === day ? before : model.hotelFor(day);
}

/* ---------- screen ---------- */

export function PlacesScreen() {
  const travel = useTravel();
  const model = usePlacesModel();
  const [day, setDay] = useState(() => {
    const today = localDate();
    return model.days.includes(today) ? today : (model.days[0] ?? "all");
  });
  const activeDay = day === "all" || model.days.includes(day) ? day : "all";
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Mark | null>(null);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState<Place | null>(null);
  const mapRef = useRef<PlacesMapHandle>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  // The map, the note and the list trail a fast scroll and settle (jelly scroll).
  useJellyScroll(pageRef, JELLY_ITEMS);
  const selectedMark = selected ? model.byKey.get(selected) : undefined;

  const select = useCallback(
    (key: string | null, from: "map" | "list" = "map") => {
      setSelected(key);
      if (key && from === "list") mapRef.current?.reveal(key);
    },
    [],
  );

  if (!model.count && !model.hotels.length)
    return (
      <div className="page places-page">
        <PageTop tab="places" title="行きたい場所" />
        {travel.canEdit && (
          <AddButton label="場所を追加" onClick={() => setAdding(true)} />
        )}
        <Empty>
          <MapPin />
          <h2>場所はまだありません</h2>
          <p>訪れたい場所を追加できます。</p>
        </Empty>
        {adding && <PlaceEditor onClose={() => setAdding(false)} />}
      </div>
    );

  return (
    <div className="page places-page" ref={pageRef}>
      <PageTop tab="places" title="行きたい場所" />
      {travel.canEdit && (
        <AddButton label="場所を追加" onClick={() => setAdding(true)} />
      )}
      <div className="places-head">
        {model.days.length > 0 && (
          <div className="places-chips" role="group" aria-label="表示する日">
            {["all", ...model.days].map((entry) => (
              <button
                key={entry}
                aria-pressed={activeDay === entry}
                onClick={() => {
                  setDay(entry);
                  setSelected(null);
                }}
              >
                {entry !== "all" && (
                  <i
                    style={{ color: model.tone(entry) } as CSSProperties}
                    aria-hidden="true"
                  />
                )}
                {entry === "all" ? "全日程" : shortDate(entry)}
              </button>
            ))}
          </div>
        )}
      </div>
      <PlacesMap
        ref={mapRef}
        model={model}
        day={activeDay}
        selected={selected}
        onSelect={select}
      />
      <p className="places-honest">
        距離と時間は直線距離からの目安です（直線 × 1.3
        を時速4.8kmで歩いた場合）。道案内はGoogleマップで。
      </p>
      <PlacesList
        model={model}
        day={activeDay}
        selected={selected}
        onSelect={(mark) =>
          mark.point ? select(mark.key, "list") : setDetail(mark)
        }
      />
      {selectedMark && (
        <PlaceSheetFor
          key={selectedMark.key}
          model={model}
          mark={selectedMark}
          day={activeDay}
          canEdit={travel.canEdit}
          onClose={() => setSelected(null)}
          onOpen={() => setDetail(selectedMark)}
          onSchedule={() => setScheduling(selectedMark.place!)}
        />
      )}
      {scheduling && (
        <ItemEditor place={scheduling} onClose={() => setScheduling(null)} />
      )}
      {adding && <PlaceEditor onClose={() => setAdding(false)} />}
      {detail?.place && (
        <PlaceDetail id={detail.place.id} onClose={() => setDetail(null)} />
      )}
      {detail?.booking && (
        <BookingDetail id={detail.booking.id} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

/* ---------- map ---------- */

type PlacesMapHandle = { reveal: (key: string) => void };
type Edge = { x: number; y: number; angle: number; marks: Mark[] };

function PinShape({ mark }: { mark: Mark }) {
  return (
    <svg viewBox="0 0 34 44" aria-hidden="true">
      <path
        className="places-pin-body"
        d="M17 2a15 15 0 0 1 15 15c0 11-15 25-15 25S2 28 2 17A15 15 0 0 1 17 2z"
      />
      {mark.type === "hotel" ? (
        <path
          className="places-pin-house"
          d="M10 18 L17 11.5 L24 18 V24 H10Z"
        />
      ) : (
        <text className="places-pin-num" x="17" y="21.5">
          {mark.number}
        </text>
      )}
    </svg>
  );
}

function PlacesMap({
  ref,
  model,
  day,
  selected,
  onSelect,
}: {
  ref: Ref<PlacesMapHandle>;
  model: Model;
  day: string;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  const W = width;
  const H = MAP_HEIGHT;

  // Places on the map for this view: the day's plans and stay, plus every candidate.
  const shown = useMemo(() => {
    const plans = model.plans.filter(
      (mark) => mark.point && (day === "all" || mark.when!.day === day),
    );
    const hotels =
      day === "all"
        ? model.hotels
        : [model.hotelFor(day)].filter((hotel): hotel is Mark => !!hotel);
    const candidates = model.candidates.filter((mark) => mark.point);
    return {
      anchors: [...hotels, ...plans],
      all: [...hotels, ...plans, ...candidates],
    };
  }, [model, day]);
  const merc = useMemo(
    () =>
      new Map(
        [...model.byKey.values()]
          .filter((mark) => mark.point)
          .map((mark) => [mark.key, mercator(mark.point!)]),
      ),
    [model],
  );
  const latC = useMemo(() => {
    const points = shown.all.map((mark) => mark.point!.lat);
    return points.length
      ? points.reduce((a, b) => a + b, 0) / points.length
      : 0;
  }, [shown]);
  const unit = metersPerUnit(latC);
  const kMax = 120 / (180 / unit); // closest zoom: 180 m ≈ 120 px

  const fitTo = useCallback(
    (keys: string[]): View => {
      const pts = keys.map((key) => merc.get(key)!).filter(Boolean);
      if (!pts.length) return { cx: 0, cy: 0, k: 1 };
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const [x0, x1, y0, y1] = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
      ];
      const k = Math.min(
        kMax,
        (W - PAD * 2) / Math.max(1e-9, x1 - x0),
        (H - PAD * 2 - 20) / Math.max(1e-9, y1 - y0),
      );
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 + 10 / k, k };
    },
    [merc, kMax, W, H],
  );
  const fitKeys = (shown.anchors.length ? shown.anchors : shown.all).map(
    (mark) => mark.key,
  );
  const fitted = useMemo(
    () => fitTo(fitKeys),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitTo, fitKeys.join("|")],
  );
  // A new day (or a changed width or data) frames its places again.
  const [camera, setCamera] = useState({ base: fitted, view: fitted });
  const view = camera.base === fitted ? camera.view : fitted;
  const viewRef = useRef(view);
  viewRef.current = view;
  const fittedRef = useRef(fitted);
  fittedRef.current = fitted;
  const setView = useCallback(
    (next: View) => setCamera({ base: fittedRef.current, view: next }),
    [],
  );
  const flight = useRef(0);
  useEffect(() => cancelAnimationFrame(flight.current), [fitted]);

  useLayoutEffect(() => {
    const element = mapEl.current!;
    const observer = new ResizeObserver(() =>
      setWidth(Math.round(element.clientWidth) || 358),
    );
    observer.observe(element);
    setWidth(Math.round(element.clientWidth) || 358);
    return () => observer.disconnect();
  }, []);

  const toPx = (key: string, v = view) => {
    const p = merc.get(key)!;
    return { x: (p.x - v.cx) * v.k + W / 2, y: -(p.y - v.cy) * v.k + H / 2 };
  };

  /* camera moves ease out over 520ms */
  const goTo = useCallback(
    (target: View, then?: () => void) => {
      cancelAnimationFrame(flight.current);
      if (reduceMotion()) {
        setView(target);
        then?.();
        return;
      }
      const from = { ...viewRef.current };
      const t0 = performance.now();
      const lk0 = Math.log(from.k);
      const lk1 = Math.log(target.k);
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / 520);
        const e = 1 - Math.pow(1 - t, 3);
        setView({
          cx: from.cx + (target.cx - from.cx) * e,
          cy: from.cy + (target.cy - from.cy) * e,
          k: Math.exp(lk0 + (lk1 - lk0) * e),
        });
        if (t < 1) flight.current = requestAnimationFrame(step);
        else then?.();
      };
      flight.current = requestAnimationFrame(step);
    },
    [setView],
  );
  useEffect(() => () => cancelAnimationFrame(flight.current), []);

  // Bring a chosen place into the part of the map the card leaves free.
  const centerOn = useCallback(
    (key: string) => {
      const p = merc.get(key);
      if (!p) return;
      const v = viewRef.current;
      const q = {
        x: (p.x - v.cx) * v.k + W / 2,
        y: -(p.y - v.cy) * v.k + H / 2,
      };
      if (q.x < 40 || q.x > W - 40 || q.y < 60 || q.y > H - 40)
        goTo({ ...v, cx: p.x, cy: p.y });
    },
    [merc, W, H, goTo],
  );
  const pinEls = useRef(new Map<string, HTMLButtonElement>());
  useImperativeHandle(
    ref,
    () => ({
      reveal: (key: string) => {
        mapEl.current?.scrollIntoView?.({
          block: "nearest",
          behavior: reduceMotion() ? "instant" : "smooth",
        });
        centerOn(key);
      },
    }),
    [centerOn],
  );
  useEffect(() => {
    if (!selected) return;
    centerOn(selected);
    const pin = pinEls.current.get(selected);
    if (pin) hop(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /* pins and the edge arrows for places outside the frame */
  const pins = shown.all.map((mark) => {
    const q = toPx(mark.key);
    const inside = q.x > 8 && q.x < W - 8 && q.y > 30 && q.y < H - 4;
    return { mark, q, inside };
  });
  const edges: Edge[] = [];
  for (const { mark, q, inside } of pins) {
    if (inside) continue;
    const cx = W / 2;
    const cy = H / 2;
    const dx = q.x - cx;
    const dy = q.y - cy;
    const inset = 15;
    const t = Math.min(
      (W / 2 - inset - 10) / Math.abs(dx || 1e-9),
      (H / 2 - inset) / Math.abs(dy || 1e-9),
    );
    let x = cx + dx * t;
    let y = Math.max(inset, Math.min(H - 44, cy + dy * t));
    // keep clear of the compass, the scale bar and 全体を表示
    if (y < 56 && x > W - 66) x = W - 66;
    if (y > H - 50 && x < 92) x = 92;
    if (y > H - 50 && x > W - 132) x = W - 132;
    const near = edges.find((edge) => Math.hypot(edge.x - x, edge.y - y) < 34);
    if (near) near.marks.push(mark);
    else
      edges.push({
        x,
        y,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        marks: [mark],
      });
  }

  /* labels: placed greedily (selected, stay, plans, candidates); flip sides or hide on collision */
  useLayoutEffect(() => {
    const root = mapEl.current;
    if (!root) return;
    type Box = { x: number; y: number; w: number; h: number };
    const boxes: Box[] = [];
    const hit = (r: Box) =>
      boxes.some(
        (b) =>
          r.x < b.x + b.w &&
          r.x + r.w > b.x &&
          r.y < b.y + b.h &&
          r.y + r.h > b.y,
      );
    root.querySelectorAll<HTMLElement>(".places-edge").forEach((edge) => {
      const x = parseFloat(edge.style.left);
      const y = parseFloat(edge.style.top);
      const w = edge.offsetWidth || 40;
      boxes.push({ x: x - w / 2 - 3, y: y - 16, w: w + 6, h: 32 });
    });
    const visible = pins.filter((pin) => pin.inside);
    visible.forEach(({ q }) =>
      boxes.push({ x: q.x - 12, y: q.y - 42, w: 24, h: 40 }),
    );
    const rank = (mark: Mark) =>
      mark.key === selected
        ? 0
        : mark.type === "hotel"
          ? 1
          : mark.type === "plan"
            ? 2
            : 3;
    [...visible]
      .sort((a, b) => rank(a.mark) - rank(b.mark))
      .forEach(({ mark, q }) => {
        const label = pinEls.current
          .get(mark.key)
          ?.querySelector<HTMLElement>(".places-pin-label");
        if (!label) return;
        const w = label.offsetWidth || mark.name.length * 12 + 16;
        const right = { x: q.x + 13, y: q.y - 43, w, h: 20 };
        const left = { x: q.x - 13 - w, y: q.y - 43, w, h: 20 };
        const order = q.x + 13 + w > W - 6 ? [left, right] : [right, left];
        const pick =
          order.find((r) => r.x > 2 && r.x + r.w < W - 2 && !hit(r)) ??
          (mark.key === selected ? order[0] : null);
        label.dataset.side = pick === left ? "left" : "right";
        label.style.opacity = pick ? "1" : "0";
        if (pick) boxes.push(pick);
      });
  });

  /* a new day: pins sink in one by one, then the edge arrows arrive */
  useLayoutEffect(() => {
    const root = mapEl.current;
    if (!root) return;
    let index = 0;
    for (const pin of pins) {
      const element = pinEls.current.get(pin.mark.key);
      if (!element || !pin.inside) continue;
      const delay = 120 + index++ * 70;
      sink(element, delay);
      // As in kondo-cartoon.html (7): a label springs out once its pin has landed.
      const label = element.querySelector<HTMLElement>(".places-pin-label");
      if (label && label.style.opacity !== "0")
        boing(
          label,
          [
            { transform: "scale(.4)", opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          delay + 400,
        );
    }
    root.querySelectorAll(".places-edge").forEach((edge) =>
      boing(
        edge,
        [
          { transform: "translate(-50%,-50%) scale(.3)", opacity: 0 },
          { transform: "translate(-50%,-50%)", opacity: 1 },
        ],
        500,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  /* drag, pinch and wheel */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    view: View;
    pts: Map<number, { x: number; y: number }>;
  } | null>(null);
  const dragged = useRef(false);
  const local = (event: { clientX: number; clientY: number }) => {
    const rect = mapEl.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    if (
      (event.target as Element).closest(
        ".places-pin, .places-edge, .places-refit",
      )
    )
      return;
    mapEl.current!.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
    gesture.current = {
      view: { ...viewRef.current },
      pts: new Map(pointers.current),
    };
    dragged.current = false;
    cancelAnimationFrame(flight.current);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, local(event));
    const start = gesture.current;
    const s = [...start.pts.values()];
    const c = [...pointers.current.values()];
    if (s.length === 1 && c.length === 1) {
      const dx = c[0].x - s[0].x;
      const dy = c[0].y - s[0].y;
      if (Math.hypot(dx, dy) > 4) {
        dragged.current = true;
        mapEl.current!.classList.add("is-dragging");
      }
      setView({
        ...start.view,
        cx: start.view.cx - dx / start.view.k,
        cy: start.view.cy + dy / start.view.k,
      });
    } else if (s.length >= 2 && c.length >= 2) {
      dragged.current = true;
      const d0 = Math.hypot(s[0].x - s[1].x, s[0].y - s[1].y);
      const d1 = Math.hypot(c[0].x - c[1].x, c[0].y - c[1].y);
      const m0 = { x: (s[0].x + s[1].x) / 2, y: (s[0].y + s[1].y) / 2 };
      const m1 = { x: (c[0].x + c[1].x) / 2, y: (c[0].y + c[1].y) / 2 };
      const k = Math.max(
        start.view.k / 6,
        Math.min(kMax * 2, (start.view.k * d1) / d0),
      );
      const ax = start.view.cx + (m0.x - W / 2) / start.view.k;
      const ay = start.view.cy - (m0.y - H / 2) / start.view.k;
      setView({ k, cx: ax - (m1.x - W / 2) / k, cy: ay + (m1.y - H / 2) / k });
    }
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId);
    gesture.current = pointers.current.size
      ? { view: { ...viewRef.current }, pts: new Map(pointers.current) }
      : null;
    mapEl.current?.classList.remove("is-dragging");
    setTimeout(() => (dragged.current = false), 0);
  };
  useEffect(() => {
    const element = mapEl.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const p = local(event);
      const v = viewRef.current;
      const k = Math.max(
        fitted.k / 6,
        Math.min(kMax * 2, v.k * Math.exp(-event.deltaY * 0.0016)),
      );
      const ax = v.cx + (p.x - W / 2) / v.k;
      const ay = v.cy - (p.y - H / 2) / v.k;
      setView({ k, cx: ax - (p.x - W / 2) / k, cy: ay + (p.y - H / 2) / k });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [fitted.k, kMax, W, H]);

  /* dotted grid moves with the map; the scale bar follows the zoom */
  const grid = 24;
  const ox = (-view.cx * view.k + W / 2) % grid;
  const oy = (view.cy * view.k + H / 2) % grid;
  const mPerPx = unit / view.k;
  const nice =
    [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000].find(
      (value) => value / mPerPx >= 56,
    ) ?? 5000;
  const moved =
    Math.abs(view.k / fitted.k - 1) > 0.04 ||
    Math.hypot(view.cx - fitted.cx, view.cy - fitted.cy) * view.k > 14;

  return (
    <div
      ref={mapEl}
      className="places-map"
      role="group"
      aria-label="場所の地図"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => {
        if (!dragged.current && selected) onSelect(null);
      }}
    >
      <div
        className="places-map-grid"
        style={{
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${ox}px ${oy}px`,
        }}
      />
      {!shown.all.length && (
        <p className="places-map-empty">
          場所にGoogleマップのリンクを貼ると、ここに位置が出ます。
        </p>
      )}
      {pins.map(({ mark, q, inside }) => (
        <button
          key={mark.key}
          ref={(element) => {
            if (element) pinEls.current.set(mark.key, element);
            else pinEls.current.delete(mark.key);
          }}
          className={[
            "places-pin",
            mark.type,
            selected === mark.key && "is-selected",
            selected && selected !== mark.key && "is-dim",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            {
              left: q.x,
              top: q.y,
              visibility: inside ? undefined : "hidden",
              "--pl-tone":
                day === "all" && mark.type === "plan"
                  ? model.tone(mark.when!.day)
                  : undefined,
            } as CSSProperties
          }
          aria-label={
            mark.number ? `${mark.number} ${mark.name}` : `宿 ${mark.name}`
          }
          aria-pressed={selected === mark.key}
          tabIndex={inside ? undefined : -1}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(mark.key);
          }}
        >
          <PinShape mark={mark} />
          <span className="places-pin-label" aria-hidden="true">
            {mark.name}
          </span>
        </button>
      ))}
      {edges.map((edge) => (
        <button
          key={edge.marks.map((mark) => mark.key).join("|")}
          className="places-edge"
          style={{ left: edge.x, top: edge.y }}
          aria-label={`${edge.marks.map((mark) => mark.name).join("、")}（画面の外）`}
          onClick={(event) => {
            event.stopPropagation();
            goTo(
              fitTo([...fitKeys, ...edge.marks.map((mark) => mark.key)]),
              () => edge.marks.length === 1 && onSelect(edge.marks[0].key),
            );
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{ transform: `rotate(${edge.angle}deg)` }}
            aria-hidden="true"
          >
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
          {edge.marks
            .map((mark) => mark.number ?? "宿")
            .sort((a, b) =>
              typeof a === "number" && typeof b === "number" ? a - b : 0,
            )
            .join("·")}
        </button>
      ))}
      <div className="places-compass" aria-hidden="true">
        <svg viewBox="0 0 10 8">
          <path d="M5 0 L10 8 H0Z" />
        </svg>
        N
      </div>
      <div
        className="places-scale"
        aria-label={`縮尺 ${nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}`}
      >
        <span>{nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}</span>
        <i style={{ width: nice / mPerPx }} />
      </div>
      <button
        className={`places-refit${moved ? " is-on" : ""}`}
        tabIndex={moved ? undefined : -1}
        aria-hidden={!moved}
        onClick={(event) => {
          event.stopPropagation();
          goTo(fitted);
        }}
      >
        全体を表示
      </button>
    </div>
  );
}

/* ---------- list under the map ---------- */

function Walk() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="places-walk">
      <circle cx="13" cy="4" r="2.2" />
      <path d="M10 21l2-6 3 3v3M9 12l2-4 4 2 2 3M11 8l-3 2-1 3" />
    </svg>
  );
}
function House() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M5 12 L12 5.5 L19 12 V19 H5Z" fill="currentColor" />
    </svg>
  );
}

function stayLine(hotel: Mark, day: string) {
  const booking = hotel.booking!;
  if (booking.day === day) return `チェックイン ${booking.time}`.trim();
  if ((booking.endDay || booking.day) === day)
    return `チェックアウト ${booking.endTime}`.trim();
  return "ここから出発";
}

function PlacesList({
  model,
  day,
  selected,
  onSelect,
}: {
  model: Model;
  day: string;
  selected: string | null;
  onSelect: (mark: Mark) => void;
}) {
  const listEl = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    listEl.current?.querySelectorAll(".places-row").forEach((row, index) =>
      boing(
        row,
        [
          { transform: "translateY(18px)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        300 + index * 35,
      ),
    );
  }, [day]);
  const days = day === "all" ? model.days : [day];
  const row = (
    mark: Mark,
    badge: ReactNode,
    badgeClass: string,
    sub: string,
    distance: ReactNode,
  ) => (
    <button
      key={mark.key}
      className={`places-row${selected === mark.key ? " is-selected" : ""}`}
      aria-pressed={mark.point ? selected === mark.key : undefined}
      onClick={() => onSelect(mark)}
    >
      <span className={`places-badge ${badgeClass}`}>{badge}</span>
      <span className="places-row-main">
        <strong>{mark.name}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <span className="places-row-distance">{distance}</span>
    </button>
  );
  const leg = (from: Mark | null | undefined, to: Mark) => {
    if (!to.point) return "位置なし";
    if (!from?.point) return null;
    const meters = distanceMeters(from.point, to.point);
    return (
      <>
        <Walk />
        {walkMinutes(meters)}分
        <br />
        {formatMeters(meters)}
      </>
    );
  };
  return (
    <div className="places-list" ref={listEl}>
      {days.map((entry) => {
        const hotel = model.hotelFor(entry);
        const plans = model.plans.filter((mark) => mark.when!.day === entry);
        return (
          <section key={entry} aria-label={shortDate(entry)}>
            <h3>
              DAY {dayNumber(model.start, entry)} · {shortDate(entry)}
            </h3>
            {hotel &&
              row(hotel, <House />, "is-hotel", stayLine(hotel, entry), null)}
            {plans.map((mark, index) =>
              row(
                mark,
                mark.number,
                "",
                mark.when!.time || "時間未定",
                leg(index ? plans[index - 1] : hotel, mark),
              ),
            )}
          </section>
        );
      })}
      {model.candidates.length > 0 && (
        <section aria-label="候補">
          <h3>候補 · まだ予定なし</h3>
          {model.candidates.map((mark) => {
            const hotel = day === "all" ? model.hotels[0] : model.hotelFor(day);
            return row(
              mark,
              mark.number,
              "is-cand",
              mark.place!.note,
              !mark.point ? (
                "位置なし"
              ) : hotel?.point ? (
                <>
                  宿から
                  <br />
                  {formatMeters(distanceMeters(hotel.point, mark.point))}
                </>
              ) : null,
            );
          })}
        </section>
      )}
    </div>
  );
}

/* ---------- place card, above the dock ---------- */

function PlaceSheetFor({
  model,
  mark,
  day,
  canEdit,
  onClose,
  onOpen,
  onSchedule,
}: {
  model: Model;
  mark: Mark;
  day: string;
  canEdit: boolean;
  onClose: () => void;
  onOpen: () => void;
  onSchedule: () => void;
}) {
  const point = mark.point;
  const hotel =
    mark.type === "hotel"
      ? null
      : mark.when
        ? model.hotelFor(mark.when.day)
        : day === "all"
          ? model.hotels[0]
          : model.hotelFor(day);
  const fromHotel =
    hotel?.point && point ? distanceMeters(hotel.point, point) : null;
  const previous = mark.when ? previousStop(model, mark) : null;
  const fromPrevious =
    previous && previous.type !== "hotel" && previous.point && point
      ? distanceMeters(previous.point, point)
      : null;
  let tag: ReactNode;
  let note = "";
  if (mark.type === "hotel") {
    const booking = mark.booking!;
    const nights = Math.max(
      0,
      Math.round(
        (Date.parse(booking.endDay || booking.day) - Date.parse(booking.day)) /
          86400000,
      ),
    );
    tag = <span className="places-tag is-plan">宿</span>;
    note = `チェックイン ${shortDate(booking.day)} ${booking.time}${nights ? ` · ${nights}泊` : ""}`;
  } else if (mark.when) {
    tag = (
      <span className="places-tag is-plan">
        DAY {dayNumber(model.start, mark.when.day)} · {shortDate(mark.when.day)}{" "}
        {mark.when.time || "時間未定"}
      </span>
    );
    note = mark.place!.note;
  } else {
    tag = <span className="places-tag">候補 · まだ予定なし</span>;
    note = mark.place!.note;
  }
  const lines: ReactNode[] = [];
  if (note) lines.push(note);
  if (fromHotel != null)
    lines.push(
      <>
        {/* With several stays, name the one the distance is from. */}
        {model.hotels.length > 1 ? `${hotel!.name}から ` : "宿から "}
        <b>徒歩{walkMinutes(fromHotel)}分</b> · {formatMeters(fromHotel)}
        （直線）
      </>,
    );
  if (fromPrevious != null)
    lines.push(
      <>
        {previous!.name}から <b>徒歩{walkMinutes(fromPrevious)}分</b>
      </>,
    );
  return (
    <PlaceSheet
      title={mark.name}
      tag={tag}
      lines={lines}
      mapsHref={placeMapsHref(
        mark.place?.location ?? mark.booking?.location ?? "",
        point,
      )}
      onClose={onClose}
      onOpen={onOpen}
      onSchedule={mark.type === "cand" && canEdit ? onSchedule : undefined}
    />
  );
}
