// Adapted from tsito2602/uchino. A light tick under the finger.
//
// iPhone has no vibration API: Safari plays its system tick only when a finger
// itself toggles a native `<input type="checkbox" switch>`. Every tappable
// control therefore carries an invisible switch over its surface. The tap
// toggles it first and only then is the press handed to the control, so a
// control that re-renders or disappears on press cannot remove the switch
// before it has ticked.
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

export function haptic() {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(5);
  } catch {
    /* Haptics are a nicety only. */
  }
}

/** The invisible switch's own click must never reach document listeners. */
export const isHapticTouch = (target: EventTarget | null) =>
  target instanceof Element && target.classList.contains("haptic-touch");

function equip(host: HTMLElement) {
  const own = host.querySelectorAll<HTMLInputElement>(":scope > .haptic-touch");
  // React may duplicate or wipe the switch when it rewrites a control's text.
  if (own.length > 1) for (const input of own) input.remove();
  else if (own.length) return;
  if (
    host.closest("[data-no-haptic]") ||
    host.matches("input, select, textarea, [contenteditable]")
  )
    return;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.className = "haptic-touch";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  let pressed = false;
  input.addEventListener("click", (event) => {
    event.stopPropagation();
    pressed = true;
  });
  // The native change event fires once the toggle (and its tick) is complete.
  input.addEventListener("change", () => {
    if (!pressed) return;
    pressed = false;
    host.click();
  });
  host.setAttribute("data-haptic-host", "");
  host.appendChild(input);
}

export function installHaptics() {
  if (typeof document === "undefined") return;
  if (ios) {
    let queued = false;
    const scan = () => {
      queued = false;
      for (const host of document.querySelectorAll<HTMLElement>(tappable))
        equip(host);
    };
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(scan);
    }).observe(document.body, { childList: true, subtree: true });
    scan();
    return;
  }
  document.addEventListener("submit", haptic, true);
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-haptic]:not(:disabled)")) haptic();
    },
    true,
  );
}
