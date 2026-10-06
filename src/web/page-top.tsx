import type { ReactNode } from "react";
import { tripTabs } from "./trip-dock";

/** A screen's heading as uchiwake draws it (.page-heading in its
    kondo-style.css): the page's own dock icon at 24 px, 10 px from a 21 px
    title, the small mute line under it, round actions (PagePlus) at the right
    (Tsubasa 2026-10-06: 「各ページの見出しの大きさuchiwakeといっしょにして。
    見出しの左に各ページのアイコン」). */
export function PageTop({
  tab,
  sub,
  title,
  actions,
}: {
  /** The trip tab whose icon leads the title. */
  tab: (typeof tripTabs)[number]["path"];
  sub?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-top">
      <div>
        <h2 className="page-heading">
          {tripTabs.find((entry) => entry.path === tab)?.icon}
          {title}
        </h2>
        {sub && <small>{sub}</small>}
      </div>
      {actions && <div className="page-top-acts">{actions}</div>}
    </div>
  );
}
