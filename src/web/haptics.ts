// Adapted from tsito2602/uchino. A light tick under the finger.
//
// iPhone has no vibration API: Safari plays its system tick only when a native
// `<input type="checkbox" switch>` toggles during a user gesture. Nothing is
// laid over the controls (an invisible switch under the finger swallows the
// touch and stops scrolling). Instead, once a control has really been clicked,
// a hidden label toggles one shared switch. A drag that starts on a control
// scrolls normally, and releasing after it never clicks, so it never ticks.
//
// Android ticks through the Vibration API instead, which only has a length,
// so the pulse is kept short and reserved for confirmed actions (a submitted
// form, a ticked task, or any control marked `data-haptic`), not navigation.

export const ios =
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)));

const tappable =
  "button,a[href],[role=button],[role=menuitem],[role=tab],[role=option],[role=switch],[role=checkbox]";

let label: HTMLLabelElement | undefined;

function iosLabel() {
  if (label?.isConnected) return label;
  label = document.createElement("label");
  label.className = "haptic-touch";
  label.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  input.className = "haptic-touch";
  label.appendChild(input);
  document.body.appendChild(label);
  return label;
}

export function haptic() {
  try {
    if (ios) iosLabel().click();
    else if (typeof navigator.vibrate === "function") navigator.vibrate(5);
  } catch {
    /* Haptics are a nicety only. */
  }
}

/** The hidden label's own clicks must be ignored by document listeners. */
export const isHapticTouch = (target: EventTarget | null) =>
  target instanceof Element && target.classList.contains("haptic-touch");

export function installHaptics() {
  if (typeof document === "undefined") return;
  document.addEventListener(
    "click",
    (event) => {
      if (isHapticTouch(event.target)) return;
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest<HTMLElement>(
        ios ? tappable : "[data-haptic]",
      );
      if (
        !control ||
        control.matches(":disabled, [aria-disabled=true]") ||
        control.closest("[data-no-haptic]")
      )
        return;
      haptic();
    },
    true,
  );
  if (!ios) document.addEventListener("submit", haptic, true);
}
