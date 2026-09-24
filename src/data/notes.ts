import type { JSONContent } from "@tiptap/core";

export const NOTE_TITLE_LIMIT = 120;
export const NOTE_BODY_LIMIT = 50000;
export const NOTE_CONTENT_LIMIT = 300000;

const blocks = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
];
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A small, shared allowlist. No raw HTML, links, embeds or arbitrary attributes. */
export function validNoteContent(value: unknown): value is JSONContent {
  let count = 0;
  const visit = (node: unknown, allowed: string[], depth: number): boolean => {
    if (
      !object(node) ||
      ++count > 20000 ||
      depth > 20 ||
      typeof node.type !== "string" ||
      !allowed.includes(node.type) ||
      Object.keys(node).some(
        (key) => !["type", "content", "text", "marks", "attrs"].includes(key),
      )
    )
      return false;
    if (node.attrs !== undefined) {
      if (!object(node.attrs)) return false;
      const keys = Object.keys(node.attrs);
      if (node.type === "heading") {
        if (keys.some((key) => key !== "level") || node.attrs.level !== 2)
          return false;
      } else if (node.type === "orderedList") {
        if (
          keys.some((key) => key !== "start" && key !== "type") ||
          !Number.isSafeInteger(node.attrs.start) ||
          Number(node.attrs.start) < 1 ||
          (node.attrs.type !== undefined && node.attrs.type !== null)
        )
          return false;
      } else if (node.type === "taskItem") {
        if (
          keys.some((key) => key !== "checked") ||
          typeof node.attrs.checked !== "boolean"
        )
          return false;
      } else if (keys.length) return false;
    }
    if (
      node.marks !== undefined &&
      (node.type !== "text" ||
        !Array.isArray(node.marks) ||
        node.marks.some(
          (mark) =>
            !object(mark) ||
            !["bold", "italic", "underline", "strike"].includes(
              String(mark.type),
            ) ||
            Object.keys(mark).some((key) => key !== "type"),
        ))
    )
      return false;
    if (node.type === "text")
      return (
        typeof node.text === "string" &&
        node.text.length > 0 &&
        node.content === undefined
      );
    if (node.text !== undefined) return false;
    if (node.type === "hardBreak") return node.content === undefined;
    const children = node.content ?? [];
    if (!Array.isArray(children)) return false;
    const allowedChildren =
      node.type === "doc"
        ? blocks
        : ["paragraph", "heading"].includes(node.type)
          ? ["text", "hardBreak"]
          : node.type === "taskList"
            ? ["taskItem"]
            : ["bulletList", "orderedList"].includes(node.type)
              ? ["listItem"]
              : blocks;
    if (!["paragraph", "heading"].includes(node.type) && !children.length)
      return false;
    if (
      ["listItem", "taskItem"].includes(node.type) &&
      children[0]?.type !== "paragraph"
    )
      return false;
    return children.every((child) => visit(child, allowedChildren, depth + 1));
  };
  return (
    visit(value, ["doc"], 0) &&
    JSON.stringify(value).length <= NOTE_CONTENT_LIMIT
  );
}

/** Plain text remains readable by older clients and powers search/previews. */
export function notePlainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const children = node.content ?? [];
  if (node.type === "taskList")
    return children
      .map(
        (item) =>
          `- [${item.attrs?.checked ? "x" : " "}] ${notePlainText(item)}`,
      )
      .join("\n");
  if (node.type === "bulletList")
    return children.map((item) => `- ${notePlainText(item)}`).join("\n");
  if (node.type === "orderedList")
    return children
      .map(
        (item, i) =>
          `${Number(node.attrs?.start ?? 1) + i}. ${notePlainText(item)}`,
      )
      .join("\n");
  return children
    .map(notePlainText)
    .join(["paragraph", "heading"].includes(node.type ?? "") ? "" : "\n");
}

/** Keep every old line; interpret only the checklist syntax the old editor created. */
export function legacyNoteContent(body: string): JSONContent {
  const content: JSONContent[] = [];
  for (const line of body.split("\n")) {
    const task = /^- \[([ x])\] ?(.*)$/i.exec(line);
    const text = task ? task[2] : line;
    const paragraph: JSONContent = {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    };
    if (task) {
      let list = content.at(-1);
      if (list?.type !== "taskList") {
        list = { type: "taskList", content: [] };
        content.push(list);
      }
      list.content!.push({
        type: "taskItem",
        attrs: { checked: task[1].toLowerCase() === "x" },
        content: [paragraph],
      });
    } else content.push(paragraph);
  }
  return { type: "doc", content };
}
