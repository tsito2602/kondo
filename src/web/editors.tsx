import { DatePicker } from "./date-picker";
import { MomentRows } from "./moment-rows";
import {
  shiftDay,
  TimelinePicker,
  TimeRangeButton,
  tripDays,
} from "./timeline-picker";
import { coordsFromLink, placeNameFromLink } from "@/data/geo";
import { useAuth } from "@/auth/auth-provider";
import { placeNumbers } from "@/data/place-numbers";
import { Glyph, MapPin } from "./itinerary-icons";
import { dismissModal } from "./motion";
import { Button } from "./obsidian/button";
import { Input } from "./obsidian/input";
import { Textarea } from "./obsidian/textarea";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Trash2, Plus, Paperclip } from "lucide-react";
import { bookingIcons, spring } from "./booking-card";
import { kindOfBooking } from "./kind-colors";
import { AirportField } from "./airport-field";
import { findAirportByCode } from "@/data/airports";
import { findMatchingItineraryItem } from "@/data/booking-match";
import { linkBookingPlace } from "@/data/booking-place";
import { planPlace } from "@/data/plan-timeline";
import { useTravel } from "@/data/travel-provider";
import {
  itineraryCategories,
  transportModes,
  emptyItineraryDetails,
  itemDetails,
  itineraryDetailsError,
  ordinaryPlans,
} from "@/data/itinerary";
import {
  reservationChoices,
  reservationLabel,
  referenceUrl,
  mapUrl,
  registeredGoogleMapsUrl,
  mapCoordinates,
  type Coordinates,
} from "@/data/places";
import { localDate, validDate } from "@/utils/dates";
import type {
  Trip,
  Booking,
  BookingKind,
  ItineraryItem,
  Place,
  PlaceInput,
  ItineraryCategory,
  TransportMode,
} from "@/data/types";
import {
  Modal,
  Field,
  ErrorText,
  SaveButton,
  enterHint,
  useAction,
} from "./ui";

export const bookingKinds: { value: BookingKind; label: string }[] = [
  { value: "flight", label: "航空券" },
  { value: "hotel", label: "ホテル" },
  { value: "train", label: "鉄道" },
  { value: "car", label: "車" },
  { value: "restaurant", label: "飲食" },
  { value: "ticket", label: "入場券" },
  { value: "other", label: "その他" },
];
const dateError = (start: string, end?: string) =>
  !validDate(start) || (end && (!validDate(end) || end < start))
    ? "正しい日付・期間を入力してください"
    : "";
function useSubmit(
  save: () => void | Promise<void>,
  validate: () => string,
  close: () => void,
) {
  const [error, setError] = useState("");
  const { busy, run } = useAction();
  // Saved and closing: a late second submit must not save again.
  const saved = useRef(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (saved.current) return;
    const dialog = (event.currentTarget as HTMLFormElement).closest("dialog");
    const message = validate();
    setError(message);
    if (!message)
      void run(async () => {
        await save();
        saved.current = true;
        dismissModal(close, dialog);
      });
  };
  // Greyed out until it can be saved (Tsubasa 2026-10-07). A plain missing
  // field explains itself; anything else (a wrong link, an end before the
  // start) says why right away.
  const reason = validate();
  return {
    error:
      error || (reason && !/を入力してください$/.test(reason) ? reason : ""),
    busy,
    submit,
    blocked: Boolean(reason),
  };
}
async function coverData(file: File) {
  if (!file.type.startsWith("image/"))
    throw new Error("画像ファイルを選択してください");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.65, 0.45, 0.25]) {
    const value = canvas.toDataURL("image/jpeg", quality);
    if (value.length <= 550000) return value;
  }
  throw new Error("画像が大きすぎます。別の画像を選んでください");
}
export function TripEditor({
  trip,
  onClose,
  onCreated,
}: {
  trip?: Trip;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const travel = useTravel();
  const createdId = useRef<string | null>(null);
  const [draft, setDraft] = useState({
    name: trip?.name ?? "",
    destination: trip?.destination ?? "",
    startsOn: trip?.startsOn ?? localDate(),
    endsOn: trip?.endsOn ?? localDate(),
    coverImage: trip?.coverImage ?? "",
  });
  const { busy: imageBusy, run } = useAction();
  const { error, busy, submit, blocked } = useSubmit(
    () => {
      if (trip) travel.updateTrip(trip.id, draft);
      else createdId.current = travel.createTrip(draft);
    },
    () =>
      !draft.name.trim()
        ? "旅行名を入力してください"
        : dateError(draft.startsOn, draft.endsOn),
    () => {
      onClose();
      if (createdId.current) onCreated?.(createdId.current);
    },
  );
  return (
    <Modal title={trip ? "旅行を編集" : "新しい旅行"} onClose={onClose} full>
      <form className="form" onSubmit={submit}>
        <div
          className="cover-upload"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file)
              void run(async () =>
                setDraft({ ...draft, coverImage: await coverData(file) }),
              );
          }}
        >
          {draft.coverImage && (
            <img src={draft.coverImage} alt="旅行のカバー" />
          )}
          <label className="secondary">
            {imageBusy ? "読み込み中…" : "カバー画像を選ぶ"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={imageBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void run(async () =>
                    setDraft({ ...draft, coverImage: await coverData(file) }),
                  );
              }}
            />
          </label>
          {draft.coverImage && (
            <Button
              variant="ghost"
              type="button"
              className="icon-button"
              aria-label="カバー画像を削除"
              onClick={() => setDraft({ ...draft, coverImage: "" })}
            >
              <Trash2 />
            </Button>
          )}
        </div>
        <Field label="旅行名">
          <Input
            required
            maxLength={120}
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </Field>
        <Field label="行き先">
          <Input
            maxLength={160}
            placeholder="行き先を「、」で区切って入力"
            value={draft.destination}
            onChange={(event) =>
              setDraft({ ...draft, destination: event.target.value })
            }
          />
        </Field>
        <DatePicker
          label="旅行期間"
          range
          span="days"
          required
          value={draft.startsOn}
          endValue={draft.endsOn}
          onChange={(startsOn, endsOn) =>
            setDraft({ ...draft, startsOn, endsOn })
          }
        />
        <ErrorText message={error} />
        <SaveButton busy={busy || imageBusy} blocked={blocked} />
      </form>
    </Modal>
  );
}
export function ItemEditor({
  item,
  day,
  place,
  onClose,
}: {
  item?: ItineraryItem;
  day?: string;
  place?: Place;
  onClose: () => void;
}) {
  const travel = useTravel();
  const [draft, setDraft] = useState({
    day: item?.day ?? day ?? travel.selectedTrip?.startsOn ?? localDate(),
    time: item?.time ?? "",
    kind: item?.kind ?? "観光",
    title: item?.title ?? place?.title ?? "",
    note: item?.note ?? place?.note ?? "",
  });
  const [details, setDetails] = useState(
    item
      ? itemDetails(item)
      : {
          ...emptyItineraryDetails("sightseeing"),
          location: place?.location ?? "",
        },
  );
  const [picking, setPicking] = useState(false);
  const days = tripDays(travel.selectedTrip, draft.day);
  const endDayOffset = details.endDay
    ? Math.round(
        (Date.parse(details.endDay) - Date.parse(draft.day)) / 86_400_000,
      )
    : 0;
  const { error, busy, submit, blocked } = useSubmit(
    () => {
      const input = {
        ...draft,
        title: draft.title.trim(),
        kind: itineraryCategories.find(
          (entry) => entry.value === details.category,
        )!.label,
        details: {
          ...details,
          endDay: details.endTime ? details.endDay || draft.day : "",
        },
      };
      const id = item
        ? (travel.updateItem(item.id, input), item.id)
        : travel.createItem(input);
      if (place)
        travel.updatePlace(place.id, { ...place, itineraryItemId: id });
    },
    () =>
      !draft.title.trim()
        ? "タイトルを入力してください"
        : dateError(draft.day, details.endDay) ||
          (details.endDay && !details.endTime
            ? "終了時刻も入力してください"
            : "") ||
          itineraryDetailsError(draft.day, draft.time, details),
    onClose,
  );
  const transport = details.transport ?? {
    mode: "walk" as const,
    origin: "",
    destination: "",
  };
  return (
    <Modal
      title={item ? "予定を編集" : place ? "しおりに追加" : "予定を追加"}
      onClose={onClose}
      full
    >
      <form className="form item-editor" onSubmit={submit}>
        <Field label="カテゴリ">
          <select
            value={details.category}
            onChange={(event) =>
              setDetails({
                ...details,
                category: event.target.value as ItineraryCategory,
                ...(event.target.value === "transport"
                  ? { transport }
                  : { transport: undefined }),
              })
            }
          >
            {itineraryCategories.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="タイトル">
          <Input
            required
            maxLength={160}
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
        <div className="field">
          <span>日時</span>
          <TimeRangeButton
            day={draft.day}
            time={draft.time}
            endTime={details.endTime}
            endDayOffset={endDayOffset}
            onOpen={() => setPicking(true)}
          />
        </div>
        {details.category === "transport" ? (
          <>
            <div className="form-grid">
              <Field label="移動手段">
                <select
                  value={transport.mode}
                  onChange={(event) =>
                    setDetails({
                      ...details,
                      transport: {
                        ...transport,
                        mode: event.target.value as TransportMode,
                      },
                    })
                  }
                >
                  {transportModes.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="所要時間（分）">
                <Input
                  type="number"
                  min={1}
                  max={10080}
                  value={transport.durationMinutes ?? ""}
                  onChange={(event) =>
                    setDetails({
                      ...details,
                      transport: {
                        ...transport,
                        durationMinutes: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      },
                    })
                  }
                />
              </Field>
            </div>
            <Field label="出発地">
              <Input
                maxLength={160}
                value={transport.origin}
                onChange={(event) =>
                  setDetails({
                    ...details,
                    transport: { ...transport, origin: event.target.value },
                  })
                }
              />
            </Field>
            <Field label="目的地">
              <Input
                maxLength={160}
                value={transport.destination}
                onChange={(event) =>
                  setDetails({
                    ...details,
                    transport: {
                      ...transport,
                      destination: event.target.value,
                    },
                  })
                }
              />
            </Field>
          </>
        ) : (
          <Field label="場所・Google MapsのURL">
            <Input
              maxLength={160}
              value={details.location}
              onChange={(event) =>
                setDetails({ ...details, location: event.target.value })
              }
            />
          </Field>
        )}
        <Field label="メモ">
          <Textarea
            rows={5}
            maxLength={4000}
            value={draft.note}
            onChange={(event) =>
              setDraft({ ...draft, note: event.target.value })
            }
          />
        </Field>
        <ErrorText message={error} />
        <SaveButton busy={busy} blocked={blocked} />
      </form>
      {picking && (
        <TimelinePicker
          title={draft.title.trim() || "新しい予定"}
          day={draft.day}
          days={days}
          time={draft.time}
          endTime={details.endTime}
          endDayOffset={endDayOffset}
          exclude={item ? [`item-${item.id}`] : []}
          self={
            details.category === "transport"
              ? null
              : coordsFromLink(details.location)
          }
          allowClear
          onSave={(picked) => {
            setDraft({ ...draft, day: picked.day, time: picked.time });
            setDetails({
              ...details,
              endTime: picked.endTime,
              endDay: picked.endTime
                ? shiftDay(picked.day, picked.endDayOffset)
                : "",
            });
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Modal>
  );
}
function flightTitle(
  booking: Pick<
    Booking,
    "origin" | "originCode" | "destination" | "destinationCode"
  >,
) {
  return (
    [
      booking.originCode || booking.origin,
      booking.destinationCode || booking.destination,
    ]
      .filter(Boolean)
      .join(" → ") || "フライト"
  ).slice(0, 160);
}
export type BookingInput = Omit<
  Booking,
  | "id"
  | "updatedBy"
  | "updatedAt"
  | "connectionMode"
  | "nextFlightId"
  | "location"
> & { location?: string };
/** The booking fields for one kind. Without a kind yet, only the kind picker shows. */
export function BookingForm({
  booking,
  onClose,
  pickKind = false,
  onDraft,
  onSaved,
}: {
  booking?: Booking | BookingInput;
  onClose: () => void;
  /** Start with no kind chosen (the manual add). */
  pickKind?: boolean;
  /** Return the input instead of saving (fixing an imported row before it is saved). */
  onDraft?: (input: BookingInput) => void;
  /** A new booking was saved, with the documents chosen for it. */
  onSaved?: (id: string, files: File[]) => void;
}) {
  const travel = useTravel();
  const existing = booking && "id" in booking ? booking : undefined;
  const [files, setFiles] = useState<File[]>([]);
  // A venue linked by name (no map link of its own) shows the place's name.
  const [initialLocation] = useState(
    () =>
      booking?.location ||
      travel.places.find((place) => place.id === booking?.placeId)?.title ||
      "",
  );
  const [draft, setDraft] = useState({
    kind: (pickKind ? null : (booking?.kind ?? "flight")) as BookingKind | null,
    title:
      booking?.kind === "flight" && booking.title === flightTitle(booking)
        ? ""
        : (booking?.title ?? ""),
    detail: booking?.detail ?? "",
    location: initialLocation,
    origin:
      booking?.origin ||
      findAirportByCode(booking?.originCode ?? "")?.name ||
      booking?.originCode ||
      "",
    originCode: booking?.originCode ?? "",
    destination:
      booking?.destination ||
      findAirportByCode(booking?.destinationCode ?? "")?.name ||
      booking?.destinationCode ||
      "",
    destinationCode: booking?.destinationCode ?? "",
    day: booking?.day ?? travel.selectedTrip?.startsOn ?? localDate(),
    time: booking?.time ?? "",
    endDay: booking?.endDay ?? "",
    endTime: booking?.endTime ?? "",
    durationMinutes: booking?.durationMinutes ?? null,
    confirmationCode: booking?.confirmationCode ?? "",
    note: booking?.note ?? "",
  });
  const kind = draft.kind ?? "other";
  const titleLabel = {
    flight: "便名（任意）",
    hotel: "宿泊施設名",
    train: "列車名・路線名",
    car: "レンタカー会社・車名",
    restaurant: "お店の名前",
    ticket: "施設・イベント名",
    other: "予約のタイトル",
  }[kind];
  const carrier = kind === "flight" || kind === "train";
  const carrierLabel =
    kind === "flight" ? "航空会社・補足（任意）" : "鉄道会社・補足（任意）";
  const displayTitle =
    draft.title.trim() || (kind === "flight" ? flightTitle(draft) : "");
  const [mergeId, setMergeId] = useState<string | null>(null);
  const candidate =
    !existing && !onDraft && draft.kind
      ? findMatchingItineraryItem(ordinaryPlans(travel.items), {
          ...draft,
          kind,
          title: displayTitle,
        })
      : null;
  const merged = candidate?.item.id === mergeId ? candidate.item : null;
  const { error, busy, submit, blocked } = useSubmit(
    () => {
      const input = {
        ...draft,
        kind,
        title: displayTitle,
        endDay: draft.endDay || draft.day,
        note: [
          draft.note,
          merged ? `日程から：${merged.title} ${merged.note}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
      if (input.note.length > 4000)
        throw new Error("メモは4,000文字以内にしてください");
      if (onDraft) return onDraft(input);
      // 場所: a place of the trip by name, or a map link (linked, or added as a place).
      const keep =
        existing &&
        existing.placeId !== undefined &&
        draft.location === initialLocation &&
        draft.kind === existing.kind;
      let linked = keep
        ? {
            ...input,
            location:
              input.location === initialLocation && !existing.location
                ? ""
                : input.location,
            placeId: existing.placeId ?? null,
          }
        : linkBookingPlace(travel, input);
      // The plan this booking replaces hands its place over to the booking.
      const mergedPlace = merged && planPlace(merged, travel.places);
      if (mergedPlace && !linked.placeId && kind !== "hotel")
        linked = { ...linked, placeId: mergedPlace.id };
      if (existing) travel.updateBooking(existing.id, linked);
      else {
        const id = travel.createBooking(linked);
        onSaved?.(id, files);
      }
      if (merged) travel.deleteItem(merged.id);
    },
    () =>
      !draft.kind
        ? "先にカテゴリを選んでください"
        : !displayTitle
          ? `${titleLabel}を入力してください`
          : dateError(draft.day) ||
            (draft.endDay && !validDate(draft.endDay)
              ? "正しい終了日を入力してください"
              : "") ||
            (kind !== "flight" && draft.endDay && draft.endDay < draft.day
              ? "終了日は開始日以降にしてください"
              : "") ||
            (draft.location && !mapUrl(draft.location)
              ? "正しい住所・URLを入力してください"
              : ""),
    onClose,
  );
  const field = (
    key:
      | "title"
      | "detail"
      | "location"
      | "origin"
      | "destination"
      | "confirmationCode",
    label: string,
    required = false,
    list?: string,
  ) => (
    <Field label={label}>
      <Input
        required={required}
        list={list}
        value={draft[key]}
        maxLength={
          key === "location"
            ? 2000
            : key === "detail"
              ? 500
              : key === "confirmationCode"
                ? 120
                : 160
        }
        onChange={(event) =>
          setDraft({
            ...draft,
            [key]: event.target.value,
          })
        }
      />
    </Field>
  );
  const route = ["flight", "train", "car"].includes(kind);
  // A car runs from 受取場所 to 返却場所; a 場所 it already has stays editable.
  const showLocation = !route || (kind === "car" && Boolean(initialLocation));
  const rangeBooking = route || kind === "hotel";
  const dateLabels = {
    flight: { label: "フライト日時", start: "出発", end: "到着" },
    hotel: { label: "宿泊期間", start: "チェックイン", end: "チェックアウト" },
    train: { label: "乗車日時", start: "出発", end: "到着" },
    car: { label: "利用期間", start: "受取", end: "返却" },
    restaurant: { label: "予約日・予約時刻", start: "予約日", end: "" },
    ticket: { label: "利用日・利用時刻", start: "利用日", end: "" },
    other: { label: "日付・時刻", start: "日付", end: "" },
  }[kind];
  return (
    <form className="form" onSubmit={submit}>
      <div className="bk-kinds" role="group" aria-label="カテゴリ">
        {bookingKinds.map((entry) => {
          const Icon = bookingIcons[entry.value];
          return (
            <button
              key={entry.value}
              type="button"
              aria-pressed={draft.kind === entry.value}
              data-kind={kindOfBooking(entry.value)}
              onClick={(event) => {
                setDraft({ ...draft, kind: entry.value });
                spring(
                  event.currentTarget,
                  [{ transform: "scale(.88)" }, { transform: "none" }],
                  "boing",
                );
              }}
            >
              <Icon size={26} strokeWidth={1.9} aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
      </div>
      {draft.kind && (
        <>
          {/* The carrier comes before the flight or train it runs
              (Tsubasa 2026-10-06: 「航空会社・鉄道会社を便名より上にして」). */}
          {carrier && field("detail", carrierLabel)}
          {field("title", titleLabel, kind !== "flight")}
          {kind === "flight" && (
            <p className="muted form-hint">
              空欄なら出発地と到着地を表示します。
            </p>
          )}
          {!carrier && field("detail", "予約内容")}
          {/* 予約番号 above places and dates (Tsubasa 2026-10-07). */}
          {field("confirmationCode", "予約番号")}
          {route && (
            <div className={kind === "flight" ? "airport-fields" : "form-grid"}>
              {kind === "flight" ? (
                <>
                  <AirportField
                    label="出発地"
                    value={draft.origin}
                    code={draft.originCode}
                    onChange={(origin, originCode) =>
                      setDraft((current) => ({
                        ...current,
                        origin,
                        originCode,
                      }))
                    }
                  />
                  <AirportField
                    label="到着地"
                    value={draft.destination}
                    code={draft.destinationCode}
                    onChange={(destination, destinationCode) =>
                      setDraft((current) => ({
                        ...current,
                        destination,
                        destinationCode,
                      }))
                    }
                  />
                </>
              ) : (
                <>
                  {field("origin", kind === "car" ? "受取場所" : "出発駅")}
                  {field("destination", kind === "car" ? "返却場所" : "到着駅")}
                </>
              )}
            </div>
          )}
          {showLocation &&
            field(
              "location",
              "住所・Google MapsのURL",
              false,
              kind === "hotel" || !travel.places.length
                ? undefined
                : "booking-places",
            )}
          {showLocation && kind !== "hotel" && travel.places.length > 0 && (
            <datalist id="booking-places">
              {travel.places.map((place) => (
                <option key={place.id} value={place.title} />
              ))}
            </datalist>
          )}
          <MomentRows
            title={draft.title}
            start={{
              label: dateLabels.start,
              date: draft.day,
              time: draft.time,
            }}
            end={
              rangeBooking
                ? {
                    label: dateLabels.end,
                    date: draft.endDay,
                    time: draft.endTime,
                  }
                : undefined
            }
            stay={kind === "hotel" || kind === "car"}
            span={kind === "hotel" ? "nights" : "days"}
            panelLabel={dateLabels.label}
            trip={travel.selectedTrip ?? undefined}
            onChange={(patch) =>
              setDraft((current) => ({
                ...current,
                ...(patch.date !== undefined && {
                  day: patch.date,
                  endDay: rangeBooking ? current.endDay : patch.date,
                }),
                ...(patch.time !== undefined && {
                  time: patch.time,
                  endTime: rangeBooking ? current.endTime : patch.time,
                }),
                ...(patch.endDate !== undefined && { endDay: patch.endDate }),
                ...(patch.endTime !== undefined && { endTime: patch.endTime }),
              }))
            }
          />
          {["flight", "train"].includes(kind) && (
            <Field label="所要時間（分・空欄なら自動計算）">
              <Input
                type="number"
                min={1}
                max={10080}
                value={draft.durationMinutes ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    durationMinutes: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
              />
            </Field>
          )}
          {candidate && (
            <label className="check-line">
              <input
                type="checkbox"
                checked={merged !== null}
                onChange={(event) =>
                  setMergeId(event.target.checked ? candidate.item.id : null)
                }
              />
              重複する予定「{candidate.item.title}」をこの予約へまとめる
            </label>
          )}
          <Field label="メモ">
            <Textarea
              rows={5}
              maxLength={4000}
              value={draft.note}
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
            />
          </Field>
          {!existing && !onDraft && (
            <label className="bk-attach">
              <Paperclip size={18} aria-hidden="true" />
              {files.length
                ? files.map((file) => file.name).join("、")
                : "書類（PDF・画像）を付ける"}
              <input
                hidden
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/gif,image/webp,.heic,.heif"
                onChange={(event) => {
                  setFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
            </label>
          )}
        </>
      )}
      <ErrorText message={error} />
      <SaveButton busy={busy} blocked={blocked} />
    </form>
  );
}
export function BookingEditor({
  booking,
  onClose,
  onDraft,
}: {
  booking?: Booking | BookingInput;
  onClose: () => void;
  onDraft?: (input: BookingInput) => void;
}) {
  return (
    <Modal
      title={onDraft ? "予約を直す" : booking ? "予約を編集" : "予約を追加"}
      onClose={onClose}
      full
    >
      <BookingForm booking={booking} onClose={onClose} onDraft={onDraft} />
    </Modal>
  );
}
/**
 * 行きたい場所 add and edit share one form: the name, an address or any link
 * (a Google Maps link puts it on the map; a plain address stays a candidate
 * without a pin), 予約, memo, reference links and opening hours.
 * Adding opens in the ＋ panel; a Google Maps link fills the name when it
 * names the place (a short share link asks the Worker to follow it).
 */
export function PlaceEditor({
  place,
  onClose,
}: {
  place?: Place;
  onClose: () => void;
}) {
  const travel = useTravel();
  const { request, isDemo } = useAuth();
  const formId = useId();
  const [draft, setDraft] = useState<PlaceInput>({
    title: place?.title ?? "",
    note: place?.note ?? "",
    openingHours: place?.openingHours ?? "",
    location: place?.location ?? "",
    reservationStatus: place?.reservationStatus ?? "not_needed",
    referenceLinks: place?.referenceLinks ?? [],
    itineraryItemId: place?.itineraryItemId,
  });
  // A place a booking points at is booked; the 予約 tab owns that.
  const booked = Boolean(
    place && travel.bookings.some((booking) => booking.placeId === place.id),
  );
  const [found, setFound] = useState<{
    link: string;
    name: string | null;
    pin: Coordinates | null;
  }>();
  const [pasteError, setPasteError] = useState("");
  const autoName = useRef("");
  const link = registeredGoogleMapsUrl(draft.location.trim());
  // The link changed: read the place's name from it (or from its redirect).
  useEffect(() => {
    if (!link || link === place?.location) return;
    const named = placeNameFromLink(link);
    const direct = mapCoordinates(link);
    if ((named && direct) || isDemo)
      return setFound({ link, name: named, pin: direct });
    let live = true;
    request<{ name: string | null; lat: number | null; lng: number | null }>(
      `/v1/maps/resolve?url=${encodeURIComponent(link)}`,
    )
      .then(
        (result) =>
          live &&
          setFound({
            link,
            name: named ?? result.name,
            pin:
              direct ??
              (result.lat != null && result.lng != null
                ? { lat: result.lat, lng: result.lng }
                : null),
          }),
      )
      .catch(() => live && setFound({ link, name: named, pin: direct }));
    return () => {
      live = false;
    };
  }, [link, isDemo, request, place?.location]);
  // A found name fills the field unless the person typed their own.
  useEffect(() => {
    const name = found?.link === link ? found.name : null;
    if (!name) return;
    setDraft((current) =>
      !current.title.trim() || current.title === autoName.current
        ? { ...current, title: name }
        : current,
    );
    autoName.current = name;
  }, [found, link]);
  const looking =
    Boolean(link) && link !== place?.location && found?.link !== link;
  const number =
    !place &&
    link &&
    placeNumbers(
      [...travel.places, { ...draft, id: "~new-place", location: link }],
      travel.items,
      travel.bookings,
    ).get("~new-place");
  const { error, busy, submit, blocked } = useSubmit(
    () => {
      const input = { ...draft, title: draft.title.trim() };
      const pin = found?.link === link ? found.pin : null;
      if (place) travel.updatePlace(place.id, input, pin);
      else travel.createPlace(input, pin);
    },
    () =>
      !draft.title.trim()
        ? "場所の名前を入力してください"
        : draft.location.trim() &&
            draft.location !== place?.location &&
            !mapUrl(draft.location)
          ? "正しい住所・URLを入力してください"
          : draft.referenceLinks?.some((entry) => !referenceUrl(entry.url))
            ? "参照リンクはhttps://またはhttp://から入力してください"
            : "",
    onClose,
  );
  const paste = async () => {
    setPasteError("");
    try {
      const text = (await navigator.clipboard.readText()).trim();
      setDraft((current) => ({ ...current, location: text }));
    } catch {
      setPasteError(
        "貼り付けできませんでした。欄を長押しして貼り付けてください",
      );
    }
  };
  const links = draft.referenceLinks ?? [];
  const setLinks = (referenceLinks: typeof links) =>
    setDraft({ ...draft, referenceLinks });
  const locationLabel = "住所・Googleマップのリンク";
  return (
    <Modal
      title={place ? "場所を編集" : "行きたい場所を追加"}
      onClose={onClose}
      full={Boolean(place)}
      addPanel={!place}
      dockActions={
        place
          ? undefined
          : {
              primary: (
                <button type="submit" form={formId} disabled={busy || blocked}>
                  <Glyph name="plus" className="ps-dock-glyph" />
                  追加する
                </button>
              ),
            }
      }
    >
      <form id={formId} className="form place-form" onSubmit={submit}>
        <div className="field">
          <span>{locationLabel}</span>
          <div className="place-link-box">
            <Input
              aria-label={locationLabel}
              placeholder={enterHint(locationLabel)}
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={2000}
              value={draft.location}
              onChange={(event) =>
                setDraft({ ...draft, location: event.target.value })
              }
            />
            <button type="button" className="place-paste" onClick={paste}>
              貼り付け
            </button>
          </div>
          {draft.location.trim() && !link && (
            <small className="place-link-note">
              Googleマップのリンクを貼ると地図に載ります
            </small>
          )}
        </div>
        {looking && <p className="it-plres">場所を読み込んでいます…</p>}
        {/* What the link gave, for a new place and for a changed link alike
            (Tsubasa 2026-10-07: 既存の場所はリンクを読み取れない). */}
        {link &&
          link !== place?.location &&
          !looking &&
          found?.link === link &&
          (found.pin ? (
            <p className="it-plres">
              <MapPin number={number || undefined} />
              {draft.title.trim() || found.name}
              <small>
                {number ? `地図の ${number} として載ります` : "地図に載ります"}
              </small>
            </p>
          ) : (
            <p className="it-plres is-miss">
              このリンクから位置を読み取れませんでした
            </p>
          ))}
        <Field label="場所の名前">
          <Input
            required
            maxLength={160}
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
        <div className="field">
          <span id={`${formId}-res`}>予約</span>
          <div
            className="prep-cats"
            role="radiogroup"
            aria-labelledby={`${formId}-res`}
          >
            {[
              ...reservationChoices.map((entry) => entry.value),
              ...(place?.reservationStatus === "requested"
                ? (["requested"] as const)
                : []),
            ].map((value) => (
              <button
                type="button"
                role="radio"
                key={value}
                className={value === "requested" ? "is-legacy" : undefined}
                disabled={booked}
                aria-checked={
                  (booked ? "confirmed" : draft.reservationStatus) === value
                }
                onClick={() => setDraft({ ...draft, reservationStatus: value })}
              >
                {reservationLabel(value)}
              </button>
            ))}
          </div>
          {booked && (
            <p className="field-hint">予約タブの予約とつながっています</p>
          )}
        </div>
        <Field label="メモ">
          <Textarea
            rows={3}
            value={draft.note}
            maxLength={4000}
            onChange={(event) =>
              setDraft({ ...draft, note: event.target.value })
            }
          />
        </Field>
        <fieldset className="place-links">
          <legend>参照リンク</legend>
          {links.map((entry, index) => (
            <div className="link-input" key={index}>
              <Field label="URL">
                <Input
                  type="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  maxLength={2000}
                  value={entry.url}
                  onChange={(event) =>
                    setLinks(
                      links.map((current, i) =>
                        i === index
                          ? { ...current, url: event.target.value }
                          : current,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="名前">
                <Input
                  maxLength={120}
                  value={entry.label}
                  onChange={(event) =>
                    setLinks(
                      links.map((current, i) =>
                        i === index
                          ? { ...current, label: event.target.value }
                          : current,
                      ),
                    )
                  }
                />
              </Field>
              <Button
                variant="ghost"
                type="button"
                className="icon-button"
                aria-label="リンクを削除"
                onClick={() => setLinks(links.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            type="button"
            className="secondary place-link-add"
            disabled={links.length >= 20}
            onClick={() => setLinks([...links, { label: "", url: "" }])}
          >
            <Plus />
            リンクを追加
          </Button>
        </fieldset>
        <Field label="営業時間">
          <Input
            maxLength={500}
            value={draft.openingHours}
            onChange={(event) =>
              setDraft({ ...draft, openingHours: event.target.value })
            }
          />
        </Field>
        <ErrorText message={pasteError || error} />
        {place && <SaveButton busy={busy} blocked={blocked} />}
      </form>
    </Modal>
  );
}
