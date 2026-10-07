export type DateRange = { startDate: string; endDate: string };

export function calendarDate(year: number, month: number, day: number): string {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date.toISOString().slice(0, 10);
}

export function monthDays(year: number, month: number): (string | null)[] {
  const first = new Date(
    `${calendarDate(year, month, 1)}T00:00:00Z`,
  ).getUTCDay();
  const count = Number(calendarDate(year, month + 1, 0).slice(8));
  return Array.from({ length: 42 }, (_, index) =>
    index >= first && index < first + count
      ? calendarDate(year, month, index - first + 1)
      : null,
  );
}

export function selectRangeDate(
  range: DateRange,
  phase: "start" | "end",
  date: string,
): DateRange {
  if (phase === "start" || !range.startDate)
    return { startDate: date, endDate: "" };
  if (date < range.startDate)
    return { startDate: date, endDate: range.startDate };
  return { startDate: range.startDate, endDate: date };
}

export function rangeRows(days: (string | null)[], range: DateRange) {
  return Array.from({ length: 6 }, (_, row) => {
    const columns = Array.from({ length: 7 }, (_, column) => column).filter(
      (column) => {
        const date = days[row * 7 + column];
        return (
          date &&
          range.startDate &&
          range.endDate &&
          date >= range.startDate &&
          date <= range.endDate
        );
      },
    );
    return columns.length
      ? { first: columns[0], last: columns[columns.length - 1] }
      : null;
  });
}

/** 「10/19（月）」, with the year in front when it isn't this year's. */
export function shortDate(value: string, now = new Date()): string {
  if (!value) return "未設定";
  const [year, month, day] = value.split("-").map(Number);
  const week = "日月火水木金土"[
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];
  return `${year === now.getFullYear() ? "" : `${year}/`}${month}/${day}（${week}）`;
}
