export function ticketDate(day: string, referenceDay?: string) {
  if (!day) return "日付未定";
  const [year, month, date] = day.split("-");
  const short = `${Number(month)}/${Number(date)}`;
  return referenceDay?.slice(0, 4) === year ? short : `${year}/${short}`;
}
