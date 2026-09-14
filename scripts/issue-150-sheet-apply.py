from pathlib import Path

def edit(path, pairs):
 p=Path(path); s=p.read_text()
 for a,b in pairs:
  assert a in s,(path,a[:100]); s=s.replace(a,b)
 p.write_text(s)

edit('src/components/motion-modal.web.tsx',[
 ('[data-testid="picker-sheet"], [data-testid="delete-trip-dialog"]','[data-testid="picker-sheet"], [data-testid="note-editor"], [data-testid="delete-trip-dialog"]'),
 ('[data-testid="modal-viewport"]\';','[data-testid="modal-viewport"], [data-testid="note-modal-viewport"]\';'),
 ('surface.matches(\'[data-testid="form-sheet"], [data-testid="picker-sheet"]\')','surface.matches(\'[data-testid="form-sheet"], [data-testid="picker-sheet"], [data-testid="note-editor"]\')'),
 ('if (presentedDetail) {',"if (presentedDetail || (sheet && typeof surface.animate === 'function')) {"),
 ('return detailMotion.current.setOpen(open, reduced, finish);',"return detailMotion.current.setOpen(open, reduced, finish, presentedDetail ? 'detail' : surface.dataset.testid === 'picker-sheet' ? 'picker' : 'form');")])
edit('src/detail-motion.css', [('.motion-overlay[data-presentation="detail"] [data-detail-motion]', '.motion-overlay[data-presentation] [data-motion-surface][data-detail-motion]:is(.is-open, .is-closing)')])
p=Path('src/utils/detail-motion.web.ts'); s=p.read_text(); a=s.index('// Animate semantic sections'); b=s.index('/** Owns one mounted',a)
s=s[:a]+'''export type SheetMotionKind = 'detail' | 'form' | 'picker';

// One level of meaningful sections; never stagger calendar cells or both a
// field wrapper and its children. Form controls keep their original DOM nodes.
export function detailContentBlocks(content: HTMLElement): HTMLElement[] {
  const scroll = content.querySelector<HTMLElement>('[data-testid="form-sheet-scroll"], [data-testid="sheet-content-scroll"]');
  const header = content.querySelector<HTMLElement>('[data-testid="sheet-header"]');
  const footer = content.querySelector<HTMLElement>('[data-testid="sheet-footer"]');
  const wrappers = '[data-testid="place-details"], [data-testid="itinerary-item-details"], [data-testid="booking-details-summary"]';
  const sections = Array.from(scroll ? scroll.firstElementChild?.children ?? [] : content.children).flatMap((element) =>
    element.matches(wrappers) ? Array.from(element.children) : [element]);
  const win = content.ownerDocument.defaultView!;
  const blocks = [...new Set([scroll && header && !scroll.contains(header) ? header : null, ...sections, scroll && footer && !scroll.contains(footer) ? footer : null])].filter((element): element is HTMLElement =>
    element instanceof win.HTMLElement && element.getClientRects().length > 0
    && win.getComputedStyle(element).display !== 'none' && element.dataset.testid !== 'detail-dismiss-handle');
  return blocks.length ? blocks : [content];
}

'''+s[b:]
for a,b in [
 ("const content = surface.querySelector<HTMLElement>('[data-testid=\"form-sheet-fill\"]');", "const content = surface.querySelector<HTMLElement>('[data-testid=\"form-sheet-fill\"]') ?? surface;"),
 ('let generation = 0, opened = false, isOpen = false, disposed = false;', "let generation = 0, opened = false, isOpen = false, disposed = false;\n  let lastKind: SheetMotionKind = 'detail';\n  const restingOpacity = new WeakMap<HTMLElement, string>();"),
 ('const animate = (open: boolean, reduced: boolean, done: () => void) => {','const animate = (open: boolean, reduced: boolean, done: () => void, kind: SheetMotionKind) => {'),
 ('const first = !opened;\n    isOpen', "const first = !opened;\n    const changedKind = opened && kind !== lastKind;\n    lastKind = kind;\n    blocks.forEach((element, index) => { if (!restingOpacity.has(element)) restingOpacity.set(element, states[index].opacity || '1'); });\n    isOpen"),
 ("surface.dataset.detailMotion = '';", "surface.dataset.detailMotion = '';\n    surface.dataset.sheetMotionKind = kind;"),
 ("if (open && opened && start.transform === 'none' && start.opacity === '1')", "if (open && opened && !changedKind && start.transform === 'none' && start.opacity === '1')"),
 ('const duration = open ? 280 : returning ? 420 : 240;', "const duration = open ? changedKind ? 180 : 280 : returning ? 420 : 240;\n    const utility = kind !== 'detail';"),
 ('const stagger = Math.min(revealStagger, maxRevealSpread / Math.max(1, blocks.length - 1));','const stagger = Math.min(utility ? 55 : revealStagger, (utility ? 280 : maxRevealSpread) / Math.max(1, blocks.length - 1));'),
 ("const from = open && first ? { opacity: '0', transform: 'translate3d(0px, 20px, 0px)' } : states[index];", "const from = open && (first || changedKind) ? { opacity: '0', transform: `translate3d(0px, ${utility ? 16 : 20}px, 0px)` } : states[index];"),
 ('const delay = first ? duration + index * stagger : 0;', 'const delay = first ? duration + index * stagger : changedKind ? index * Math.min(stagger, 35) : 0;'),
 ('], revealDuration, delay, revealEase);','], utility ? 560 : revealDuration, delay, revealEase);'),
 ("{ opacity: '1' }], revealFadeDuration, delay, revealFadeEase);", "{ opacity: restingOpacity.get(element) ?? '1' }], utility ? 360 : revealFadeDuration, delay, revealFadeEase);"),
 ('const work = [...animations];', '''// Never make a focused input invisible while the user starts typing.
      if (open && surface.contains(doc.activeElement) && doc.activeElement?.matches('input, textarea, [contenteditable="true"]')) { settle(); return () => {}; }
      const work = [...animations];'''),
 ('const resize = () => settle();', '''const resize = () => settle();
  const focusin = (event: FocusEvent) => {
    if (isOpen && animations.length && event.target instanceof win.HTMLElement && event.target.matches('input, textarea, [contenteditable="true"]')) settle();
  };'''),
 ("surface.addEventListener('keydown', keydown);", "surface.addEventListener('keydown', keydown);\n  surface.addEventListener('focusin', focusin);"),
 ('setOpen(open: boolean, reduced: boolean, done: () => void) { bindHandle(); return animate(open, reduced, done); }', "setOpen(open: boolean, reduced: boolean, done: () => void, kind: SheetMotionKind = 'detail') { bindHandle(); return animate(open, reduced, done, kind); }"),
 ('delete surface.dataset.detailMotion;', 'delete surface.dataset.detailMotion; delete surface.dataset.sheetMotionKind;'),
 ("surface.removeEventListener('keydown', keydown);", "surface.removeEventListener('keydown', keydown); surface.removeEventListener('focusin', focusin);")]:
 assert a in s,a[:100]; s=s.replace(a,b)
p.write_text(s)
edit('src/screens/places-screen.tsx',[
 ('const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>();','const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>();\n  const [actionOrigin, setActionOrigin] = useState<DetailOrigin>();'),
 ('onPress={() => setStatusPlace(place)}','onPress={(event) => { setActionOrigin(captureDetailOrigin(event)); setStatusPlace(place); }}'),
 ('onPress={() => {\n              if (itineraryItem','onPress={(event) => {\n              setActionOrigin(captureDetailOrigin(event));\n              if (itineraryItem'),
 ('? (place) => {\n      setEditing(null);','? (place, origin) => {\n      setActionOrigin(origin);\n      setEditing(null);'),
 ('<FormSheet visible title="ステータスを変更"','<FormSheet detailOrigin={actionOrigin} visible title="ステータスを変更"'),
 ('<FormSheet visible title="しおりに追加"','<FormSheet detailOrigin={actionOrigin} visible title="しおりに追加"')])
edit('src/components/place-sheet.tsx',[
 ("import type { DetailOrigin } from '@/utils/detail-origin';", "import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';"),
 ('onPlan?: (place: Place) => void;', 'onPlan?: (place: Place, origin?: DetailOrigin) => void;'),
 ('onPress={() => onPlan(currentPlace)}','onPress={(event) => onPlan(currentPlace, captureDetailOrigin(event))}')])
edit('src/components/flight-connection-sheet.tsx',[
 ('import { usePalette', "import { MotionModal } from './motion-modal';\nimport type { DetailOrigin } from '@/utils/detail-origin';\nimport type { ComponentProps } from 'react';\nimport { usePalette"),
 ('{ Modal, Pressable','{ Pressable'),
 ('onPress: () => void; compact?', "onPress: ComponentProps<typeof Pressable>['onPress']; compact?"),
 ('FlightConnectionSheet({ bookingId, onClose }: { bookingId: string;','FlightConnectionSheet({ bookingId, onClose, detailOrigin }: { detailOrigin?: DetailOrigin; bookingId: string;'),
 ('<ConnectionEditor key=','<ConnectionEditor detailOrigin={detailOrigin} key='),
 ('function ConnectionEditor({ booking, bookings, onClose, onSave }: {','function ConnectionEditor({ booking, bookings, onClose, onSave, detailOrigin }: {\n  detailOrigin?: DetailOrigin;'),
 ('<Modal visible transparent','<MotionModal detailOrigin={detailOrigin} visible transparent'), ('</Modal>','</MotionModal>'),
 ('<View style={styles.header}>','<View testID="sheet-header" style={styles.header}>'),
 ('<ScrollView showsVerticalScrollIndicator','<ScrollView testID="sheet-content-scroll" showsVerticalScrollIndicator'),
 ('<View style={styles.footer}>','<View testID="sheet-footer" style={styles.footer}>')])
for path in ['src/screens/itinerary-screen.tsx','src/screens/bookings-screen.tsx']:
 pairs=[
 ('const [connectionBookingId, setConnectionBookingId] = useState<string | null>(null);','const [connectionBookingId, setConnectionBookingId] = useState<string | null>(null);\n  const [connectionOrigin, setConnectionOrigin] = useState<DetailOrigin>();'),
 ('<FlightConnectionSheet bookingId={connectionBookingId}','<FlightConnectionSheet detailOrigin={connectionOrigin} bookingId={connectionBookingId}')]
 if 'itinerary' in path:
  pairs += [('onPress={() => setConnectionBookingId(connection.arrivalBookingId)}','onPress={(event) => { setConnectionOrigin(captureDetailOrigin(event)); setConnectionBookingId(connection.arrivalBookingId); }}'),
 ('onPress={() => setConnectionBookingId(entry.booking!.id)}','onPress={(event) => { setConnectionOrigin(captureDetailOrigin(event)); setConnectionBookingId(entry.booking!.id); }}'),
 ('nextFlight?: Booking; onPress: () => void; disabled?', "nextFlight?: Booking; onPress: ComponentProps<typeof Pressable>['onPress']; disabled?")]
 else:
  pairs += [('onPress={() => setConnectionBookingId(booking.id)}','onPress={(event) => { setConnectionOrigin(captureDetailOrigin(event)); setConnectionBookingId(booking.id); }}')]
 edit(path,pairs)
edit('src/components/date-range-picker.tsx',[
 ("import { MotionPresence }", "import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';\nimport { MotionPresence }"),
 ('const [open, setOpen] = useState(false);','const [open, setOpen] = useState(false);\n  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>();'),
 ('onPress={() => setOpen(true)}','onPress={(event) => { setDetailOrigin(captureDetailOrigin(event)); setOpen(true); }}'),
 ('<DateRangeDialog startDate=','<DateRangeDialog detailOrigin={detailOrigin} startDate='),
 ('function DateRangeDialog({ startDate,','function DateRangeDialog({ detailOrigin, startDate,'),
 ('Props & { close: () => void }','Props & { detailOrigin?: DetailOrigin; close: () => void }'),
 ('<MotionModal transparent','<MotionModal detailOrigin={detailOrigin} transparent'),
 ('<ScrollView ref={scroll}','<ScrollView testID="sheet-content-scroll" ref={scroll}')])
edit('src/screens/notes-screen.tsx',[
 ('import * as Crypto', "import { MotionModal } from '@/components/motion-modal';\nimport { MotionPresence } from '@/components/motion-presence';\nimport { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';\nimport * as Crypto"),
 ('KeyboardAvoidingView, Modal, Platform','KeyboardAvoidingView, Platform'),
 ('const [editing, setEditing] = useState<TravelNote | null>(null);','const [editing, setEditing] = useState<TravelNote | null>(null);\n  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>();'),
 ("const add = () => setEditing({ id: Crypto.randomUUID(), body: '', pinned: false, updatedAt: Math.floor(Date.now() / 1000) });", "const add = () => { setDetailOrigin(undefined); setEditing({ id: Crypto.randomUUID(), body: '', pinned: false, updatedAt: Math.floor(Date.now() / 1000) }); };"),
 ('onPress={() => setEditing(note)}','onPress={(event) => { setDetailOrigin(captureDetailOrigin(event)); setEditing(note); }}'),
 ('{editing ? <NoteEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} /> : null}','<MotionPresence>{editing ? <NoteEditor detailOrigin={detailOrigin} key={editing.id} initial={editing} onClose={() => setEditing(null)} /> : null}</MotionPresence>'),
 ('function NoteEditor({ initial, onClose }: { initial: TravelNote;','function NoteEditor({ initial, onClose, detailOrigin }: { detailOrigin?: DetailOrigin; initial: TravelNote;'),
 ('<Modal visible animationType="slide"',"<MotionModal detailOrigin={detailOrigin} transparent={Platform.OS === 'web'} visible animationType=\"slide\""),
 ('<SafeAreaView style={[styles.editorBackdrop, viewport]}>','<SafeAreaView testID="note-modal-viewport" style={[styles.editorBackdrop, viewport]}>'),
 ("<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editor}>","<KeyboardAvoidingView testID=\"note-editor\" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editor}>"),
 ('</Modal>','</MotionModal>'),
 ("editorBackdrop: { flex: 1, backgroundColor: palette.paper }, editor: { flex: 1,", "editorBackdrop: { flex: 1, backgroundColor: Platform.OS === 'web' ? 'rgba(24,42,54,0.3)' : palette.paper }, editor: { backgroundColor: palette.paper, flex: 1,")])
p=Path('src/motion.css'); s=p.read_text(); a=s.index('/* Keep intrinsic widths')
s=s[:a]+'''/* Small transient surfaces share the same soft onset, without the large
   origin expansion or a long stagger before a confirmation action is usable. */
.motion-overlay[data-presentation="dialog"] { --motion-open-dur: 380ms; --motion-close-dur: 200ms; }
.motion-overlay[data-presentation="dropdown"] { --motion-open-dur: 320ms; --motion-close-dur: 180ms; }
.motion-overlay[data-presentation="dialog"] [data-motion-surface] {
  transform: translateY(14px) scale(.985);
}
.motion-overlay[data-presentation="dropdown"] [data-motion-surface] {
  transform: translateY(-6px) scale(.98);
}
.motion-overlay:is([data-presentation="dialog"], [data-presentation="dropdown"]) [data-motion-surface].is-open {
  transform: none;
  transition: transform var(--motion-open-dur) cubic-bezier(.2, .9, .2, 1), opacity 280ms cubic-bezier(.3, 0, .35, 1);
}
'''+s[a:]; p.write_text(s)
p=Path('scripts/test-detail-motion.mjs'); s=p.read_text().replace("cancel: () => reject(new Error('cancelled'))", "cancel: () => { record.cancelled = true; reject(new Error('cancelled')); }")
s+='''
// The same controller covers utility sheets without duplicating their fields.
for (const kind of ['form', 'picker']) {
  const f = fixture(); let closed = 0;
  f.doc.querySelector('#note').style.opacity = '.45';
  f.motion.setOpen(true, false, () => {}, kind);
  assert.equal(f.surface.dataset.sheetMotionKind, kind);
  const moves = f.records.filter(r => r.element !== f.surface && 'transform' in r.frames[0]);
  const fades = f.records.filter(r => r.element !== f.surface && 'opacity' in r.frames[0]);
  assert(moves.every(r => r.frames[0].transform.includes('16px')));
  assert.equal(new Set(moves.map(r => r.options.delay)).size, moves.length);
  assert.equal(fades.find(r => r.element.id === 'note').frames.at(-1).opacity, '0.45', 'disabled-looking controls retain their resting opacity');
  await f.finish();
  const count = f.records.length;
  f.motion.setOpen(true, false, () => {}, kind);
  assert.equal(f.records.length, count, 'selection and ordinary updates do not restart entrance');
  f.motion.setOpen(false, false, () => closed++, kind); await f.finish();
  assert.equal(closed, 1, 'utility sheets wait for the reverse transition'); f.close();
}
{
  const f = fixture(); f.motion.setOpen(true, false, () => {}, 'form');
  const input = f.doc.createElement('input'); f.surface.append(input); input.focus();
  assert(f.records.every(r => r.cancelled), 'typing settles pending motion immediately');
  await f.finish(); f.close();
}
{
  const f = fixture(), fill = f.doc.querySelector('[data-testid="form-sheet-fill"]');
  fill.innerHTML = '<header data-testid="sheet-header">Connections</header><div data-testid="sheet-content-scroll"><div><section id="arrival">Arrival</section><button id="option">Auto</button><section id="calendar"><button>1</button><button>2</button></section></div></div><footer data-testid="sheet-footer">Save</footer>';
  const blocks = detailContentBlocks(fill);
  assert.deepEqual(blocks.map(e => e.id || e.tagName), ['HEADER','arrival','option','calendar','FOOTER']);
  assert(!blocks.some(a => blocks.some(b => a !== b && a.contains(b))), 'no parent/child double animation or individual calendar cells'); f.close();
}
{
  const f = fixture(); f.motion.setOpen(true, false, () => {}); await f.finish();
  const count = f.records.length; f.motion.setOpen(true, false, () => {}, 'form');
  const changed = f.records.slice(count);
  assert.equal(changed.find(r => r.element === f.surface).frames[0].transform, 'none', 'editing changes content without collapsing back to the item');
  assert(changed.some(r => r.element !== f.surface && r.frames[0].opacity === '0')); await f.finish(); f.close();
}
console.log('Utility sheets: shared motion, ordered controls, focus, no replay, picker grouping, opacity and mode changes passed.');
'''; p.write_text(s)
