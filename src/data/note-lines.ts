/** A note body is plain text; each line is a paragraph, a `- [ ]` check or a `## ` heading. */
export type NoteLineKind = 'p' | 'c' | 'h';
export type NoteLine = { kind: NoteLineKind; text: string; done: boolean };

const CHECK = /^- \[([ xX])\] ?(.*)$/;
const HEADING = /^## ?(.*)$/;

export function parseNoteLine(raw: string): NoteLine {
  const check = CHECK.exec(raw);
  if (check) return { kind: 'c', text: check[2], done: check[1] !== ' ' };
  const heading = HEADING.exec(raw);
  if (heading) return { kind: 'h', text: heading[1], done: false };
  return { kind: 'p', text: raw, done: false };
}

export const parseNoteBody = (body: string): NoteLine[] => body.split('\n').map(parseNoteLine);

export function noteLineText(line: NoteLine): string {
  if (line.kind === 'c') return `- [${line.done ? 'x' : ' '}] ${line.text}`;
  if (line.kind === 'h') return `## ${line.text}`;
  return line.text;
}

export const serializeNoteLines = (lines: NoteLine[]): string => lines.map(noteLineText).join('\n');

/** Lines worth showing on a tile: blank paragraphs carry nothing. */
export const visibleNoteLines = (body: string) =>
  parseNoteBody(body)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.kind === 'c' || line.text.trim());

/** Flip one check line in place, leaving every other byte of the body untouched. */
export function toggleNoteCheck(body: string, index: number): string {
  const lines = body.split('\n');
  const line = parseNoteLine(lines[index] ?? '');
  if (line.kind !== 'c') return body;
  lines[index] = noteLineText({ ...line, done: !line.done });
  return lines.join('\n');
}
