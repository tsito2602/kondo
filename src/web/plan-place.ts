import { coordsFromLink, placeNameFromLink } from "@/data/geo";
import { placeNumbers } from "@/data/place-numbers";
import { registeredGoogleMapsUrl } from "@/data/places";
import type { useTravel } from "@/data/travel-provider";
import type { ItineraryItem, Place, PlaceInput } from "@/data/types";

type Travel = ReturnType<typeof useTravel>;

const placeInput = ({ id: _id, updatedAt: _at, ...input }: Place): PlaceInput =>
  input;

/** What a typed place field resolves to before saving (A1: a map link becomes a numbered place). */
export function previewPlace(
  text: string,
  title: string,
  travel: Pick<Travel, "places" | "items"> & Partial<Pick<Travel, "bookings">>,
  draft: { day: string; time: string },
  current?: Place,
) {
  const link = registeredGoogleMapsUrl(text.trim());
  if (!link) return null;
  const name = placeNameFromLink(link) ?? title.trim();
  // Number the plan exactly as the map will once it is saved.
  const probe: Place = current ?? {
    id: "~new-place",
    title: name,
    note: "",
    openingHours: "",
    reservationStatus: "not_needed",
    location: link,
    status: "planned",
    itineraryItemId: "~new-item",
  };
  const itemId = probe.itineraryItemId ?? "~new-item";
  const items: ItineraryItem[] = [
    ...travel.items.filter((item) => item.id !== itemId),
    { id: itemId, day: draft.day, time: draft.time, kind: "", title, note: "" },
  ];
  const places = [
    ...travel.places.filter((place) => place.id !== probe.id),
    { ...probe, itineraryItemId: itemId },
  ];
  return {
    link,
    name: name || "マップの場所",
    number: placeNumbers(places, items, travel.bookings).get(probe.id),
    located: Boolean(coordsFromLink(link)),
  };
}

/**
 * Save the plan's place field. A Google Maps link becomes (or updates) a place of
 * the plan's own, so it gets the map's number; other text stays the plan's location.
 */
export function savePlanPlace(
  travel: Travel,
  item: { id: string; title: string },
  text: string,
  linked?: Place,
  ownPlace = false,
) {
  const link = registeredGoogleMapsUrl(text.trim());
  if (link) {
    const title = placeNameFromLink(link) ?? item.title.trim();
    if (linked && ownPlace) {
      if (linked.location !== link)
        travel.updatePlace(linked.id, {
          ...placeInput(linked),
          title,
          location: link,
        });
    } else if (!linked)
      travel.createPlace({
        title,
        note: "",
        openingHours: "",
        reservationStatus: "not_needed",
        location: link,
        referenceLinks: [],
        itineraryItemId: item.id,
        status: "planned",
      });
    return { location: link, ownPlace: Boolean(!linked || ownPlace) };
  }
  if (linked && ownPlace) travel.deletePlace(linked.id);
  return { location: text.trim(), ownPlace: false };
}
