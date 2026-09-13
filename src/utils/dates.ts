export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}

export function formatDate(value: string, year = false) {
  if (!validDate(value)) return value;
  return new Intl.DateTimeFormat('ja-JP', { ...(year ? { year: 'numeric' } : {}), month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`));
}

export function addDays(value: string, count: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + count);
  return localDate(date);
}
