import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { spring } from "./cartoon";
import { Glyph } from "./itinerary-icons";
import {
  KINDS,
  PALETTE,
  colorLabel,
  displayColor,
  setKindColor,
  useKindColors,
  type KindKey,
} from "./kind-colors";
import { Modal, SaveButton, useToast } from "./ui";

const dark = () => document.documentElement.dataset.theme === "dark";

/** 設定 › カテゴリの色: one row per kind, its glyph in its colour (uchiwake's 費目). */
export function KindColorRows() {
  const colors = useKindColors();
  const [editing, setEditing] = useState<KindKey | null>(null);
  return (
    <>
      <div className="settings-group">
        {KINDS.map((kind) => (
          <button
            key={kind.key}
            type="button"
            className="settings-row"
            data-kind={kind.key}
            onClick={(event) => {
              void spring(
                event.currentTarget,
                [{ transform: "scale(.97)" }, { transform: "none" }],
                "squish",
              );
              setEditing(kind.key);
            }}
          >
            <Glyph name={kind.glyph} className="settings-row-icon is-kind" />
            <span>
              <b>{kind.label}</b>
            </span>
            <span className="settings-row-end">
              {colorLabel(colors[kind.key], dark())}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9 5l7 7-7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        ))}
      </div>
      {editing && (
        <KindColorPanel
          kind={editing}
          saved={colors[editing]}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function KindColorPanel({
  kind,
  saved,
  onClose,
}: {
  kind: KindKey;
  saved: string;
  onClose: () => void;
}) {
  const entry = KINDS.find((item) => item.key === kind)!;
  const [value, setValue] = useState(saved);
  const notify = useToast();
  const formId = useId();
  const name = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setKindColor(kind, value);
    notify(`${entry.label}の色を${colorLabel(value, dark())}にしました`);
    onClose();
  };
  return (
    <Modal title="カテゴリの色" addPanel onClose={onClose}>
      <form id={formId} className="form kind-panel" onSubmit={submit}>
        <div
          className="kind-panel-head"
          style={{ "--kind": displayColor(value) } as CSSProperties}
        >
          <Glyph name={entry.glyph} />
          {entry.label}
        </div>
        <fieldset className="color-picker">
          <legend>
            アイコンのカラー
            <span className="color-picker-value">
              <i
                aria-hidden="true"
                style={{ background: displayColor(value) }}
              />
              {colorLabel(value, dark())}
            </span>
          </legend>
          <p className="palette-hint">
            ライト・ダークに合わせて見やすい色に切り替わります。
          </p>
          <div className="color-swatches">
            {PALETTE.map((color) => (
              <label
                className="color-swatch"
                key={color.value}
                style={
                  {
                    "--swatch-color": displayColor(color.value),
                  } as CSSProperties
                }
              >
                <input
                  type="radio"
                  name={name}
                  value={color.value}
                  checked={value === color.value}
                  onChange={() => setValue(color.value)}
                  aria-label={colorLabel(color.value, dark())}
                />
                <span aria-hidden="true">
                  <span className="swatch-check">✓</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <SaveButton />
      </form>
    </Modal>
  );
}
