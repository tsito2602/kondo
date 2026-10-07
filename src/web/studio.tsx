import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { BorderBeam } from "border-beam";
import { startSoftOrbit } from "./soft-orbit";

// What marks an operation that runs AI, as in uchiwake (Tsubasa 2026-10-07:
// 「AIが動く操作は虹ボタン」「実際にAIが動く操作はパネルの縁を虹色に」).

// Libraries.dev's Tune in Studio wand and its ten sparks (uchiwake's
// studio-action-label.tsx).
const sparks = [
  [-1, -3, 0, -11, 900, 0],
  [2, -2, 9, -9, 1000, 120],
  [2, 5, 9, 9, 950, 240],
  [-5, -2, -9, -9, 1000, 360],
  [3, 1, 12, 1, 920, 480],
  [-1, -3, 0, -11, 950, 520],
  [2, -2, 9, -9, 900, 650],
  [2, 5, 9, 9, 1000, 760],
  [-5, -2, -9, -9, 930, 180],
  [3, 1, 12, 1, 980, 300],
];

/** The rainbow button's wand and label; the button carries .studio-action. */
export function StudioActionLabel({ label }: { label: string }) {
  return (
    <>
      <span className="studio-action-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8.66667 9.33333L6.66667 7.33333M10.0069 2.33333V1.33333M12.6331 3.37377L13.3402 2.66667M12.6331 8.66667L13.3402 9.37377M7.34023 3.37377L6.63313 2.66667M13.6736 6H14.6736M4.08758 13.9124L10.2458 7.75425C10.5098 7.49024 10.6418 7.35823 10.6912 7.20601C10.7347 7.07212 10.7347 6.92788 10.6912 6.79399C10.6418 6.64177 10.5098 6.50976 10.2458 6.24575L9.75425 5.75425C9.49024 5.49024 9.35823 5.35823 9.20601 5.30877C9.07212 5.26527 8.92788 5.26527 8.79399 5.30877C8.64177 5.35823 8.50976 5.49024 8.24575 5.75425L2.08758 11.9124C1.82357 12.1764 1.69156 12.3084 1.6421 12.4607C1.5986 12.5946 1.5986 12.7388 1.6421 12.8727C1.69156 13.0249 1.82357 13.1569 2.08758 13.4209L2.57909 13.9124C2.8431 14.1764 2.9751 14.3084 3.12732 14.3579C3.26122 14.4014 3.40545 14.4014 3.53934 14.3579C3.69156 14.3084 3.82357 14.1764 4.08758 13.9124Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="studio-action-sparks">
          {sparks.map(([ox, oy, sx, sy, duration, delay], index) => (
            <i
              key={index}
              style={
                {
                  "--ox": `${ox}px`,
                  "--oy": `${oy}px`,
                  "--sx": `${sx}px`,
                  "--sy": `${sy}px`,
                  "--sd": `${duration}ms`,
                  "--sdelay": `${delay}ms`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      </span>
      <span className="studio-action-label">{label}</span>
    </>
  );
}

function SoftOrbitGlow() {
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!overlay.current) return;
    return startSoftOrbit(
      overlay.current,
      Array.from(overlay.current.querySelectorAll("canvas")),
    );
  }, []);
  return (
    <div ref={overlay} className="soft-orbit-glow" aria-hidden="true">
      <canvas />
      <canvas />
      <canvas />
    </div>
  );
}

/**
 * uchiwake's reading glow (Soft Orbit + a colourful BorderBeam) on the rim of
 * `panel` while `active`; it outlives the reading by a beat, fading as the
 * result lands. It sits beside the panel, not in it, so it stays on the rim
 * while the panel's content scrolls.
 */
export function AiGlow({
  active,
  panel,
}: {
  active: boolean;
  panel: { current: HTMLElement | null };
}) {
  const [shown, setShown] = useState(active);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) return setShown(true);
    const timer = setTimeout(() => setShown(false), 1300);
    return () => clearTimeout(timer);
  }, [active]);
  useLayoutEffect(() => {
    const target = panel.current;
    const glow = box.current;
    if (!shown || !target || !glow) return;
    const place = () => {
      Object.assign(glow.style, {
        left: `${target.offsetLeft}px`,
        top: `${target.offsetTop}px`,
        width: `${target.offsetWidth}px`,
        height: `${target.offsetHeight}px`,
        borderRadius: getComputedStyle(target).borderRadius,
      });
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(target);
    addEventListener("resize", place);
    return () => {
      watch.disconnect();
      removeEventListener("resize", place);
    };
  }, [shown, panel]);
  if (!shown) return null;
  return (
    <div
      ref={box}
      className="ai-glow"
      data-leaving={!active || undefined}
      aria-hidden="true"
    >
      <SoftOrbitGlow />
      <div className="ai-border-beam">
        <BorderBeam
          size="md"
          theme="light"
          colorVariant="colorful"
          borderRadius={30}
          style={{ position: "absolute", inset: 0 }}
        >
          <div style={{ height: "100%", borderRadius: 30 }} />
        </BorderBeam>
      </div>
    </div>
  );
}
