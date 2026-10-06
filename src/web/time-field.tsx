import {
  type InputHTMLAttributes,
  type Ref,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { parseClock, typedClock } from "@/data/time-picker";
import { spring } from "./cartoon";

type Native = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode" | "defaultValue"
>;

/**
 * A time typed from a ticket or by hand: digits only on the numeric keypad,
 * 「2220」 shows and saves 22:20, 「930」 09:30. The whole value is selected on
 * focus so typing replaces it; Enter or leaving the field commits. Anything
 * that is not 00:00–23:59 shakes and goes back to the last good time.
 *
 * `onChange` gets "HH:MM" (or "" when `allowEmpty`); returning false rejects
 * the time the same way. With `live`, a complete time (four digits) is passed
 * on while typing, so a form never misses one that was not blurred.
 */
export function TimeField({
  value,
  onChange,
  allowEmpty = true,
  live = true,
  ref,
  className,
  placeholder = "--:--",
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: Native & {
  value: string;
  onChange: (value: string) => boolean | void;
  allowEmpty?: boolean;
  live?: boolean;
  ref?: Ref<HTMLInputElement | null>;
}) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  const [draft, setDraft] = useState<string | null>(null);
  /** Nothing typed since focus: the late selection below may still apply. */
  const fresh = useRef(false);
  const [invalid, setInvalid] = useState(false);
  const shake = () => {
    setInvalid(true);
    setTimeout(() => setInvalid(false), 700);
    if (input.current)
      void spring(
        input.current,
        [{ transform: "translateX(10px)" }, { transform: "none" }],
        "boing",
      );
  };
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const parsed = parseClock(draft);
    if (parsed === null || (parsed === "" && !allowEmpty)) return shake();
    if (parsed !== value && onChange(parsed) === false) shake();
  };
  return (
    <input
      {...rest}
      ref={input}
      type="text"
      inputMode="numeric"
      pattern="[0-9:]*"
      autoComplete="off"
      enterKeyHint="done"
      maxLength={5}
      data-time-field=""
      aria-invalid={invalid || undefined}
      className={`time-field${className ? ` ${className}` : ""}`}
      placeholder={placeholder}
      value={draft ?? value}
      onFocus={(event) => {
        onFocus?.(event);
        const field = event.currentTarget;
        field.select();
        fresh.current = true;
        // iOS drops a selection made during focus; select again once it has
        // settled, unless a digit has already been typed.
        setTimeout(() => {
          if (fresh.current && document.activeElement === field)
            field.setSelectionRange(0, field.value.length);
        });
      }}
      onChange={(event) => {
        fresh.current = false;
        const typed = typedClock(event.target.value);
        setDraft(typed);
        if (!live || typed.length !== 5) return;
        const parsed = parseClock(typed);
        if (parsed && parsed !== value) onChange(parsed);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape" && draft !== null) {
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        onBlur?.(event);
        commit();
      }}
    />
  );
}
