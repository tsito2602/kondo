import { DatePicker } from "./date-picker";
import { dismissModal } from "./motion";
import { Button } from "./obsidian/button";
import { Input } from "./obsidian/input";
import { Textarea } from "./obsidian/textarea";
import { type FormEvent, useRef, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { findAirports } from "@/data/airports";
import { findMatchingItineraryItem } from "@/data/booking-match";
import { useTravel } from "@/data/travel-provider";
import {
  itineraryCategories,
  transportModes,
  emptyItineraryDetails,
  itemDetails,
  itineraryDetailsError,
} from "@/data/itinerary";
import {
  placeStatuses,
  reservationStatuses,
  referenceUrl,
  mapUrl,
} from "@/data/places";
import { assigneeName, memberAssignee } from "@/data/assignee";
import { localDate, validDate } from "@/utils/dates";
import type {
  Trip,
  Booking,
  BookingKind,
  ItineraryItem,
  Place,
  TravelTask,
  PackingItem,
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
  const [details, setDetails] = useState(
    item
      ? itemDetails(item)
      : {
          ...emptyItineraryDetails("sightseeing"),
          location: place?.location ?? "",
        },
  );
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
        <DatePicker
          label={details.category === "transport" ? "出発" : "開始"}
          startLabel={details.category === "transport" ? "出発" : "開始"}
          required
          showTime
          value={draft.day}
          startTime={draft.time}
          onChange={(day, _end, time) => setDraft({ ...draft, day, time })}
        />
        <DatePicker
          label={details.category === "transport" ? "到着" : "終了"}
          startLabel={details.category === "transport" ? "到着" : "終了"}
          showTime
          min={draft.day}
          value={details.endDay ?? ""}
          startTime={details.endTime}
          onChange={(endDay, _end, endTime) =>
            setDetails({ ...details, endDay, endTime })
          }
        />
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
export function BookingEditor({
  booking,
  onClose,
}: {
  booking?: Booking;
  onClose: () => void;
}) {
  const travel = useTravel();
  const [draft, setDraft] = useState({
    kind: booking?.kind ?? ("flight" as BookingKind),
    title: booking?.title ?? "",
    detail: booking?.detail ?? "",
    location: booking?.location ?? "",
    origin: booking?.origin ?? "",
    originCode: booking?.originCode ?? "",
    destination: booking?.destination ?? "",
    destinationCode: booking?.destinationCode ?? "",
    day: booking?.day ?? travel.selectedTrip?.startsOn ?? localDate(),
    time: booking?.time ?? "",
    endDay: booking?.endDay ?? "",
    endTime: booking?.endTime ?? "",
    durationMinutes: booking?.durationMinutes ?? null,
    confirmationCode: booking?.confirmationCode ?? "",
    note: booking?.note ?? "",
  });
  const [mergeId, setMergeId] = useState<string | null>(null);
  const candidate = !booking
    ? findMatchingItineraryItem(travel.items, draft)
    : null;
  const merged = candidate?.item.id === mergeId ? candidate.item : null;
  const { error, busy, submit } = useSubmit(
    () => {
      const input = {
        ...draft,
        title: draft.title.trim(),
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
      if (booking) travel.updateBooking(booking.id, input);
      else travel.createBooking(input);
      if (merged) travel.deleteItem(merged.id);
    },
    () =>
      !draft.title.trim()
        ? "予約名を入力してください"
        : dateError(draft.day) ||
          (draft.endDay && !validDate(draft.endDay)
            ? "正しい終了日を入力してください"
            : "") ||
          (draft.kind !== "flight" && draft.endDay && draft.endDay < draft.day
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
      | "originCode"
      | "destination"
      | "destinationCode"
      | "confirmationCode",
    label: string,
    required = false,
  ) => (
    <Field label={label}>
      <Input
        list={
          key === "originCode" || key === "destinationCode"
            ? `airports-${key}`
            : undefined
        }
        required={required}
        value={draft[key]}
        maxLength={
          key === "location"
            ? 2000
            : key === "detail"
              ? 500
              : key === "confirmationCode"
                ? 120
                : key.endsWith("Code")
                  ? 8
                  : 160
        }
        onChange={(event) =>
          setDraft({
            ...draft,
            [key]:
              key.endsWith("Code") && key !== "confirmationCode"
                ? event.target.value.toUpperCase()
                : event.target.value,
          })
        }
      />
      {(key === "originCode" || key === "destinationCode") && (
        <datalist id={`airports-${key}`}>
          {findAirports(draft[key]).map((airport) => (
            <option key={airport.code} value={airport.code}>
              {airport.name}
            </option>
          ))}
        </datalist>
      )}
    </Field>
  );
  const route = ["flight", "train", "car"].includes(draft.kind);
  const rangeBooking = route || draft.kind === "hotel";
  const dateLabels = {
    flight: { label: "フライト日時", start: "出発", end: "到着" },
    hotel: { label: "宿泊期間", start: "チェックイン", end: "チェックアウト" },
    train: { label: "乗車日時", start: "出発", end: "到着" },
    car: { label: "利用期間", start: "受取", end: "返却" },
    restaurant: { label: "予約日・予約時刻", start: "予約日", end: "" },
    ticket: { label: "利用日・利用時刻", start: "利用日", end: "" },
    other: { label: "日付・時刻", start: "日付", end: "" },
  }[draft.kind];
  return (
    <Modal title={booking ? "予約を編集" : "予約を追加"} onClose={onClose} full>
      <form className="form" onSubmit={submit}>
        <Field label="種類">
          <select
            value={draft.kind}
            onChange={(event) =>
              setDraft({ ...draft, kind: event.target.value as BookingKind })
            }
          >
            {bookingKinds.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        {field("title", "予約名", true)}
        {field(
          "detail",
          draft.kind === "flight" ? "便名・航空会社" : "予約内容",
        )}
        {route && (
          <>
            <div className="form-grid">
              {field("origin", "出発地・受取場所")}
              {field("destination", "到着地・返却場所")}
            </div>
            {draft.kind === "flight" && (
              <div className="form-grid">
                {field("originCode", "出発空港（IATA）")}
                {field("destinationCode", "到着空港（IATA）")}
              </div>
            )}
          </>
        )}
        {!route && field("location", "住所・Google MapsのURL")}
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
        {["flight", "train"].includes(draft.kind) && (
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
        <ErrorText message={error} />
        <SaveButton busy={busy} />
      </form>
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
      full
    >
      <form className="form" onSubmit={submit}>
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
            value={draft.location}
            onChange={(event) =>
              setDraft({ ...draft, location: event.target.value })
            }
          />
        </Field>
        <Field label="営業時間">
          <Input
            maxLength={500}
            value={draft.openingHours}
            onChange={(event) =>
              setDraft({ ...draft, openingHours: event.target.value })
            }
          />
        </Field>
        <fieldset>
          <legend>参照リンク</legend>
          {draft.referenceLinks.map((link, index) => (
            <div className="link-input" key={index}>
              <Field label="名前">
                <Input
                  maxLength={120}
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
              <Field label="URL">
                <Input
                  type="url"
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
            className="secondary"
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
        <Field label="メモ">
          <Textarea
            rows={5}
            value={draft.note}
            maxLength={4000}
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
export function PreparationEditor({
  type,
  item,
  onClose,
}: {
  type: "task" | "packing";
  item?: TravelTask | PackingItem;
  onClose: () => void;
}) {
  const travel = useTravel();
  const task = type === "task";
  const [name, setName] = useState(
    item ? ("title" in item ? item.title : item.name) : "",
  );
  const [assignee, setAssignee] = useState(item?.assignee ?? "");
  const [dueOn, setDueOn] = useState(item && "dueOn" in item ? item.dueOn : "");
  const [hasDueDate, setHasDueDate] = useState(Boolean(dueOn));
  const [category, setCategory] = useState(
    item && "category" in item ? item.category : "その他",
  );
  const [quantity, setQuantity] = useState(
    item && "quantity" in item ? item.quantity : 1,
  );
  const [shared, setShared] = useState(
    item && "shared" in item ? (item.shared ?? false) : false,
  );
  const { error, busy, submit } = useSubmit(
    () => {
      if (task) {
        const input = {
          title: name,
          dueOn: hasDueDate ? dueOn : "",
          assignee,
          done: item && "done" in item ? item.done : false,
        };
        if (item) travel.updateTask(item.id, input);
        else travel.createTask(input);
      } else {
        const input = {
          name,
          category,
          quantity,
          assignee,
          shared,
          packed: item && "packed" in item ? item.packed : false,
        };
        if (item) travel.updatePackingItem(item.id, input);
        else travel.createPackingItem(input);
      }
    },
    () =>
      !name.trim()
        ? "名前を入力してください"
        : task && hasDueDate && !validDate(dueOn)
          ? "正しい期限を入力してください"
          : "",
    onClose,
  );
  const { run: runDelete, busy: deleting } = useAction();
  const deleteButton = item ? (
    <button
      type="button"
      className="icon-button danger"
      aria-label={`${task ? "やること" : "持ち物"}を削除`}
      disabled={busy || deleting}
      onClick={() => {
        if (!confirm(`「${name}」を削除しますか？`)) return;
        void runDelete(() => {
          if (task) travel.deleteTask(item.id);
          else travel.deletePackingItem(item.id);
          dismissModal(onClose);
        });
      }}
    >
      <Trash2 size={20} />
    </button>
  ) : undefined;
  return (
    <Modal
      title={`${task ? "やること" : "持ち物"}を${item ? "編集" : "追加"}`}
      onClose={onClose}
      full={task}
      action={deleteButton}
      dockActions={{ actions: deleteButton }}
    >
      <form className="form" onSubmit={submit}>
        <Field label={task ? "やること" : "持ち物"}>
          <Input
            required
            maxLength={task ? 160 : 120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="担当">
          <select
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="">未指定</option>
            {travel.members.map((member) => (
              <option key={member.id} value={memberAssignee(member.id)}>
                {member.name || member.email}
              </option>
            ))}
            {assignee &&
              !travel.members.some(
                (member) => memberAssignee(member.id) === assignee,
              ) && (
                <option value={assignee}>
                  {assigneeName(assignee, travel.members)}
                </option>
              )}
          </select>
        </Field>
        {task ? (
          <>
            <label className="check-line">
              <input
                type="checkbox"
                checked={hasDueDate}
                onChange={(event) => setHasDueDate(event.target.checked)}
              />
              期限を設定する
            </label>
            {hasDueDate && (
              <DatePicker
                label="期限"
                required
                value={dueOn}
                onChange={(day) => setDueOn(day)}
              />
            )}
          </>
        ) : (
          <>
            <div className="form-grid">
              <Field label="カテゴリ">
                <Input
                  maxLength={40}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                />
              </Field>
              <Field label="個数">
                <Input
                  type="number"
                  min={1}
                  max={99}
                  required
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </Field>
            </div>
            <label className="check-line">
              <input
                type="checkbox"
                checked={shared}
                onChange={(event) => setShared(event.target.checked)}
              />
              みんなで使う共用品
            </label>
          </>
        )}
        <ErrorText message={error} />
        <SaveButton busy={busy} />
      </form>
    </Modal>
  );
}
