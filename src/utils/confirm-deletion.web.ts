export function confirmDeletion(title: string, message: string, onConfirm: () => void) {
  if (globalThis.confirm([title, message].filter(Boolean).join('\n\n'))) onConfirm();
}
