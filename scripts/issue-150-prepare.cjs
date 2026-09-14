const fs = require('node:fs');
const assert = require('node:assert/strict');
function edit(file, pairs) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) { assert(text.includes(from), `${file}: missing ${from.slice(0, 100)}`); text = text.replace(from, to); }
  fs.writeFileSync(file, text);
}
const originImport = "import { captureDetailOrigin, type DetailOrigin } from '@/utils/detail-origin';\n";
for (const file of ['src/screens/bookings-screen.tsx', 'src/screens/places-screen.tsx', 'src/screens/itinerary-screen.tsx']) {
  edit(file, [["  const palette = usePalette();", "  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>();\n  const palette = usePalette();"]]);
  fs.writeFileSync(file, originImport + fs.readFileSync(file, 'utf8'));
}
edit('src/screens/bookings-screen.tsx', [
  ["const openCreate = () => setOpenedBooking('new');", "const openCreate = () => { setDetailOrigin(undefined); setOpenedBooking('new'); };"],
  ["      setOpenedBooking(bookingId);", "      setDetailOrigin(undefined); setOpenedBooking(bookingId);"],
  ['onPress={() => setOpenedBooking(booking.id)}', 'onPress={(event) => { setDetailOrigin(captureDetailOrigin(event)); setOpenedBooking(booking.id); }}'],
  ['<Text numberOfLines={2} style={styles.cardTitle}>', '<Text testID="detail-source-title" numberOfLines={2} style={styles.cardTitle}>'],
  ['{formatDate(booking.day)}　{booking.time}', '{formatDate(booking.day)}　<Text testID="detail-source-time">{booking.time}</Text>'],
  ['<BookingSheet key={openedBooking}', '<BookingSheet detailOrigin={detailOrigin} key={openedBooking}'],
]);
edit('src/screens/places-screen.tsx', [
  ["const open = (place?: Place) => setEditing(place ?? 'new');", "const open = (place?: Place) => { if (!place) setDetailOrigin(undefined); setEditing(place ?? 'new'); };"],
  ['onPress={() => open(place)}', 'onPress={(event) => { setDetailOrigin(captureDetailOrigin(event)); open(place); }}'],
  ['<Text style={styles.placeTitle}>{place.title}', '<Text testID="detail-source-title" style={styles.placeTitle}>{place.title}'],
  ['<PlaceSheet key={editing', '<PlaceSheet detailOrigin={detailOrigin} key={editing'],
]);
edit('src/screens/itinerary-screen.tsx', [
  ['  const openAdd = () => {', '  const openAdd = () => {\n    setDetailOrigin(undefined);'],
  ['onPress={() => setViewingItemId(entry.item!.id)}', 'onPress={(event) => { setDetailOrigin(captureDetailOrigin(event)); setViewingItemId(entry.item!.id); }}'],
  ['onPress={() => entry.booking ? setViewingBookingId(entry.booking.id) : setViewingItemId(entry.item!.id)}', 'onPress={(event) => { setDetailOrigin(captureDetailOrigin(event)); entry.booking ? setViewingBookingId(entry.booking.id) : setViewingItemId(entry.item!.id); }}'],
  ['<Text style={styles.time}>{entry.time', '<Text testID="detail-source-time" style={styles.time}>{entry.time'],
  ['<Text style={styles.itemTitle}>{entryTitle(entry)}', '<Text testID="detail-source-title" style={styles.itemTitle}>{entryTitle(entry)}'],
  ['<BookingSheet key={`${selectedTrip?.id}', '<BookingSheet detailOrigin={detailOrigin} key={`${selectedTrip?.id}'],
  ['<PlaceSheet key={viewingPlace.id}', '<PlaceSheet detailOrigin={detailOrigin} key={viewingPlace.id}'],
  ['<FormSheet visible={adding', '<FormSheet detailOrigin={detailOrigin} visible={adding'],
  ['<Text selectable style={styles.planTitle}>', '<Text testID="detail-target-title" selectable style={styles.planTitle}>'],
  ["{viewingItem.day.replaceAll('-', '/')}　{viewingItem.time || '時刻未定'}", "{viewingItem.day.replaceAll('-', '/')}　<Text testID=\"detail-target-time\">{viewingItem.time || '時刻未定'}</Text>"],
  ['hasNext: boolean; onPress: () => void', "hasNext: boolean; onPress: NonNullable<ComponentProps<typeof Pressable>['onPress']>"],
  ['<Text style={styles.transportTimeText}>', '<Text testID="detail-source-time" style={styles.transportTimeText}>'],
  ['<Text style={styles.connectionNext}>{item.title}', '<Text testID="detail-source-title" style={styles.connectionNext}>{item.title}'],
]);
for (const file of ['src/components/booking-sheet.tsx', 'src/components/place-sheet.tsx', 'src/components/form-sheet.tsx', 'src/components/motion-modal.tsx', 'src/components/motion-modal.web.tsx']) {
  fs.writeFileSync(file, "import type { DetailOrigin } from '@/utils/detail-origin';\n" + fs.readFileSync(file, 'utf8'));
}
edit('src/components/booking-sheet.tsx', [
  ['BookingSheet({ booking, onClose }: { booking?: Booking; onClose: () => void })', 'BookingSheet({ booking, onClose, detailOrigin }: { booking?: Booking; onClose: () => void; detailOrigin?: DetailOrigin })'],
  ['<FormSheet visible presentation=', '<FormSheet detailOrigin={detailOrigin} visible presentation='],
  ['<Text style={styles.detailTitle}>', '<Text testID="detail-target-title" style={styles.detailTitle}>'],
  ['<Text style={styles.detailTime}>{booking.time', '<Text testID="detail-target-time" style={styles.detailTime}>{booking.time'],
  ['<Text style={styles.detailTime}>{booking.endTime', '<Text testID="detail-target-time" style={styles.detailTime}>{booking.endTime'],
]);
edit('src/components/place-sheet.tsx', [
  ['type Props = { place?: Place;', 'type Props = { detailOrigin?: DetailOrigin; place?: Place;'],
  ['PlaceSheet({ place, onClose, onPlan, onEditSchedule }', 'PlaceSheet({ place, onClose, onPlan, onEditSchedule, detailOrigin }'],
  ['<FormSheet visible presentation=', '<FormSheet detailOrigin={detailOrigin} visible presentation='],
  ['<Text accessibilityRole="header" selectable style={styles.detailTitle}>', '<Text testID="detail-target-title" accessibilityRole="header" selectable style={styles.detailTitle}>'],
  ["{itineraryItem.day.replaceAll('-', '/')}　{itineraryItem.time || '時刻未定'}", "{itineraryItem.day.replaceAll('-', '/')}　<Text testID=\"detail-target-time\">{itineraryItem.time || '時刻未定'}</Text>"],
]);
edit('src/components/form-sheet.tsx', [
  ["  visible: boolean;", "  visible: boolean;\n  detailOrigin?: DetailOrigin;"],
  ["FormSheet({ presentation = 'form', visible", "FormSheet({ detailOrigin, presentation = 'form', visible"],
  ['<MotionModal visible={visible} transparent=', '<MotionModal detail={presentation === \'detail\'} detailOrigin={detailOrigin} onDetailDismiss={close} visible={visible} transparent='],
  ['          <View testID="sheet-header"', '          <View testID="sheet-header"'],
].filter(([a,b]) => a !== b));
edit('src/components/form-sheet.tsx', [
  ['<View accessibilityViewIsModal testID="form-sheet-fill" style={styles.fill}>', '<View accessibilityViewIsModal testID="form-sheet-fill" style={styles.fill}>\n          {Platform.OS === \'web\' && presentation === \'detail\' ? <View testID="detail-dismiss-handle" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View /></View> : null}'],
]);
edit('src/components/motion-modal.tsx', [
  ['{ motion: _motion, ...props }', '{ motion: _motion, detail: _detail, detailOrigin: _detailOrigin, onDetailDismiss: _onDetailDismiss, ...props }'],
  ["{ motion?: 'modal' | 'dropdown' }", "{ motion?: 'modal' | 'dropdown'; detail?: boolean; detailOrigin?: DetailOrigin; onDetailDismiss?: () => void }"],
]);
edit('src/components/motion-modal.web.tsx', [
  ["import { useCallback", "import '@/detail-motion.css';\nimport { createDetailMotion } from '@/utils/detail-motion.web';\nimport { useCallback"],
  ["{ children, visible = true, motion = 'modal', onRequestClose, ...props }", "{ children, visible = true, motion = 'modal', onRequestClose, detail = false, detailOrigin, onDetailDismiss, ...props }"],
  ["{ motion?: 'modal' | 'dropdown' }", "{ motion?: 'modal' | 'dropdown'; detail?: boolean; detailOrigin?: DetailOrigin; onDetailDismiss?: () => void }"],
  ["  const release = useRef", "  const detailMotion = useRef<ReturnType<typeof createDetailMotion> | null>(null);\n  const dismiss = useRef(onDetailDismiss);\n  dismiss.current = onDetailDismiss;\n  useLayoutEffect(() => () => { detailMotion.current?.dispose(); detailMotion.current = null; }, [root]);\n  const release = useRef"],
  ["    surface.inert = !open;", "    surface.inert = !open;\n    if (detail) {\n      detailMotion.current ??= createDetailMotion(surface, viewport, detailOrigin, () => dismiss.current?.());\n      return detailMotion.current.setOpen(open, reduced, finish);\n    }\n    detailMotion.current?.suspend();"],
  ['[root, open, motion, reduced, releaseExit]', '[root, open, motion, reduced, releaseExit, detail, detailOrigin]'],
]);
edit('scripts/test-motion.mjs', [
  ["    if (name === 'react-native')", "    if (name.endsWith('.css')) return {};\n    if (name === 'react-native')"],
  ["    const paths = {", "    const paths = {\n      '@/utils/detail-motion.web': 'src/utils/detail-motion.web.ts',\n      './detail-origin.web': 'src/utils/detail-origin.web.ts',"],
]);
edit('scripts/test-ui-boundaries.mjs', [
  ['(name) => name in mocks ? mocks[name] : require(name)', "(name) => name === '@/utils/detail-origin' ? { captureDetailOrigin: () => undefined } : name in mocks ? mocks[name] : require(name)"],
]);
for (const file of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')); data.version = '1.7.0';
  if (data.packages) data.packages[''].version = data.version;
  if (data.scripts) data.scripts['test:motion'] += ' && node scripts/test-detail-motion.mjs';
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
const app = JSON.parse(fs.readFileSync('app.json', 'utf8')); app.expo.version = '1.7.0'; fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
// Do not duplicate a moving label when an enter or a finger drag is interrupted.
edit('src/utils/detail-motion.web.ts', [
  ["    const current = win.getComputedStyle(surface);", "    const interrupted = animations.length > 0 || Boolean(surface.style.transform);\n    const current = win.getComputedStyle(surface);"],
  ['      sharedLabels(open, duration);', '      if (!interrupted) sharedLabels(open, duration);'],
]);
fs.unlinkSync('scripts/issue-150-prepare.cjs');
fs.unlinkSync('.github/workflows/issue-150-verify.yml');
console.log('Prepared detail-only integration; temporary workflow and adapter removed.');
