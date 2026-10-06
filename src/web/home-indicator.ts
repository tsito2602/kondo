/** kondo keeps viewport-fit=contain (the browser owns the top safe area), so
    on an installed iPhone app env(safe-area-inset-bottom) reads 0 while the
    page still runs under the home indicator. uchiwake (viewport-fit=cover)
    sits its dock max(8px, that inset) above the edge; to match it exactly
    (Tsubasa 2026-10-06), an iPhone with a notch or Dynamic Island — every
    one of them has a home indicator — gets the indicator's 34 px back. */
const INDICATOR = 34;

export function installHomeIndicatorInset() {
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone) return;
  const apply = () => {
    const portrait = window.innerHeight >= window.innerWidth;
    // contain leaves the status bar out of the viewport: 20 px on a classic
    // iPhone, 44 px or more on one with a notch or Dynamic Island.
    const statusBar = screen.height - window.innerHeight;
    const notched = portrait && statusBar >= 40 && statusBar < 80;
    document.documentElement.style.setProperty(
      "--dock-safe-bottom",
      notched ? `${INDICATOR}px` : "max(8px, env(safe-area-inset-bottom))",
    );
  };
  apply();
  window.addEventListener("orientationchange", () => setTimeout(apply, 300));
}
