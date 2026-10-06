// Marks <html data-scrolled> once the page has moved off its top, so a fade
// pinned under a sticky header only shows when content is actually under it
// (行きたい場所's map sits right below the day chips at rest).
export function installScrollState() {
  const root = document.documentElement;
  const update = () =>
    root.toggleAttribute("data-scrolled", window.scrollY > 2);
  window.addEventListener("scroll", update, { passive: true });
  update();
}
