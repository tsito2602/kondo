import type {
  ParentSheet,
  SheetDay,
  SheetGlyph,
  SheetKind,
} from "@/data/parent-sheet";
import paletteCss from "./styles/palette.css?raw";

// しおりを渡す: the parent sheet drawn on canvas, as A4 pages for a PDF or as
// one tall image per sheet for LINE. Drawn here rather than screenshotted so
// the files look the same on every phone and work offline. Sizes follow the
// approved mock (kondo-export.html, Tsubasa 2026-11-11 「A,1で実装」).

export type ShareFormat = "pdf" | "img";
export type ShareTheme = "light" | "dark";
export type KindColors = Record<SheetKind, string>;

const BODY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif';
const NUM = `"Bricolage Grotesque", ${BODY}`;

const INKS = {
  light: {
    paper: "#ffffff",
    ink: "#111111",
    mute: "#6f6a63",
    line: "#e6e3dd",
    soft: "#f3f2ef",
  },
  dark: {
    paper: "#141312",
    ink: "#f5f1e9",
    mute: "#aaa49b",
    line: "#2d2b29",
    soft: "#23221f",
  },
};
type Inks = (typeof INKS)["light"];

/** palette.css's display colour of a saved palette ID, per theme. */
const palette = (() => {
  const maps: Record<ShareTheme, Map<string, string>> = {
    light: new Map(),
    dark: new Map(),
  };
  const dark = paletteCss.indexOf('[data-theme="dark"]');
  for (const match of paletteCss.matchAll(
    /--palette-([0-9a-f]{6}):\s*(#[0-9a-f]{3,8})/gi,
  ))
    maps[dark >= 0 && match.index! > dark ? "dark" : "light"].set(
      `#${match[1].toLowerCase()}`,
      match[2],
    );
  return maps;
})();
const shown = (value: string, theme: ShareTheme) =>
  palette[theme].get(value.toLowerCase()) ?? value;

/* ---------- glyphs: itinerary-icons.tsx on the 24px grid ---------- */
type Stroke = { d: string; fill?: boolean; dash?: boolean; width?: number };
const ring = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const GLYPHS: Record<SheetGlyph, Stroke[]> = {
  sight: [{ d: "M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M3 10l9-6 9 6z" }],
  meal: [
    { d: "M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1-4 4-4 8h4" },
  ],
  move: [
    {
      d: "M9 3h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z",
    },
    { d: "M6 11h12M9 21l1.5-4M15 21l-1.5-4" },
    { d: ring(9.5, 14, 1), fill: true },
    { d: ring(14.5, 14, 1), fill: true },
  ],
  shop: [{ d: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" }],
  other: [{ d: ring(12, 12, 7.5) }, { d: ring(12, 12, 2.4), fill: true }],
  up: [
    {
      d: "M2 20h20M4.5 13.5l3 3 12-4.5c1.2-.5 1.6-1.8.8-2.6-.6-.6-1.6-.8-2.4-.4L14 11 7 5 5 6l4 6.3-3.3 1.3-1.7-1.6z",
      width: 1.7,
    },
  ],
  down: [
    {
      d: "M2 20h20M3.5 8.5l.5 4.6 15.4 4.3c1.3.3 2.4-.5 2.4-1.6 0-.9-.6-1.7-1.5-2L15 12.5 12 4h-2.3l.8 7.3L7 10.4 6.2 8z",
      width: 1.7,
    },
  ],
  in: [{ d: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M3 12h11M10 8l4 4-4 4" }],
  out: [{ d: "M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M9 12h12M17 8l4 4-4 4" }],
  bed: [
    {
      d: "M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6M7 12.5a1.8 1.8 0 1 0 0-.01",
    },
  ],
  ticket: [
    { d: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" },
    { d: "M14 7v10", dash: true },
  ],
};
const glyphKind: Partial<Record<SheetGlyph, SheetKind>> = {
  bed: "stay",
  up: "transport",
  down: "transport",
};

/* ---------- sizes (the mock's CSS px; A4 = 595 × 842) ---------- */
const SIZE = {
  pdf: {
    width: 595,
    minHeight: 842,
    scale: 2.5,
    padX: 46,
    padTop: 44,
    padBottom: 40,
    cols: [70, 62],
    gap: 10,
    time: 23,
    japan: 14,
    title: 18,
    sub: 13,
    icon: 24,
    rowPad: 13,
    dayNo: 52,
    dayDate: 19,
    route: 17,
    note: 12,
    name: 32,
  },
  img: {
    width: 360,
    minHeight: 640,
    scale: 3,
    padX: 22,
    padTop: 26,
    padBottom: 22,
    cols: [56, 50],
    gap: 8,
    time: 19,
    japan: 13,
    title: 15.5,
    sub: 12,
    icon: 22,
    rowPad: 10,
    dayNo: 40,
    dayDate: 17,
    route: 15,
    note: 11.5,
    name: 26,
  },
};
type Size = (typeof SIZE)["pdf"];

type Pen = {
  ctx: CanvasRenderingContext2D;
  inks: Inks;
  kinds: KindColors;
  size: Size;
  format: ShareFormat;
};
type Block = { height: number; draw: (pen: Pen, y: number) => void };

const font = (weight: number, size: number, family = BODY) =>
  `${weight} ${size}px ${family}`;
const NO_START =
  /^[、。，．・：；？！」』）〕］｝ゝゞーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々]/;

/** Lines of `text` within `width`: Japanese breaks anywhere, Latin at spaces. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const tokens = paragraph.match(/[A-Za-z0-9.,'’\-/:()]+\s*|\s+|./gu) ?? [];
    let line = "";
    for (const token of tokens) {
      const next = line + token;
      if (!line || ctx.measureText(next.trimEnd()).width <= width) {
        line = next;
        continue;
      }
      // Kinsoku: a closing mark stays with the line before.
      if (NO_START.test(token)) {
        const last = line.slice(-1);
        lines.push(line.slice(0, -1).trimEnd());
        line = last + token;
      } else {
        lines.push(line.trimEnd());
        line = token.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function drawGlyph(
  pen: Pen,
  glyph: SheetGlyph,
  kind: SheetKind | undefined,
  x: number,
  y: number,
  size: number,
) {
  const { ctx } = pen;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  const color = kind ? pen.kinds[kind] : pen.inks.ink;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const part of GLYPHS[glyph]) {
    const path = new Path2D(part.d);
    if (part.fill) ctx.fill(path);
    else {
      ctx.lineWidth = part.width ?? 1.9;
      ctx.setLineDash(part.dash ? [2, 2] : []);
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

function text(
  pen: Pen,
  value: string,
  x: number,
  y: number,
  style: string,
  color: string,
  align: CanvasTextAlign = "left",
) {
  const { ctx } = pen;
  ctx.font = style;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/* ---------- blocks ---------- */
function measure(pen: Pen, style: string, value: string, width: number) {
  pen.ctx.font = style;
  return wrap(pen.ctx, value, width);
}

function dayHeader(
  pen: Pen,
  day: SheetDay,
  tripName: string,
  continued: boolean,
): Block {
  const s = pen.size;
  const inner = s.width - s.padX * 2;
  const routeLines = measure(pen, font(800, s.route), day.route, inner * 0.5);
  // Where the night is spent sits under the route, small (Tsubasa 2026-11-11:
  // no band); a day without one keeps the trip's name there.
  const note = nightNote(day) || tripName;
  const noteLines = measure(pen, font(400, s.note), note, inner * 0.6);
  const noteH = (noteLines.length - 1) * s.note * 1.4;
  const height =
    Math.max(
      s.dayNo * 0.92 + 6 + s.dayDate * 1.35,
      routeLines.length * s.route * 1.35 + 16 + noteH,
    ) + 12;
  return {
    height: height + 2,
    draw(pen, y) {
      const { ctx, inks } = pen;
      const top = y + s.dayNo * 0.82;
      text(
        pen,
        String(day.number),
        s.padX,
        top,
        font(800, s.dayNo, NUM),
        inks.ink,
      );
      ctx.font = font(800, s.dayNo, NUM);
      const nw = ctx.measureText(String(day.number)).width;
      text(
        pen,
        continued ? "日目（つづき）" : "日目",
        s.padX + nw + 2,
        top,
        font(900, s.dayNo * 0.35),
        inks.ink,
      );
      text(
        pen,
        day.date,
        s.padX,
        top + 6 + s.dayDate * 1.1,
        font(800, s.dayDate),
        inks.ink,
      );
      const right = s.width - s.padX;
      let ry =
        y +
        height -
        12 -
        s.route * 0.35 -
        14 -
        noteH -
        (routeLines.length - 1) * s.route * 1.35;
      for (const line of routeLines) {
        text(pen, line, right, ry, font(800, s.route), inks.ink, "right");
        ry += s.route * 1.35;
      }
      let ny = y + height - 12 - noteH;
      for (const line of noteLines) {
        text(pen, line, right, ny, font(400, s.note), inks.mute, "right");
        ny += s.note * 1.4;
      }
      ctx.fillStyle = inks.ink;
      ctx.fillRect(s.padX, y + height, inner, 2);
    },
  };
}

/** 「ホテル・ザッハー・ウィーン泊」「機内泊」「ドバイで乗り継ぎ」「17:35 成田国際空港着」. */
function nightNote(day: SheetDay) {
  if (!day.night) return "";
  return day.night.lead ? `${day.night.text}泊` : day.night.text;
}

function columnHeads(pen: Pen, day: SheetDay): Block {
  const s = pen.size;
  return {
    height: 26,
    draw(pen, y) {
      const label = day.japanOnly ? "時間" : "現地時間";
      text(pen, label, s.padX, y + 20, font(400, 10), pen.inks.mute);
      if (!day.japanOnly)
        text(
          pen,
          "日本",
          s.padX + s.cols[0] + s.gap,
          y + 20,
          font(400, 10),
          pen.inks.mute,
        );
    },
  };
}

function dayRow(
  pen: Pen,
  row: SheetDay["rows"][number],
  japanColumn: boolean,
): Block {
  const s = pen.size;
  const inner = s.width - s.padX * 2;
  const x0 = s.padX;
  const x1 = x0 + s.cols[0] + s.gap;
  const x2 = japanColumn ? x1 + s.cols[1] + s.gap : x1;
  const textX = x2 + s.icon + 9;
  const textW = s.width - s.padX - textX;
  const titles = measure(pen, font(700, s.title), row.title, textW);
  const subs = row.sub ? measure(pen, font(400, s.sub), row.sub, textW) : [];
  const body =
    titles.length * s.title * 1.35 +
    (subs.length ? 2 + subs.length * s.sub * 1.45 : 0);
  const height = Math.max(body, s.time * 1.2, s.icon) + s.rowPad * 2;
  return {
    height,
    draw(pen, y) {
      const { ctx, inks } = pen;
      const top = y + s.rowPad;
      if (row.time)
        text(
          pen,
          row.time,
          x0,
          top + s.time * 0.95,
          font(700, s.time, NUM),
          inks.ink,
        );
      else
        text(
          pen,
          "時間未定",
          x0,
          top + s.title * 0.95,
          font(400, 11),
          inks.mute,
        );
      if (japanColumn && row.japan) {
        const jy = top + s.time * 0.95;
        let jx = x1;
        if (row.japanMark) {
          text(pen, row.japanMark, jx, jy, font(400, 10), inks.mute);
          ctx.font = font(400, 10);
          jx += ctx.measureText(row.japanMark).width + 1;
        }
        text(pen, row.japan, jx, jy, font(500, s.japan, NUM), inks.mute);
      }
      drawGlyph(pen, row.glyph, row.kind, x2, top + 1, s.icon);
      let ty = top + s.title * 1.05;
      for (const line of titles) {
        text(pen, line, textX, ty, font(700, s.title), inks.ink);
        ty += s.title * 1.35;
      }
      ty += 2 - s.title * 1.35 + s.title * 0.3 + s.sub * 1.2;
      for (const line of subs) {
        text(pen, line, textX, ty, font(400, s.sub), inks.mute);
        ty += s.sub * 1.45;
      }
      ctx.fillStyle = inks.line;
      ctx.fillRect(x0, y + height - 1, inner, 1);
    },
  };
}

function overviewBlocks(
  pen: Pen,
  sheet: ParentSheet,
  days: SheetDay[],
): Block[] {
  const s = pen.size;
  const inner = s.width - s.padX * 2;
  const img = pen.format === "img";
  const blocks: Block[] = [];
  const nameLines = measure(pen, font(900, s.name), sheet.name, inner);
  blocks.push({
    height: 16 + nameLines.length * s.name * 1.25 + 13 * 1.5 + 14,
    draw(pen, y) {
      text(pen, "旅のしおり", s.padX, y + 11, font(400, 11), pen.inks.mute);
      let ny = y + 16 + s.name * 1.0;
      for (const line of nameLines) {
        text(pen, line, s.padX, ny, font(900, s.name), pen.inks.ink);
        ny += s.name * 1.25;
      }
      text(
        pen,
        sheet.span,
        s.padX,
        ny - s.name * 0.25 + 13 * 1.2,
        font(400, 13),
        pen.inks.mute,
      );
    },
  });
  const heading = (label: string, glyph?: SheetGlyph): Block => ({
    height: 22 + 18 + 1.5,
    draw(pen, y) {
      let x = s.padX;
      if (glyph) {
        drawGlyph(pen, glyph, glyphKind[glyph], x, y + 22 + 1, 15);
        x += 21;
      }
      text(pen, label, x, y + 22 + 12, font(700, 12), pen.inks.mute);
      pen.ctx.fillStyle = pen.inks.ink;
      pen.ctx.fillRect(s.padX, y + 22 + 18, inner, 1.5);
    },
  });
  const rule = (pen: Pen, y: number) => {
    pen.ctx.fillStyle = pen.inks.line;
    pen.ctx.fillRect(s.padX, y - 1, inner, 1);
  };

  blocks.push(heading("毎日の居場所"));
  for (const day of days) {
    const night = day.night
      ? day.night.glyph === "down"
        ? "帰国"
        : day.night.text
      : "";
    if (img) {
      const dateW = 62;
      const routes = measure(pen, font(700, 14), day.route, inner - dateW - 10);
      const nights = night
        ? measure(pen, font(400, 11), night, inner - dateW - 10)
        : [];
      const h = 16 + routes.length * 14 * 1.35 + nights.length * 11 * 1.45;
      blocks.push({
        height: h,
        draw(pen, y) {
          text(
            pen,
            day.short,
            s.padX,
            y + 8 + 12,
            font(700, 11.5),
            pen.inks.ink,
          );
          let ty = y + 8 + 13;
          for (const line of routes) {
            text(
              pen,
              line,
              s.padX + dateW + 10,
              ty,
              font(700, 14),
              pen.inks.ink,
            );
            ty += 14 * 1.35;
          }
          ty += -14 * 1.35 + 11 * 1.45;
          for (const line of nights) {
            text(
              pen,
              line,
              s.padX + dateW + 10,
              ty,
              font(400, 11),
              pen.inks.mute,
            );
            ty += 11 * 1.45;
          }
          rule(pen, y + h);
        },
      });
    } else {
      const routeX = s.padX + 92;
      const nightW = inner * 0.36;
      const routes = measure(
        pen,
        font(700, 15),
        day.route,
        inner - 92 - nightW - 16,
      );
      const nights = night ? measure(pen, font(400, 12), night, nightW) : [];
      const h =
        18 + Math.max(routes.length * 15 * 1.35, nights.length * 12 * 1.45);
      blocks.push({
        height: h,
        draw(pen, y) {
          text(pen, day.short, s.padX, y + 9 + 14, font(700, 14), pen.inks.ink);
          let ty = y + 9 + 15;
          for (const line of routes) {
            text(pen, line, routeX, ty, font(700, 15), pen.inks.ink);
            ty += 15 * 1.35;
          }
          let ny = y + 9 + 14;
          for (const line of nights) {
            text(
              pen,
              line,
              s.width - s.padX,
              ny,
              font(400, 12),
              pen.inks.mute,
              "right",
            );
            ny += 12 * 1.45;
          }
          rule(pen, y + h);
        },
      });
    }
  }

  if (sheet.flights.length) {
    blocks.push(
      heading(img ? "飛行機（上は現地時間）" : "飛行機（左は現地時間）", "up"),
    );
    for (const flight of sheet.flights) {
      if (img) {
        const dateW = 62;
        // 航空会社 + 便名 on its own line: a full carrier name never fits a column.
        const h =
          16 + 12 * 1.4 + 14 * 1.35 + 14 * 1.3 + (flight.japan ? 11 * 1.45 : 0);
        blocks.push({
          height: h,
          draw(pen, y) {
            text(
              pen,
              flight.date,
              s.padX,
              y + 8 + 12,
              font(700, 11.5),
              pen.inks.ink,
            );
            const x = s.padX + dateW + 10;
            let ty = y + 8 + 12;
            text(pen, flight.number, x, ty, font(700, 12), pen.inks.mute);
            ty += 12 * 1.4 + 1;
            text(pen, flight.route, x, ty, font(700, 14), pen.inks.ink);
            ty += 14 * 1.3;
            text(pen, flight.times, x, ty, font(700, 14, NUM), pen.inks.ink);
            if (flight.japan)
              text(
                pen,
                flight.japan,
                x,
                ty + 11 * 1.45,
                font(400, 11),
                pen.inks.mute,
              );
            rule(pen, y + h);
          },
        });
      } else {
        // 航空会社 便名, then the route on the same line; the A4 page keeps one block per flight.
        const h = 16 + 13 * 1.4 + 16 * 1.3;
        blocks.push({
          height: h,
          draw(pen, y) {
            const top = y + 8 + 13;
            const x = s.padX + 80;
            text(pen, flight.date, s.padX, top, font(400, 13), pen.inks.ink);
            pen.ctx.font = font(700, 13);
            const numberW = pen.ctx.measureText(flight.number).width;
            text(pen, flight.number, x, top, font(700, 13), pen.inks.ink);
            text(
              pen,
              flight.route,
              x + (numberW ? numberW + 14 : 0),
              top,
              font(400, 13),
              pen.inks.ink,
            );
            text(
              pen,
              flight.times,
              x,
              top + 16 * 1.3,
              font(700, 16, NUM),
              pen.inks.ink,
            );
            if (flight.japan)
              text(
                pen,
                flight.japan,
                s.width - s.padX,
                top + 16 * 1.3,
                font(400, 11.5),
                pen.inks.mute,
                "right",
              );
            rule(pen, y + h);
          },
        });
      }
    }
  }

  type Line = {
    value: string;
    style: string;
    color: "ink" | "mute";
    gap: number;
  };
  const boxOf = (lines: Line[], width: number) => {
    const measured = lines.map((line) => ({
      ...line,
      rows: measure(pen, line.style, line.value, width - 28),
    }));
    const height =
      24 + measured.reduce((sum, line) => sum + line.rows.length * line.gap, 0);
    return {
      height,
      draw(pen: Pen, x: number, top: number, h: number) {
        roundRect(pen.ctx, x + 0.75, top + 0.75, width - 1.5, h - 1.5, 14);
        pen.ctx.strokeStyle = pen.inks.ink;
        pen.ctx.lineWidth = 1.5;
        pen.ctx.setLineDash([]);
        pen.ctx.stroke();
        let ty = top + 12;
        for (const line of measured)
          for (const row of line.rows) {
            ty += line.gap;
            text(
              pen,
              row,
              x + 14,
              ty - line.gap * 0.28,
              line.style,
              pen.inks[line.color],
            );
          }
      },
    };
  };
  const hotelLines = sheet.hotels.map((hotel): Line[] => [
    { value: "泊まる所", style: font(400, 12), color: "mute", gap: 18 },
    { value: hotel.name, style: font(700, 15), color: "ink", gap: 21 },
    ...(hotel.address
      ? [
          {
            value: hotel.address,
            style: font(400, 12.5),
            color: "ink" as const,
            gap: 18,
          },
        ]
      : []),
    { value: hotel.span, style: font(400, 12.5), color: "mute", gap: 18 },
  ]);
  const offsetLines: Line[] = sheet.offsets.length
    ? [
        { value: "日本との時差", style: font(400, 12), color: "mute", gap: 18 },
        ...sheet.offsets.map((offset) => ({
          value: `${offset.city}　${offset.hours}時間`,
          style: font(700, 15),
          color: "ink" as const,
          gap: 22,
        })),
      ]
    : [];
  // Boxes side by side on A4 (as the mock), stacked on a phone image.
  const pairs: Line[][][] = [];
  const all = [...hotelLines, ...(offsetLines.length ? [offsetLines] : [])];
  for (let index = 0; index < all.length; index += img ? 1 : 2)
    pairs.push(all.slice(index, index + (img ? 1 : 2)));
  if (pairs.length) blocks.push({ height: 10, draw() {} });
  for (const pair of pairs) {
    const gap = 14;
    const width = pair.length === 2 ? (inner - gap) / 2 : inner;
    const boxes = pair.map((lines) => boxOf(lines, width));
    const height = Math.max(...boxes.map((one) => one.height));
    blocks.push({
      height: 12 + height,
      draw(pen, y) {
        boxes.forEach((one, index) =>
          one.draw(pen, s.padX + index * (width + gap), y + 12, height),
        );
      },
    });
  }
  return blocks;
}

function dayBlocks(pen: Pen, day: SheetDay, tripName: string) {
  const blocks: Block[] = [];
  blocks.push(columnHeads(pen, day));
  for (const row of day.rows) blocks.push(dayRow(pen, row, !day.japanOnly));
  if (!day.rows.length)
    blocks.push({
      height: 40,
      draw(pen, y) {
        text(
          pen,
          "予定はまだありません",
          pen.size.padX,
          y + 26,
          font(400, 13),
          pen.inks.mute,
        );
      },
    });
  return {
    header: (continued: boolean) => dayHeader(pen, day, tripName, continued),
    blocks,
  };
}

/* ---------- pages ---------- */
type Sheet = { header?: (continued: boolean) => Block; blocks: Block[] };
type Page = { blocks: Block[]; height: number };

const FOOTER = 30;

function paginate(sheets: Sheet[], size: Size, format: ShareFormat): Page[] {
  const pages: Page[] = [];
  for (const sheet of sheets) {
    const head = sheet.header?.(false);
    let current: Block[] = head ? [head] : [];
    let used = head?.height ?? 0;
    const room = size.minHeight - size.padTop - size.padBottom - FOOTER;
    for (const block of sheet.blocks) {
      if (
        format === "pdf" &&
        used + block.height > room &&
        current.length > (head ? 1 : 0)
      ) {
        pages.push({ blocks: current, height: size.minHeight });
        const again = sheet.header?.(true);
        current = again ? [again] : [];
        used = again?.height ?? 0;
      }
      current.push(block);
      used += block.height;
    }
    pages.push({
      blocks: current,
      height:
        format === "pdf"
          ? size.minHeight
          : Math.max(
              size.minHeight,
              Math.ceil(size.padTop + used + FOOTER + size.padBottom),
            ),
    });
  }
  return pages;
}

export type RenderedSheet = { canvas: HTMLCanvasElement; label: string };

export async function renderSheets({
  sheet,
  days,
  format,
  theme,
  kindColors,
}: {
  sheet: ParentSheet;
  days: SheetDay[];
  format: ShareFormat;
  theme: ShareTheme;
  kindColors: KindColors;
}): Promise<RenderedSheet[]> {
  try {
    await Promise.all([
      document.fonts.load(`700 20px "Bricolage Grotesque"`),
      document.fonts.load(`800 20px "Bricolage Grotesque"`),
    ]);
  } catch {
    // The system font draws the digits instead.
  }
  const size = SIZE[format];
  const inks = INKS[theme];
  const kinds = Object.fromEntries(
    Object.entries(kindColors).map(([key, value]) => [
      key,
      shown(value, theme),
    ]),
  ) as KindColors;
  const probe = document.createElement("canvas").getContext("2d")!;
  const pen: Pen = { ctx: probe, inks, kinds, size, format };
  const sheets: (Sheet & { label: string })[] = [
    { blocks: overviewBlocks(pen, sheet, days), label: "全体" },
    ...days.map((day) => ({
      ...dayBlocks(pen, day, sheet.name),
      label: `${day.number}日目`,
    })),
  ];
  const labels: string[] = [];
  const pages = sheets.flatMap((one) => {
    const out = paginate([one], size, format);
    out.forEach(() => labels.push(one.label));
    return out;
  });
  return pages.map((page, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(size.width * size.scale);
    canvas.height = Math.round(page.height * size.scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(size.scale, size.scale);
    ctx.fillStyle = inks.paper;
    ctx.fillRect(0, 0, size.width, page.height);
    const draw: Pen = { ...pen, ctx };
    let y = size.padTop;
    for (const block of page.blocks) {
      block.draw(draw, y);
      y += block.height;
    }
    const foot = page.height - size.padBottom;
    text(draw, sheet.asOf, size.padX, foot, font(400, 10), inks.mute);
    text(
      draw,
      `${index + 1} / ${pages.length}`,
      size.width - size.padX,
      foot,
      font(500, 10, NUM),
      inks.mute,
      "right",
    );
    return { canvas, label: labels[index] };
  });
}

/* ---------- files ---------- */
const blobOf = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("画像を作れませんでした")),
      type,
      quality,
    ),
  );

export const pngOf = (canvas: HTMLCanvasElement) => blobOf(canvas, "image/png");

/** A4 pages as one PDF: each page is a JPEG drawn full-bleed (the PDF needs no font of its own). */
export async function pdfOf(canvases: HTMLCanvasElement[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };
  const W = 595.28;
  const H = 841.89;
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  const pageIds = canvases.map((_, index) => 3 + index * 3);
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () =>
    push(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${canvases.length} >>`,
    ),
  );
  for (const [index, canvas] of canvases.entries()) {
    const id = pageIds[index];
    const jpeg = new Uint8Array(
      await (await blobOf(canvas, "image/jpeg", 0.92)).arrayBuffer(),
    );
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    object(id, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
      ),
    );
    object(id + 1, () =>
      push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    );
    object(id + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      );
      push(jpeg);
      push("\nendstream");
    });
  }
  const xref = length;
  const count = 3 + canvases.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++)
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(
    `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
