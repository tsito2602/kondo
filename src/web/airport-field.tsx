import { useId, useState } from "react";
import { findAirports, type Airport } from "@/data/airports";
import { Input } from "./obsidian/input";

export function AirportField({
  label,
  value,
  code,
  onChange,
}: {
  label: string;
  value: string;
  code: string;
  onChange: (value: string, code: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = findAirports(value);
  const expanded = open && options.length > 0;
  const select = (airport: Airport) => {
    onChange(airport.name, airport.code);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div
      className="airport-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="field" htmlFor={id}>
        <span>{label}</span>
        <Input
          id={id}
          role="combobox"
          autoComplete="off"
          maxLength={160}
          value={value}
          placeholder="空港名・都市名・3文字コード"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-options` : undefined}
          aria-activedescendant={
            expanded && active >= 0 ? `${id}-${active}` : undefined
          }
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value, "");
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (!options.length) return;
              event.preventDefault();
              setOpen(true);
              setActive((previous) =>
                event.key === "ArrowDown"
                  ? (previous + 1) % options.length
                  : previous <= 0
                    ? options.length - 1
                    : previous - 1,
              );
            } else if (event.key === "Enter" && expanded) {
              event.preventDefault();
              if (active >= 0) select(options[active]);
              else if (options.length === 1) select(options[0]);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </label>
      {code && <span className="airport-code">{code}</span>}
      {expanded && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-label={`${label}の候補`}
          className="airport-options"
        >
          {options.map((airport, index) => (
            <li
              role="option"
              id={`${id}-${index}`}
              key={airport.code}
              aria-selected={index === active}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => select(airport)}
            >
              <span>
                <strong>{airport.name}</strong>
                <small>{airport.city}</small>
              </span>
              <b>{airport.code}</b>
            </li>
          ))}
        </ul>
      )}
      {open && value.trim() && !options.length && (
        <small className="muted">
          候補がない場合は、入力した空港名のまま保存できます。
        </small>
      )}
    </div>
  );
}
