import type { ReactNode } from "react";

/** A screen's opening line, as the trip mocks draw it (.top): a small mute
    line over the page title, with round actions (PagePlus) at the right. */
export function PageTop({
  sub,
  title,
  actions,
  size = 28,
}: {
  sub?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  /** 28 px (予約, メモ) or 30 px (準備). */
  size?: 28 | 30;
}) {
  return (
    <div className="page-top" data-size={size}>
      <div>
        {sub && <small>{sub}</small>}
        <h2>{title}</h2>
      </div>
      {actions && <div className="page-top-acts">{actions}</div>}
    </div>
  );
}
