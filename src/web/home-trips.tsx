import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import type { Trip, TripMember } from "@/data/types";
import { TripCover } from "./trip-cover";
import { reduceMotion } from "./motion";
import { registerSquish, spring } from "./cartoon";
import { useJellyScroll } from "./jelly-scroll";

/** Places typed into one destination. 「・」 stays inside a single name. */
export function destinationPlaces(destination: string) {
  return destination
    .split(/\s*[、,，/／]\s*/)
    .map((place) => place.trim())
    .filter(Boolean);
}

/** One place per line; four or more keep the first two and count the rest. */
export function destinationLines(destination: string) {
  const places = destinationPlaces(destination);
  return places.length > 3
    ? [
        { text: places[0] },
        { text: places[1], more: `ほか${places.length - 2}` },
      ]
    : places.map((text) => ({ text, more: "" }));
}

const dayNumber = (value: string) =>
  Math.round(Date.parse(`${value}T00:00:00Z`) / 86400000);
/** Days until the trip starts, or a negative count once it has begun. */
export function daysUntil(today: string, startsOn: string) {
  return dayNumber(startsOn) - dayNumber(today);
}
const monthDay = (value: string) =>
  `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;

/**
 * The faint destination behind a trip without a photo. It sits right-aligned
 * in the free space above the name, sized so the longest place fits, and never
 * reaches into the name block.
 */
function DestinationArt({
  destination,
  large,
}: {
  destination: string;
  large: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const lines = destinationLines(destination);
  const key = JSON.stringify(lines);
  useLayoutEffect(() => {
    const art = ref.current;
    const card = art?.closest<HTMLElement>(".home-trip");
    const body = card?.querySelector<HTMLElement>(".home-trip-body");
    if (!art || !card || !body) return;
    const pad = large ? 18 : 10;
    const top = large ? 54 : 10;
    const fit = () => {
      const width = card.clientWidth;
      const height = card.clientHeight;
      if (!width || !height) return;
      const free = body.offsetTop - 6 - top;
      art.style.right = `${pad}px`;
      art.style.bottom = `${height - body.offsetTop + 6}px`;
      art.style.fontSize = "100px";
      const widest = Math.max(
        1,
        ...Array.from(art.children, (row) => (row as HTMLElement).offsetWidth),
      );
      const size = Math.min(
        large ? 64 : 30,
        ((width - pad * 2) * 100) / widest,
        (free * 0.95) / art.children.length,
      );
      art.style.fontSize = `${Math.max(10, size).toFixed(1)}px`;
      art.hidden = free < 12;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(card);
    observer.observe(body);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [key, large]);
  if (!lines.length) return null;
  return (
    <span className="home-trip-place" aria-hidden="true" ref={ref}>
      {lines.map((line) => (
        <span key={line.text}>
          {line.text}
          {line.more && <small>{line.more}</small>}
        </span>
      ))}
    </span>
  );
}

function Face({ member }: { member: TripMember }) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = member.avatarUrl;
  const initial = (member.name || member.email).trim().slice(0, 1);
  return (
    <span title={member.name || member.email}>
      {photo && failed !== photo ? (
        <img
          src={photo}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(photo)}
        />
      ) : (
        initial
      )}
    </span>
  );
}

/** Who is going: up to four icons, or three and a count of the rest. */
export function TripFaces({ members }: { members: TripMember[] }) {
  if (!members.length) return <span />;
  const shown = members.length > 4 ? members.slice(0, 3) : members;
  return (
    <span
      className="home-trip-faces"
      role="img"
      aria-label={`${members.length}人`}
    >
      {shown.map((member) => (
        <Face key={member.id} member={member} />
      ))}
      {members.length > 4 && (
        <span className="more">+{members.length - 3}</span>
      )}
    </span>
  );
}

function TripLink({
  trip,
  className,
  onOpen,
  children,
}: {
  trip: Trip;
  className: string;
  onOpen: (trip: Trip) => void;
  children: ReactNode;
}) {
  const photo = Boolean(trip.coverImage);
  return (
    <Link
      className={`home-trip ${className}${photo ? "" : " no-photo"}`}
      data-press-card
      data-trip-surface={trip.id}
      data-motion-managed
      to={`/trips/${trip.id}/itinerary`}
      onClick={(event: MouseEvent) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        onOpen(trip);
      }}
    >
      {photo ? (
        <span className="home-trip-photo">
          <TripCover id={trip.id} src={trip.coverImage!} />
        </span>
      ) : (
        <DestinationArt
          destination={trip.destination}
          large={className === "home-trip-card"}
        />
      )}
      {children}
    </Link>
  );
}

/**
 * A later trip's countdown, roughly (Tsubasa 2026-10-06): days under a month,
 * then half months (「1ヶ月半」), then years.
 */
const roughly = (days: number): [number, string] => {
  if (days < 30) return [days, "日"];
  if (days >= 345) return [Math.round(days / 365), "年"];
  const half = Math.round(days / 15.2);
  return [Math.floor(half / 2), half % 2 ? "ヶ月半" : "ヶ月"];
};

/** An upcoming trip as a photo card; the nearest counts down by the day, later ones roughly. */
export function UpcomingTripCard({
  trip,
  members,
  today,
  nearest,
  onOpen,
}: {
  trip: Trip;
  members: TripMember[];
  today: string;
  nearest: boolean;
  onOpen: (trip: Trip) => void;
}) {
  const until = daysUntil(today, trip.startsOn);
  return (
    <TripLink trip={trip} className="home-trip-card" onOpen={onOpen}>
      <span className="home-trip-top">
        {nearest ? (
          until > 0 ? (
            <span className="home-trip-countdown">
              あと<b>{until}</b>日
            </span>
          ) : (
            <span className="home-trip-countdown">
              <b>{1 - until}</b>日目
            </span>
          )
        ) : until > 0 ? (
          <span className="home-trip-countdown">
            あと<b>{roughly(until)[0]}</b>
            {roughly(until)[1]}
          </span>
        ) : (
          <span />
        )}
        <TripFaces members={members} />
      </span>
      <span className="home-trip-body">
        <h3>{trip.name}</h3>
        <span className="home-trip-meta">
          <span className="home-trip-dates">
            {monthDay(trip.startsOn)} – {monthDay(trip.endsOn)}
          </span>
          {trip.destination && (
            <span className="home-trip-destination">{trip.destination}</span>
          )}
        </span>
      </span>
    </TripLink>
  );
}

/** A past trip on the shelf: name and the month it started. */
export function PastTripCard({
  trip,
  onOpen,
}: {
  trip: Trip;
  onOpen: (trip: Trip) => void;
}) {
  return (
    <TripLink trip={trip} className="home-trip-shelf-card" onOpen={onOpen}>
      <span className="home-trip-body">
        <b>{trip.name}</b>
        <small>
          {trip.startsOn.slice(0, 4)}.{Number(trip.startsOn.slice(5, 7))}
        </small>
      </span>
    </TripLink>
  );
}

let entered = false;
/** Cards drop in and land once per session, the first time the list appears. */
export function useTripListEntrance(list: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    if (entered || !list.current) return;
    entered = true;
    // Returning from a trip already has its own transition.
    if (reduceMotion() || document.documentElement.dataset.tripTransition)
      return;
    const cards = list.current.querySelectorAll<HTMLElement>(".home-trip");
    cards.forEach((card, index) =>
      card.animate?.(
        [
          { transform: "translateY(-40px) scale(.9,1.12)", opacity: 0 },
          {
            transform: "translateY(0) scale(.92,1.1)",
            opacity: 1,
            offset: 0.42,
          },
          { transform: "translateY(0) scale(1.06,.9)", offset: 0.6 },
          { transform: "translateY(-2px) scale(.99,1.02)", offset: 0.8 },
          { transform: "none", opacity: 1 },
        ],
        {
          duration: 460,
          delay: index * 50,
          easing: "cubic-bezier(.4,0,.6,1)",
          fill: "backwards",
        },
      ),
    );
  }, [list]);
}

/**
 * kondo-home.html's press: a tapped card or the join link gives one squish
 * (scale .95 × .97 back to rest on the squish spring) instead of the shared
 * hold-to-squish, and the list trails a fast scroll (jelly scroll).
 */
export function useHomeMotion(list: React.RefObject<HTMLElement | null>) {
  useJellyScroll(
    list,
    ".home-toolbar, .home-group-heading, .home-trip, .home-join",
  );
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    // Amount 1: the shared press feedback leaves these to the handler below.
    const unregister = registerSquish(".home-trip, .home-join", 1);
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(
        ".home-trip, .home-join",
      );
      if (target)
        void spring(
          target,
          [{ transform: "scale(.95,.97)" }, { transform: "none" }],
          "squish",
        );
    };
    node.addEventListener("pointerdown", down);
    return () => {
      unregister();
      node.removeEventListener("pointerdown", down);
    };
  }, [list]);
}
