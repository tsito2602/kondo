import { type FormEvent, useId, useState } from "react";
import { useTravel } from "@/data/travel-provider";
import {
  emptyItineraryDetails,
  itineraryCategories,
  itineraryDetailsError,
  transportModes,
} from "@/data/itinerary";
import { registeredGoogleMapsUrl } from "@/data/places";
import type {
  ItineraryCategory,
  ItineraryDetails,
  TransportMode,
} from "@/data/types";
import { dismissModal } from "./motion";
import { ErrorText, Modal, useAction } from "./ui";
import { categoryGlyph, Glyph, MapPin } from "./itinerary-icons";
import { previewPlace, savePlanPlace } from "./plan-place";
import { shiftDay, TimelinePicker, TimeRangeButton } from "./timeline-picker";
import { coordsFromLink } from "@/data/geo";

/**
 * A1: the + swells into this sheet right above the dock; 「追加する」 waits in the
 * dock. The day being looked at is preselected. Bookings are added in 予約.
 */
export function PlanAddSheet({
  day,
  days,
  onClose,
  onAdded,
}: {
  day: string;
  days: string[];
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const travel = useTravel();
  const formId = useId();
  const [selectedDay, setDay] = useState(day);
  const [category, setCategory] = useState<ItineraryCategory>("sightseeing");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [endDayOffset, setEndDayOffset] = useState(0);
  const [picking, setPicking] = useState(false);
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  // 移動: the same fields as the plan's edit sheet (plan-sheet.tsx).
  const [mode, setMode] = useState<TransportMode>("train");
  const [origin, setOrigin] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState("");
  const { busy, run } = useAction();
  const resolved = previewPlace(place, title, travel, {
    day: selectedDay,
    time,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const dialog = event.currentTarget.closest("dialog");
    const details: ItineraryDetails = {
      ...emptyItineraryDetails(category),
      ...(endTime
        ? { endTime, endDay: shiftDay(selectedDay, endDayOffset) }
        : {}),
      ...(category === "transport"
        ? {
            transport: {
              mode,
              origin: origin.trim(),
              destination: place.trim(),
              ...(duration ? { durationMinutes: Number(duration) } : {}),
            },
          }
        : {}),
    };
    const message = !title.trim()
      ? "なにをするか入れてください"
      : itineraryDetailsError(selectedDay, time, details);
    setError(message);
    if (message) return;
    void run(() => {
      const link =
        category === "transport" ? null : registeredGoogleMapsUrl(place.trim());
      if (category !== "transport") details.location = link ?? place.trim();
      if (link) details.ownPlace = true;
      const id = travel.createItem({
        day: selectedDay,
        time,
        kind: itineraryCategories.find((entry) => entry.value === category)!
          .label,
        title: title.trim(),
        note,
        details,
      });
      // The plan exists first, so the new place can point at it.
      if (link) savePlanPlace(travel, { id, title }, link);
      dismissModal(() => {
        onClose();
        onAdded(id);
      }, dialog);
    });
  };
  return (
    <Modal
      title="予定を追加"
      onClose={onClose}
      addPanel
      dockActions={{
        // The ＋ panel's dock: ‹ cancels, 「追加する」 is the ink pill.
        primary: (
          <button type="submit" form={formId} disabled={busy}>
            <Glyph name="plus" className="ps-dock-glyph" />
            追加する
          </button>
        ),
      }}
    >
      <form id={formId} className="plan-add" onSubmit={submit}>
        <div className="field">
          <span>カテゴリ</span>
          <div className="it-chips" role="group" aria-label="カテゴリ">
            {itineraryCategories.map((entry) => (
              <button
                type="button"
                key={entry.value}
                aria-pressed={category === entry.value}
                data-kind={entry.value}
                onClick={() => setCategory(entry.value)}
              >
                <Glyph name={categoryGlyph[entry.value]} />
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>なにをする？</span>
          <input
            className="it-inp"
            maxLength={160}
            value={title}
            placeholder="予定を入力"
            autoComplete="off"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="it-row2">
          <div className="field">
            <span className="it-sr">時刻</span>
            <TimeRangeButton
              className="it-inp"
              day={selectedDay}
              time={time}
              endTime={endTime}
              endDayOffset={endDayOffset}
              onOpen={() => setPicking(true)}
            />
          </div>
          <label className="field">
            <span className="it-sr">場所</span>
            <input
              className="it-inp"
              maxLength={160}
              value={place}
              placeholder={
                category === "transport"
                  ? "行き先を入力"
                  : "マップのリンクか場所の名前を入力"
              }
              aria-label={
                category === "transport"
                  ? "行き先"
                  : "場所の名前、または Google マップのリンク"
              }
              autoComplete="off"
              onChange={(event) => setPlace(event.target.value)}
            />
          </label>
        </div>
        {resolved && category !== "transport" && (
          <p className="it-plres">
            <MapPin number={resolved.number} />
            {resolved.name}
            <small>地図の {resolved.number} として載ります</small>
          </p>
        )}
        {category !== "transport" &&
          place.trim() &&
          !registeredGoogleMapsUrl(place.trim()) && (
            <small className="it-plnote">
              名前だけなので地図には載りません
            </small>
          )}
        {category === "transport" && (
          <>
            <div className="field">
              <span>手段</span>
              <div className="ps-chips" role="group" aria-label="手段">
                {transportModes.map((entry) => (
                  <button
                    type="button"
                    key={entry.value}
                    aria-pressed={mode === entry.value}
                    onClick={() => setMode(entry.value)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>出発地</span>
              <input
                className="it-inp"
                placeholder="出発地を入力"
                maxLength={160}
                autoComplete="off"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
              />
            </label>
            <label className="field">
              <span>所要時間（分）</span>
              <input
                className="it-inp"
                placeholder="所要時間を入力"
                type="number"
                inputMode="numeric"
                min={1}
                max={10080}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </label>
          </>
        )}
        <label className="field">
          <span>メモ</span>
          <textarea
            className="it-inp"
            placeholder="メモを入力"
            rows={2}
            maxLength={4000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <ErrorText message={error} />
      </form>
      {picking && (
        <TimelinePicker
          title={title.trim() || "新しい予定"}
          day={selectedDay}
          days={days}
          time={time}
          endTime={endTime}
          endDayOffset={endDayOffset}
          self={category === "transport" ? null : coordsFromLink(place)}
          allowClear
          onSave={(picked) => {
            setDay(picked.day);
            setTime(picked.time);
            setEndTime(picked.endTime);
            setEndDayOffset(picked.endDayOffset);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </Modal>
  );
}
