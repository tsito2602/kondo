import { type ComponentProps, type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, Keyframe, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { DateRangePicker } from '@/components/date-range-picker';
import { palette } from '@/constants/design';
import { findAirports, type Airport } from '@/data/airports';
import { useTravel } from '@/data/travel-provider';
import { Booking, BookingKind } from '@/data/types';

const KINDS: { value: BookingKind; label: string; short: string; icon: string }[] = [
  { value: 'flight', label: '航空券', short: 'FLIGHT', icon: '✈' },
  { value: 'hotel', label: 'ホテル', short: 'HOTEL', icon: '⌂' },
  { value: 'train', label: '鉄道', short: 'TRAIN', icon: '↔' },
  { value: 'car', label: '車', short: 'CAR', icon: '◉' },
  { value: 'restaurant', label: '飲食', short: 'DINING', icon: '◇' },
  { value: 'ticket', label: '入場券', short: 'TICKET', icon: '◎' },
  { value: 'other', label: 'その他', short: 'OTHER', icon: '＋' },
];

const stubPrompt = new Keyframe({
  0: { transform: [{ translateY: 0 }, { rotateZ: '0deg' }] },
  30: { transform: [{ translateY: 5 }, { rotateZ: '1.5deg' }], easing: Easing.inOut(Easing.quad) },
  55: { transform: [{ translateY: 1 }, { rotateZ: '-1deg' }] },
  75: { transform: [{ translateY: 4 }, { rotateZ: '1deg' }] },
  100: { transform: [{ translateY: 0 }, { rotateZ: '0deg' }], easing: Easing.out(Easing.quad) },
});

function hasBookingEnded(booking: Booking, now = new Date()) {
  const [year, month, day] = booking.endDay.split('-').map(Number);
  if (!year || !month || !day) return false;
  const [hour, minute] = booking.endTime.split(':').map(Number);
  const boundary = booking.endTime
    ? new Date(year, month - 1, day, hour || 0, minute || 0)
    : new Date(year, month - 1, day + 1);
  return now >= boundary;
}

type Draft = Pick<Booking, 'kind' | 'title' | 'detail' | 'origin' | 'originCode' | 'destination' | 'destinationCode' | 'day' | 'time' | 'endDay' | 'endTime' | 'confirmationCode' | 'note'>;

function blankDraft(day: string, kind: BookingKind = 'flight'): Draft {
  const defaults: Record<BookingKind, [string, string]> = {
    flight: ['10:00', '12:00'], hotel: ['15:00', '11:00'], train: ['09:00', '11:00'], car: ['09:00', '18:00'],
    restaurant: ['19:00', '19:00'], ticket: ['10:00', '10:00'], other: ['10:00', '10:00'],
  };
  return { kind, title: '', detail: '', origin: '', originCode: '', destination: '', destinationCode: '', day, time: defaults[kind][0], endDay: day, endTime: defaults[kind][1], confirmationCode: '', note: '' };
}

export default function BookingsScreen() {
  const { bookings, createBooking, deleteBooking, pendingCount, selectedTrip, setBookingUsed, updateBooking } = useTravel();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(selectedTrip?.startsOn ?? ''));
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setDraft(blankDraft(selectedTrip?.startsOn ?? ''));
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (booking: Booking) => {
    setEditingId(booking.id);
    setDraft({
      kind: booking.kind,
      title: booking.title,
      detail: booking.detail,
      origin: booking.origin,
      originCode: booking.originCode,
      destination: booking.destination,
      destinationCode: booking.destinationCode,
      day: booking.day,
      time: booking.time,
      endDay: booking.endDay,
      endTime: booking.endTime,
      confirmationCode: booking.confirmationCode,
      note: booking.note,
    });
    setFormError('');
    setFormOpen(true);
  };

  const save = () => {
    const needsRoute = ['flight', 'train', 'car'].includes(draft.kind);
    if (!draft.title.trim() || !draft.day || (needsRoute && (!draft.origin.trim() || !draft.destination.trim()))) {
      setFormError('予約名と日付を入力してください。');
      return;
    }
    if ((draft.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) || (draft.endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.endTime))) {
      setFormError('時刻は24時間表記（例 09:30）で入力してください。');
      return;
    }
    if (draft.endDay && draft.endDay < draft.day) {
      setFormError('終了日は開始日以降を選択してください。');
      return;
    }
    const input = {
      ...draft,
      title: draft.title.trim(),
      detail: draft.detail.trim(),
      origin: draft.origin.trim(),
      destination: draft.destination.trim(),
      confirmationCode: draft.confirmationCode.trim(),
      note: draft.note.trim(),
    };
    if (editingId) updateBooking(editingId, input);
    else createBooking(input);
    setFormOpen(false);
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert('予約を削除しますか？', 'この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => { deleteBooking(editingId); setFormOpen(false); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headingRow}>
          <View style={styles.tag}><Text style={styles.tagText}>DOCUMENTS</Text></View>
          <Text style={styles.counter}>{pendingCount ? `${pendingCount} SYNCING` : `${String(bookings.length).padStart(2, '0')} SAVED`}</Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>予約</Text>
          {selectedTrip ? <Pressable accessibilityLabel="予約を追加する" onPress={openCreate} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><Text style={styles.addButtonText}>＋ 追加</Text></Pressable> : null}
        </View>

        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行を作成してください</Text><Text style={styles.emptyBody}>予約は選択中の旅行ごとに保存されます。</Text></View>
        ) : bookings.length === 0 ? (
          <Pressable onPress={openCreate} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
            <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
            <Text style={styles.emptyTitle}>予約はまだありません</Text>
            <Text style={styles.emptyBody}>航空券、ホテル、入場券などをまとめられます。</Text>
          </Pressable>
        ) : (
          <View style={styles.ticketList}>
            {bookings.filter((booking) => !booking.used).map((booking, index) => (
              <BookingTicketCard booking={booking} index={index} key={booking.id} onEdit={() => openEdit(booking)} onUsed={() => setBookingUsed(booking.id, true)} />
            ))}
            {bookings.some((booking) => booking.used) ? <UsedBookings bookings={bookings.filter((booking) => booking.used)} onEdit={openEdit} onRestore={(id) => setBookingUsed(id, false)} /> : null}
          </View>
        )}
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => setFormOpen(false)} transparent visible={formOpen}>
        <SafeAreaView style={styles.backdrop}>
          <Pressable accessibilityLabel="予約編集を閉じる" onPress={() => setFormOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.dialog}>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.dialogHeading}>
                <Text style={styles.dialogTitle}>{editingId ? '予約を編集' : '予約を追加'}</Text>
                <Pressable accessibilityLabel="予約編集を閉じる" onPress={() => setFormOpen(false)} style={styles.closeButton}><Text style={styles.close}>×</Text></Pressable>
              </View>

              <Text style={styles.label}>種類</Text>
              <View style={styles.kindList}>
                {KINDS.map((kind) => <Pressable key={kind.value} onPress={() => setDraft((current) => blankDraft(current.day || selectedTrip?.startsOn || '', kind.value))} style={[styles.kindButton, draft.kind === kind.value && styles.kindSelected]}><Text style={[styles.kindText, draft.kind === kind.value && styles.kindTextSelected]}>{kind.label}</Text></Pressable>)}
              </View>

              <BookingFormFields draft={draft} setDraft={setDraft} />
              <Field label="メモ" multiline placeholder="任意" value={draft.note} onChangeText={(note) => setDraft((current) => ({ ...current, note }))} />
              {formError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{formError}</Text> : null}

              <View style={styles.actions}>
                {editingId ? <Pressable onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>削除</Text></Pressable> : <View />}
                <Pressable onPress={save} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}><Text style={styles.saveText}>保存</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function BookingTicketCard({ booking, index, onEdit, onUsed }: { booking: Booking; index: number; onEdit: () => void; onUsed: () => void }) {
  const canTear = hasBookingEnded(booking);
  const translateY = useSharedValue(0);
  const committed = useSharedValue(false);
  const stubStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const finishTear = () => {
    if (committed.value) return;
    committed.set(true);
    translateY.set(withTiming(190, { duration: 280, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) scheduleOnRN(onUsed);
    }));
  };
  const gesture = useMemo(() => Gesture.Pan()
    .enabled(canTear)
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onUpdate((event) => { translateY.set(Math.max(0, event.translationY)); })
    .onEnd((event) => {
      if (event.translationY > 54 || event.velocityY > 520) {
        committed.set(true);
        translateY.set(withTiming(190, { duration: 240, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) scheduleOnRN(onUsed);
        }));
      } else {
        translateY.set(withSpring(0, { damping: 17, stiffness: 220 }));
      }
    })
    .onFinalize(() => {
      if (!committed.value && translateY.value !== 0) translateY.set(withSpring(0, { damping: 17, stiffness: 220 }));
    }), [canTear, committed, onUsed, translateY]);
  const kind = KINDS.find((entry) => entry.value === booking.kind) ?? KINDS[KINDS.length - 1];
  const hasRoute = Boolean(booking.origin || booking.destination);
  const route = hasRoute ? `${booking.originCode || booking.origin} → ${booking.destinationCode || booking.destination}` : booking.detail;
  const end = booking.endDay && (booking.endDay !== booking.day || booking.endTime)
    ? ` → ${booking.endDay.replaceAll('-', '.')}${booking.endTime ? ` ${booking.endTime}` : ''}`
    : '';

  return <View style={styles.ticketWrap}>
    <View style={styles.ticket}>
      <Pressable accessibilityLabel={`${booking.title}を編集`} onPress={onEdit} style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
        <View style={styles.ticketTop}>
          <View style={styles.typeTag}><Text style={styles.type}>{kind.short}</Text></View>
          <Text style={styles.serial}>TABI/{String(index + 1).padStart(2, '0')}</Text>
        </View>
        <Text numberOfLines={2} style={styles.cardTitle}>{booking.title}</Text>
        {route ? <Text numberOfLines={2} style={styles.route}>{route}</Text> : null}
        {hasRoute && booking.detail ? <Text numberOfLines={1} style={styles.detail}>{booking.detail}</Text> : null}
        <Text style={styles.meta}>{booking.day.replaceAll('-', '.')} {booking.time}{end}{booking.confirmationCode ? `  /  ${booking.confirmationCode}` : ''}</Text>
      </Pressable>
      <Animated.View entering={canTear ? stubPrompt.delay(500).duration(900) : undefined} style={styles.stubSlot}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.stub, stubStyle]}>
            <Pressable accessibilityLabel={canTear ? '半券。下に引いて使用済みにできます' : `${booking.title}を編集`} onPress={onEdit} style={styles.stubPressable}>
              <Text style={styles.icon}>{kind.icon}</Text>
              <Text style={styles.stubNo}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.stubLabel}>{canTear ? 'PULL' : 'PASS'}</Text>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
      <View style={[styles.notch, styles.notchTop]} />
      <View style={[styles.notch, styles.notchBottom]} />
    </View>
    {canTear ? <View style={styles.tearHint}>
      <Text style={styles.tearHintText}>利用時刻を過ぎました</Text>
      <Pressable accessibilityRole="button" onPress={finishTear} style={({ pressed }) => [styles.tearButton, pressed && styles.pressed]}><Text style={styles.tearButtonText}>使用済みにする ↓</Text></Pressable>
    </View> : null}
  </View>;
}

function UsedBookings({ bookings, onEdit, onRestore }: { bookings: Booking[]; onEdit: (booking: Booking) => void; onRestore: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.usedSection}>
    <Pressable accessibilityRole="button" onPress={() => setOpen((current) => !current)} style={({ pressed }) => [styles.usedHeading, pressed && styles.pressed]}>
      <Text style={styles.usedHeadingText}>使用済み {bookings.length}</Text><Text style={styles.usedChevron}>{open ? '−' : '＋'}</Text>
    </Pressable>
    {open ? <View style={styles.usedList}>{bookings.map((booking) => <View key={booking.id} style={styles.usedTicket}>
      <Pressable accessibilityLabel={`${booking.title}を編集`} onPress={() => onEdit(booking)} style={({ pressed }) => [styles.usedCopy, pressed && styles.pressed]}>
        <Text style={styles.usedLabel}>USED</Text><Text numberOfLines={1} style={styles.usedTitle}>{booking.title}</Text><Text style={styles.usedMeta}>{booking.day.replaceAll('-', '.')} {booking.time}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => onRestore(booking.id)} style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed]}><Text style={styles.restoreText}>元に戻す</Text></Pressable>
    </View>)}</View> : null}
  </View>;
}

function BookingFormFields({ draft, setDraft }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setDraft((current) => ({ ...current, [key]: value }));
  const dateTimeRange = (label: string, startLabel: string, endLabel: string) => (
    <DateRangePicker
      endDate={draft.endDay}
      endLabel={endLabel}
      endTime={draft.endTime}
      label={label}
      showTime
      startDate={draft.day}
      startLabel={startLabel}
      startTime={draft.time}
      onChange={({ startDate, endDate, startTime, endTime }) => setDraft((current) => ({ ...current, day: startDate, endDay: endDate, time: startTime, endTime }))}
    />
  );
  const singleDateTime = (label: string, dateLabel: string, timeValue = draft.time) => (
    <DateRangePicker
      endDate={draft.day}
      label={label}
      mode="single"
      showTime
      startDate={draft.day}
      startLabel={dateLabel}
      startTime={timeValue}
      onChange={({ startDate, startTime }) => setDraft((current) => ({ ...current, day: startDate, endDay: startDate, time: startTime, endTime: startTime }))}
    />
  );
  const confirmation = (label = '予約・確認番号') => (
    <Field autoCapitalize="characters" label={label} placeholder="任意" value={draft.confirmationCode} onChangeText={(value) => set('confirmationCode', value)} />
  );

  if (draft.kind === 'flight') return <>
    <Field label="便名・航空会社" placeholder="例：ANA 257便" value={draft.title} onChangeText={(value) => set('title', value)} />
    <AirportField label="出発空港" placeholder="空港名・都市・HND" value={draft.origin} code={draft.originCode} onChange={(airport) => setDraft((current) => ({ ...current, origin: airport.name, originCode: airport.code }))} onChangeText={(value) => setDraft((current) => ({ ...current, origin: value, originCode: '' }))} />
    <AirportField label="到着空港" placeholder="空港名・都市・VIE" value={draft.destination} code={draft.destinationCode} onChange={(airport) => setDraft((current) => ({ ...current, destination: airport.name, destinationCode: airport.code }))} onChangeText={(value) => setDraft((current) => ({ ...current, destination: value, destinationCode: '' }))} />
    {dateTimeRange('フライト日時', '出発', '到着')}
    {confirmation('予約番号')}
  </>;

  if (draft.kind === 'hotel') return <>
    <Field label="ホテル名" placeholder="例：Hotel Astoria Vienna" value={draft.title} onChangeText={(value) => set('title', value)} />
    <Field label="住所・エリア" placeholder="例：ウィーン旧市街" value={draft.detail} onChangeText={(value) => set('detail', value)} />
    {dateTimeRange('宿泊期間', 'チェックイン', 'チェックアウト')}
    {confirmation()}
  </>;

  if (draft.kind === 'train' || draft.kind === 'car') {
    const car = draft.kind === 'car';
    return <>
      <Field label={car ? 'レンタカー会社・プラン' : '列車名・便名'} placeholder={car ? '例：トヨタレンタカー' : '例：のぞみ25号'} value={draft.title} onChangeText={(value) => set('title', value)} />
      <Field label={car ? '受取場所' : '乗車駅'} placeholder={car ? '例：博多駅前店' : '例：東京駅'} value={draft.origin} onChangeText={(value) => setDraft((current) => ({ ...current, origin: value, originCode: '' }))} />
      <Field label={car ? '返却場所' : '降車駅'} placeholder={car ? '例：福岡空港店' : '例：京都駅'} value={draft.destination} onChangeText={(value) => setDraft((current) => ({ ...current, destination: value, destinationCode: '' }))} />
      {dateTimeRange(car ? '利用期間' : '乗車日時', car ? '受取' : '出発', car ? '返却' : '到着')}
      {confirmation()}
    </>;
  }

  const config = draft.kind === 'restaurant'
    ? { title: '店名', titlePlaceholder: '例：博多もつ鍋 やま中', detail: '人数・席', detailPlaceholder: '例：2名・テーブル席', date: '予約日', time: '予約時刻' }
    : draft.kind === 'ticket'
      ? { title: '施設・イベント名', titlePlaceholder: '例：美術館 入場券', detail: '券種・座席', detailPlaceholder: '例：一般 2名', date: '利用日', time: '利用時刻' }
      : { title: '予約名', titlePlaceholder: '例：現地ツアー', detail: '詳細', detailPlaceholder: '例：集合場所・参加人数', date: '日付', time: '時刻' };
  return <>
    <Field label={config.title} placeholder={config.titlePlaceholder} value={draft.title} onChangeText={(value) => set('title', value)} />
    <Field label={config.detail} placeholder={config.detailPlaceholder} value={draft.detail} onChangeText={(value) => set('detail', value)} />
    {singleDateTime(`${config.date}・${config.time}`, config.date)}
    {confirmation()}
  </>;
}

function AirportField({ code, label, onChange, onChangeText, placeholder, value }: { code: string; label: string; onChange: (airport: Airport) => void; onChangeText: (value: string) => void; placeholder: string; value: string }) {
  const matches = findAirports(value);
  const selected = Boolean(code && matches.some((airport) => airport.code === code && airport.name === value));
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.airportInputWrap}>
      <TextInput accessibilityLabel={label} autoCapitalize="characters" onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.smoke} style={[styles.input, code && styles.airportInput]} value={value} />
      {code ? <View style={styles.codeBadge}><Text style={styles.codeText}>{code}</Text></View> : null}
    </View>
    {!selected && matches.length ? <View style={styles.suggestions}>
      {matches.map((airport) => <Pressable accessibilityLabel={`${airport.name} ${airport.code}を選択`} key={airport.code} onPress={() => onChange(airport)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
        <View style={styles.suggestionCopy}><Text style={styles.suggestionName}>{airport.name}</Text><Text style={styles.suggestionCity}>{airport.city}</Text></View>
        <Text style={styles.suggestionCode}>{airport.code}</Text>
      </Pressable>)}
    </View> : null}
  </View>;
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={palette.smoke} style={[styles.input, props.multiline && styles.inputMultiline]} {...props} /></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingBottom: 120 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tag: { backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { color: palette.ink, fontFamily: 'monospace', fontSize: 10 },
  counter: { color: palette.slate, fontFamily: 'monospace', fontSize: 11 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 8 },
  title: { color: palette.ink, fontSize: 42, lineHeight: 42, fontWeight: '900', letterSpacing: -1.5 },
  addButton: { minHeight: 44, justifyContent: 'center', backgroundColor: palette.ocean, borderRadius: 8, paddingHorizontal: 16 },
  addButtonText: { color: palette.paper, fontSize: 14, fontWeight: '800' },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper, borderRadius: 32, padding: 28, marginTop: 24 },
  emptyMark: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky, marginBottom: 18 },
  emptyMarkText: { color: palette.ocean, fontSize: 27, fontWeight: '700' },
  emptyTitle: { color: palette.ink, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: palette.slate, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  ticketList: { gap: 16, marginTop: 24 },
  ticketWrap: { gap: 8 },
  ticket: { minHeight: 174, flexDirection: 'row', position: 'relative', overflow: 'hidden', borderRadius: 28, backgroundColor: palette.paper },
  copy: { flex: 1, minWidth: 0, padding: 20 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  typeTag: { alignSelf: 'flex-start', backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 10, paddingVertical: 5 },
  type: { color: palette.ink, fontFamily: 'monospace', fontSize: 9, letterSpacing: 0.8 },
  serial: { color: palette.smoke, fontFamily: 'monospace', fontSize: 9 },
  cardTitle: { color: palette.ink, fontSize: 20, lineHeight: 23, fontWeight: '900', letterSpacing: -0.4, marginTop: 18 },
  route: { color: palette.ink, fontFamily: 'monospace', fontSize: 16, fontWeight: '800', letterSpacing: 0.6, marginTop: 8 },
  detail: { color: palette.slate, fontSize: 14, marginTop: 6 },
  meta: { color: palette.slate, fontFamily: 'monospace', fontSize: 10, lineHeight: 16, marginTop: 12 },
  stubSlot: { width: 76 },
  stub: { flex: 1, width: '100%', borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: palette.ocean, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  stubPressable: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  icon: { color: palette.ocean, fontSize: 24, fontWeight: '900' },
  stubNo: { color: palette.ink, fontSize: 24, lineHeight: 27, fontWeight: '900', marginTop: 12 },
  stubLabel: { color: palette.smoke, fontFamily: 'monospace', fontSize: 8, marginTop: 2 },
  notch: { position: 'absolute', right: 66, width: 20, height: 20, borderRadius: 10, backgroundColor: palette.canvas, zIndex: 2 },
  notchTop: { top: -10 },
  notchBottom: { bottom: -10 },
  tearHint: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingHorizontal: 6 },
  tearHintText: { color: palette.smoke, fontSize: 11 },
  tearButton: { minHeight: 36, justifyContent: 'center', borderRadius: 18, backgroundColor: palette.sky, paddingHorizontal: 13 },
  tearButtonText: { color: palette.ocean, fontSize: 11, fontWeight: '800' },
  usedSection: { overflow: 'hidden', borderRadius: 20, backgroundColor: palette.paper },
  usedHeading: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  usedHeadingText: { color: palette.slate, fontSize: 13, fontWeight: '800' },
  usedChevron: { color: palette.ocean, fontSize: 18, fontWeight: '700' },
  usedList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.ash },
  usedTicket: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash, paddingLeft: 18, paddingRight: 10 },
  usedCopy: { flex: 1, minWidth: 0, paddingVertical: 12 },
  usedLabel: { color: palette.smoke, fontFamily: 'monospace', fontSize: 8, letterSpacing: 1 },
  usedTitle: { color: palette.slate, fontSize: 14, fontWeight: '800', marginTop: 4 },
  usedMeta: { color: palette.smoke, fontFamily: 'monospace', fontSize: 9, marginTop: 4 },
  restoreButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 10 },
  restoreText: { color: palette.ocean, fontSize: 11, fontWeight: '800' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(24,42,54,0.34)', padding: 16 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '94%', backgroundColor: palette.canvas, borderRadius: 28, overflow: 'hidden' },
  form: { gap: 16, padding: 20 },
  dialogHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dialogTitle: { color: palette.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { color: palette.ink, fontSize: 30, lineHeight: 32 },
  kindList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -8 },
  kindButton: { minHeight: 38, justifyContent: 'center', backgroundColor: palette.paper, borderRadius: 64, paddingHorizontal: 14 },
  kindSelected: { backgroundColor: palette.sky },
  kindText: { color: palette.slate, fontSize: 12, fontWeight: '700' },
  kindTextSelected: { color: palette.ink },
  twoColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flexField: { flex: 1, minWidth: 0 },
  field: { gap: 8 },
  label: { color: palette.slate, fontFamily: 'monospace', fontSize: 11 },
  input: { minHeight: 52, backgroundColor: palette.paper, borderRadius: 8, color: palette.ink, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  airportInputWrap: { position: 'relative' },
  airportInput: { paddingRight: 68 },
  codeBadge: { position: 'absolute', right: 10, top: 10, minWidth: 48, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky, borderRadius: 8 },
  codeText: { color: palette.ink, fontFamily: 'monospace', fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  suggestions: { overflow: 'hidden', backgroundColor: palette.paper, borderRadius: 12, marginTop: -2 },
  suggestion: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash, paddingHorizontal: 14 },
  suggestionCopy: { flex: 1, minWidth: 0 },
  suggestionName: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  suggestionCity: { color: palette.smoke, fontSize: 10, marginTop: 2 },
  suggestionCode: { color: palette.ocean, fontFamily: 'monospace', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  error: { color: palette.danger, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  deleteButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  deleteText: { color: palette.danger, fontSize: 14, fontWeight: '700' },
  saveButton: { minWidth: 120, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean, borderRadius: 8, paddingHorizontal: 22 },
  saveText: { color: palette.paper, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.62 },
});
