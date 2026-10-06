import type { ReactNode } from "react";

// The pictures and small icons of kondo-prep3.html (its <symbol> sprite),
// drawn the same way: 40 × 40 pictures for packing, 24 × 24 line icons.

const PICTURES = {
  passport: (
    <>
      <rect
        x="9"
        y="5"
        width="22"
        height="30"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <circle
        cx="20"
        cy="17"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M14.5 17h11M20 11.5c-2.5 3.5-2.5 7.5 0 11M20 11.5c2.5 3.5 2.5 7.5 0 11M14 28h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  battery: (
    <>
      <rect
        x="11"
        y="6"
        width="18"
        height="29"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path
        d="M21.5 12l-5 9h7l-5 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </>
  ),
  brush: (
    <>
      <path
        d="M9 33L26 12"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <rect
        x="23"
        y="4"
        width="9"
        height="12"
        rx="2.5"
        transform="rotate(38 27.5 10)"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path
        d="M26 6.5l3 2.4M24.6 8.6l3 2.4M23.2 10.7l3 2.4"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </>
  ),
  shirt: (
    <>
      <path
        d="M15 6l-8 5 3 7 4-2v18h12V16l4 2 3-7-8-5c-1 3-3 4.5-5 4.5S16 9 15 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </>
  ),
  dress: (
    <>
      <path
        d="M16 5h8l-1 7 7 22H10l7-22z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M15 17h10" stroke="currentColor" strokeWidth="2.2" />
    </>
  ),
  plug: (
    <>
      <rect
        x="10"
        y="12"
        width="20"
        height="16"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path
        d="M16 12V5M24 12V5M20 28v7"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </>
  ),
  pill: (
    <>
      <rect
        x="7"
        y="14"
        width="26"
        height="12"
        rx="6"
        transform="rotate(-35 20 20)"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path
        d="M16 13l8 14"
        stroke="currentColor"
        strokeWidth="2.4"
        transform="rotate(-10 20 20)"
      />
    </>
  ),
  umbrella: (
    <>
      <path
        d="M5 20a15 13 0 0 1 30 0z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M20 20v10a3.5 3.5 0 0 1-7 0M20 7V5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </>
  ),
  camera: (
    <>
      <rect
        x="5"
        y="12"
        width="30"
        height="21"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <circle
        cx="20"
        cy="22.5"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path
        d="M14 12l2.5-5h7l2.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </>
  ),
  jacket: (
    <>
      <path
        d="M14 5l-8 6v23h28V11l-8-6-6 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M20 11v23M13 22h4M23 22h4"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </>
  ),
  shoe: (
    <>
      <path
        d="M5 27V14h9c1 4 5 6 10 7l9 2c2 .5 3 2 3 4v2H5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M5 31h31" stroke="currentColor" strokeWidth="2.6" />
    </>
  ),
  lens: (
    <>
      <circle
        cx="12"
        cy="20"
        r="7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <circle
        cx="28"
        cy="20"
        r="7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path d="M19.5 20h1" stroke="currentColor" strokeWidth="2.6" />
    </>
  ),
  book: (
    <>
      <path
        d="M20 10c-4-3-9-3-13-2v23c4-1 9-1 13 2 4-3 9-3 13-2V8c-4-1-9-1-13 2zM20 10v23"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </>
  ),
  bag: (
    <>
      <rect
        x="7"
        y="13"
        width="26"
        height="21"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path
        d="M14 13a6 6 0 0 1 12 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
    </>
  ),
  coin: (
    <>
      <circle
        cx="20"
        cy="20"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <path
        d="M24.5 14.5a7 7 0 1 0 0 11M12 18h10M12 22h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </>
  ),
} satisfies Record<string, ReactNode>;
export type PictureName = keyof typeof PICTURES;

/** What the thing is, read from its name (or category); a plain bag otherwise. */
const MATCH: [RegExp, PictureName][] = [
  [/パスポート|旅券/, "passport"],
  [/バッテリー|充電/, "battery"],
  [/歯ブラシ|洗面|歯みがき/, "brush"],
  [/プラグ|変換|アダプタ|コンセント/, "plug"],
  [/薬/, "pill"],
  [/カメラ/, "camera"],
  [/上着|ジャケット|コート/, "jacket"],
  [/きれいめ|ドレス|ワンピース/, "dress"],
  [/服|着替え|シャツ|下着|衣類/, "shirt"],
  [/傘/, "umbrella"],
  [/靴/, "shoe"],
  [/コンタクト|眼鏡|メガネ|サングラス|レンズ/, "lens"],
  [/本|ガイド/, "book"],
  [/小銭|硬貨|コイン|財布/, "coin"],
];
export function pictureFor(name: string, category = ""): PictureName {
  return (
    MATCH.find(([pattern]) => pattern.test(name))?.[1] ??
    MATCH.find(([pattern]) => pattern.test(category))?.[1] ??
    "bag"
  );
}

export function Picture({ name }: { name: PictureName }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      {PICTURES[name]}
    </svg>
  );
}

export function CheckIcon({ stroke = 3.2 }: { stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}
