/** Hand off the original HTML splash without remounting/replaying its SVG. */
export function finishBootScreen() {
  const screen = document.getElementById("initial-boot");
  const root = document.getElementById("root");
  if (!screen) return;
  let cancelled = false;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const remove = () => {
    if (cancelled) return;
    screen.remove();
    root?.removeAttribute("inert");
  };
  const dismiss = async () => {
    // Finished animations may already have elapsed while the app was loading.
    // allSettled also releases the gate if a preference change cancels them.
    if (!motion.matches)
      await Promise.allSettled(
        Array.from(screen.getAnimations({ subtree: true }), (a) => a.finished),
      );
    if (cancelled) return;
    if (!motion.matches && (await landInDock(screen))) return remove();
    if (cancelled) return;
    if (!motion.matches) {
      screen.classList.add("boot-leaving");
      await Promise.allSettled(screen.getAnimations().map((a) => a.finished));
    }
    remove();
  };
  void dismiss();
  return () => {
    cancelled = true;
    screen.classList.remove("boot-leaving");
  };
}

/** kondo-cartoon §1's ending: the wordmark fades, the logo crouches, hops and
    falls into the dock, which inflates out of the impact while the splash
    fades (120 ms). Only where the phone dock is showing. */
async function landInDock(screen: HTMLElement) {
  const host = document.querySelector<HTMLElement>(
    ".thumb-dock-host:not([hidden])",
  );
  const logo = screen.querySelector<SVGElement>(".boot-symbol");
  const dock = host?.getBoundingClientRect();
  if (!logo || !dock?.width || !logo.animate) return false;
  screen
    .querySelector(".boot-name")
    ?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      fill: "forwards",
    });
  const r = logo.getBoundingClientRect();
  const dx = dock.left + dock.width / 2 - (r.left + r.width / 2),
    dy = dock.top + dock.height / 2 - (r.top + r.height / 2);
  await logo
    .animate(
      [
        { transform: "none" },
        { transform: "translateY(6px) scale(1.12,.84)", offset: 0.25 },
        { transform: "translateY(-46px) scale(.9,1.12)", offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) scale(.3,.42)` },
      ],
      {
        duration: 640,
        easing: "cubic-bezier(.45,0,.75,.5)",
        fill: "forwards",
      },
    )
    .finished.catch(() => undefined);
  logo.style.opacity = "0";
  window.dispatchEvent(new CustomEvent("kondo:dock-inflate"));
  await screen
    .animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 120,
      fill: "forwards",
    })
    .finished.catch(() => undefined);
  return true;
}
