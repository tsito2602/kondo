import { DatePicker } from "./date-picker";
import { DateTimeRows } from "./datetime-rows";
import { withTime } from "@/data/datetime-rows";
import { dismissModal } from "./motion";
import { Button } from "./obsidian/button";
import { Input } from "./obsidian/input";
import { Textarea } from "./obsidian/textarea";
import { type FormEvent, useRef, useState } from "react";
import { Trash2, Plus, Paperclip } from "lucide-react";
import { bookingIcons, spring } from "./booking-card";
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
  placeStatuses,
  reservationStatuses,
  referenceUrl,
  mapUrl,
} from "@/data/places";
import { localDate, validDate } from "@/utils/dates";
import type {
  Trip,
  Booking,
  BookingKind,
  ItineraryItem,
  Place,
  ItineraryCategory,
  TransportMode,
} from "@/data/types";
import { Modal, Field, ErrorText, SaveButton, useAction } from "./ui";

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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const dialog = (event.currentTarget as HTMLFormElement).closest("dialog");
    const message = validate();
    setError(message);
    if (!message)
      void run(async () => {
        await save();
        dismissModal(close, dialog);
      });
  };
  return { error, busy, submit };
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
  const { error, busy, submit } = useSubmit(
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
            placeholder="ヨーロッパ旅行"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </Field>
        <Field label="行き先">
          <Input
            maxLength={160}
            placeholder="ウィーン、ミュンヘン"
            value={draft.destination}
            onChange={(event) =>
              setDraft({ ...draft, destination: event.target.value })
            }
          />
        </Field>
        <DatePicker
          label="旅行期間"
          range
          required
          value={draft.startsOn}
          endValue={draft.endsOn}
          onChange={(startsOn, endsOn) =>
            setDraft({ ...draft, startsOn, endsOn })
          }
        />
        <ErrorText message={error} />
        <SaveButton busy={busy || imageBusy} />
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
  const [details, setDetails] = useState(() => {
    const initial = item
      ? itemDetails(item)
      : {
          ...emptyItineraryDetails("sightseeing"),
          location: place?.location ?? "",
        };
    // A timed plan always has an end here, an hour by default (Google Calendar).
    if (!item?.time || initial.endTime) return initial;
    const when = withTime(
      { day: item.day, time: item.time, endDay: "", endTime: "" },
      item.time,
    );
    return { ...initial, endDay: when.endDay, endTime: when.endTime };
  });
  const { error, busy, submit } = useSubmit(
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
        travel.updatePlace(place.id, {
          ...place,
          itineraryItemId: id,
          status: place.status === "want" ? "planned" : place.status,
        });
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
      <form className="form" onSubmit={submit}>
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
          <DateTimeRows
            startLabel={details.category === "transport" ? "出発" : "開始"}
            endLabel={details.category === "transport" ? "到着" : "終了"}
            min={travel.selectedTrip?.startsOn}
            max={travel.selectedTrip?.endsOn}
            value={{
              day: draft.day,
              time: draft.time,
              endDay: details.endDay ?? "",
              endTime: details.endTime ?? "",
            }}
            onChange={(when) => {
              setDraft({ ...draft, day: when.day, time: when.time });
              setDetails({
                ...details,
                endDay: when.endDay,
                endTime: when.endTime,
              });
            }}
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
        <SaveButton busy={busy} />
      </form>
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
  const { error, busy, submit } = useSubmit(
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
        ? "先に種類を選んでください"
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
      <div className="bk-kinds" role="group" aria-label="種類">
        {bookingKinds.map((entry) => {
          const Icon = bookingIcons[entry.value];
          return (
            <button
              key={entry.value}
              type="button"
              aria-pressed={draft.kind === entry.value}
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
              例：GK211。空欄の場合は出発地・到着地を表示します。
            </p>
          )}
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
          {!route &&
            field(
              "location",
              "住所・Google MapsのURL",
              false,
              kind === "hotel" || !travel.places.length
                ? undefined
                : "booking-places",
            )}
          {!route && kind !== "hotel" && travel.places.length > 0 && (
            <datalist id="booking-places">
              {travel.places.map((place) => (
                <option key={place.id} value={place.title} />
              ))}
            </datalist>
          )}
          <DatePicker
            label={dateLabels.label}
            startLabel={dateLabels.start}
            endLabel={dateLabels.end}
            range={rangeBooking}
            required
            showTime
            value={draft.day}
            endValue={draft.endDay}
            startTime={draft.time}
            endTime={draft.endTime}
            onChange={(day, endDay, time, endTime) =>
              setDraft({
                ...draft,
                day,
                endDay,
                time,
                endTime: rangeBooking ? endTime : time,
              })
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
          {field("confirmationCode", "予約番号")}
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
      <SaveButton busy={busy} />
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
export function PlaceEditor({
  place,
  onClose,
}: {
  place?: Place;
  onClose: () => void;
}) {
  const travel = useTravel();
  const [draft, setDraft] = useState({
    title: place?.title ?? "",
    note: place?.note ?? "",
    openingHours: place?.openingHours ?? "",
    location: place?.location ?? "",
    status: place?.status ?? "want",
    reservationStatus: place?.reservationStatus ?? "not_needed",
    referenceLinks: place?.referenceLinks ?? [],
    itineraryItemId: place?.itineraryItemId,
  });
  const { error, busy, submit } = useSubmit(
    () => {
      if (place) travel.updatePlace(place.id, draft);
      else travel.createPlace(draft);
    },
    () =>
      !draft.title.trim()
        ? "場所の名前を入力してください"
        : draft.location && !mapUrl(draft.location)
          ? "正しい住所・URLを入力してください"
          : draft.referenceLinks.some((link) => !referenceUrl(link.url))
            ? "参照リンクはhttps://またはhttp://から入力してください"
            : "",
    onClose,
  );
  return (
    <Modal
      title={place ? "場所を編集" : "行きたい場所を追加"}
      onClose={onClose}
      full={Boolean(place)}
      addPanel={!place}
    >
      <form className="form place-form" onSubmit={submit}>
        <Field label="場所の名前">
          <Input
            required
            placeholder="お店やスポットの名前"
            maxLength={160}
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
        <div className="form-grid">
          <Field label="訪問ステータス">
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as Place["status"],
                })
              }
            >
              {placeStatuses.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="予約状況">
            <select
              value={draft.reservationStatus}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  reservationStatus: event.target
                    .value as Place["reservationStatus"],
                })
              }
            >
              {reservationStatuses.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="住所・Google MapsのURL">
          <Input
            maxLength={2000}
            placeholder="住所または地図のリンクを貼り付け"
            autoCapitalize="none"
            autoCorrect="off"
            value={draft.location}
            onChange={(event) =>
              setDraft({ ...draft, location: event.target.value })
            }
          />
        </Field>
        <Field label="メモ">
          <Textarea
            rows={3}
            placeholder="気になること、食べたいものなど"
            value={draft.note}
            maxLength={4000}
            onChange={(event) =>
              setDraft({ ...draft, note: event.target.value })
            }
          />
        </Field>
        <fieldset className="place-links">
          <legend>参照リンク</legend>
          {draft.referenceLinks.map((link, index) => (
            <div className="link-input" key={index}>
              <Field label="URL">
                <Input
                  type="url"
                  placeholder="https://"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  maxLength={2000}
                  value={link.url}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      referenceLinks: draft.referenceLinks.map((entry, i) =>
                        i === index
                          ? { ...entry, url: event.target.value }
                          : entry,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="名前">
                <Input
                  maxLength={120}
                  placeholder="公式サイトなど（任意）"
                  value={link.label}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      referenceLinks: draft.referenceLinks.map((entry, i) =>
                        i === index
                          ? { ...entry, label: event.target.value }
                          : entry,
                      ),
                    })
                  }
                />
              </Field>
              <Button
                variant="ghost"
                type="button"
                className="icon-button"
                aria-label="リンクを削除"
                onClick={() =>
                  setDraft({
                    ...draft,
                    referenceLinks: draft.referenceLinks.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            type="button"
            className="secondary place-link-add"
            disabled={draft.referenceLinks.length >= 20}
            onClick={() =>
              setDraft({
                ...draft,
                referenceLinks: [
                  ...draft.referenceLinks,
                  { label: "", url: "" },
                ],
              })
            }
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

        <ErrorText message={error} />
        <SaveButton busy={busy} />
      </form>
    </Modal>
  );
}
