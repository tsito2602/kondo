import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateRangePicker } from '@/components/date-range-picker';
import { FloatingAddButton } from '@/components/floating-add-button';
import { palette } from '@/constants/design';
import type { Booking, BookingKind, ItineraryItem } from '@/data/types';
import { useTravel } from '@/data/travel-provider';

const BOOKING_STAGES: Record<BookingKind, [string, string]> = {
  flight: ['出発', '到着'],
  hotel: ['チェックイン', 'チェックアウト'],
  train: ['乗車', '到着'],
  car: ['受取', '返却'],
  restaurant: ['予約', '終了'],
  ticket: ['利用', '終了'],
  other: ['予約', '終了'],
};

type SymbolName = ComponentProps<typeof SymbolView>['name'];

const BOOKING_ICONS: Record<BookingKind, SymbolName> = {
  flight: { ios: 'airplane', android: 'flight', web: 'flight' },
  hotel: { ios: 'bed.double.fill', android: 'hotel', web: 'hotel' },
  train: { ios: 'train.side.front.car', android: 'train', web: 'train' },
  car: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
  restaurant: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  ticket: { ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' },
  other: { ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' },
};

const PLAN_ICON: SymbolName = { ios: 'mappin', android: 'location_on', web: 'location_on' };
const EMPTY_ICON: SymbolName = { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' };

type TimelineEntry = {
  key: string;
  day: string;
  time: string;
  title: string;
  note: string;
  item?: ItineraryItem;
  booking?: Booking;
  bookingStage?: string;
  bookingEndpoint?: 'start' | 'end';
};

function bookingNote(booking: Booking) {
  if (booking.origin || booking.destination) {
    return `${booking.originCode || booking.origin} → ${booking.destinationCode || booking.destination}`;
  }
  return booking.detail;
}

function bookingTimelineEntries(booking: Booking): TimelineEntry[] {
  const [startStage, endStage] = BOOKING_STAGES[booking.kind];
  const entries: TimelineEntry[] = [{
    key: `booking-${booking.id}-start`,
    day: booking.day,
    time: booking.time,
    title: booking.title,
    note: bookingNote(booking),
    booking,
    bookingStage: startStage,
    bookingEndpoint: 'start',
  }];

  if (booking.endTime && (booking.endDay !== booking.day || booking.endTime !== booking.time)) {
    entries.push({
      key: `booking-${booking.id}-end`,
      day: booking.endDay || booking.day,
      time: booking.endTime,
      title: booking.title,
      note: bookingNote(booking),
      booking,
      bookingStage: endStage,
      bookingEndpoint: 'end',
    });
  }
  return entries;
}

function datesBetween(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()) || cursor > last) return dates;
  while (cursor <= last && dates.length < 370) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(date);
}

function longDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(date);
}

function entryTitle(entry: TimelineEntry) {
  const booking = entry.booking;
  if (!booking || (!booking.origin && !booking.destination)) return entry.title;
  const origin = booking.originCode || booking.origin;
  const destination = booking.destinationCode || booking.destination;
  return [origin, destination].filter(Boolean).join(' → ');
}

function bookingDetails(entry: TimelineEntry) {
  if (!entry.booking) return [];
  const booking = entry.booking;
  const [startStage, endStage] = BOOKING_STAGES[booking.kind];
  if (entry.bookingEndpoint === 'end') {
    return [`${endStage} · ${booking.title}`, `${startStage} ${shortDate(booking.day)} ${booking.time}`].filter(Boolean);
  }
  const endDate = booking.endDay && booking.endDay !== booking.day ? `${shortDate(booking.endDay)} ` : '';
  return [`${startStage} · ${booking.title}`, booking.endTime ? `${endStage} ${endDate}${booking.endTime}` : ''].filter(Boolean);
}

export default function ItineraryScreen() {
  const { selectedTrip, items, bookings, createItem, updateItem, deleteItem, pendingCount } = useTravel();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [day, setDay] = useState(selectedTrip?.startsOn ?? '');
  const [time, setTime] = useState('10:00');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const dayOffsets = useRef<Record<string, number>>({});
  const programmaticScrollDay = useRef<string | null>(null);
  const scrollTrackingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timeline = [
    ...items.map<TimelineEntry>((item) => ({ key: `item-${item.id}`, day: item.day, time: item.time, title: item.title, note: item.note, item })),
    ...bookings.flatMap(bookingTimelineEntries),
  ].sort((left, right) => left.day.localeCompare(right.day) || left.time.localeCompare(right.time) || left.key.localeCompare(right.key));
  const grouped = timeline.reduce<Record<string, TimelineEntry[]>>((result, entry) => {
    (result[entry.day] ??= []).push(entry);
    return result;
  }, {});
  const itineraryDates = [...new Set([
    ...(selectedTrip ? datesBetween(selectedTrip.startsOn, selectedTrip.endsOn) : []),
    ...Object.keys(grouped),
  ])].sort();
  const [activeDay, setActiveDay] = useState(selectedTrip?.startsOn ?? '');
  const visibleActiveDay = itineraryDates.includes(activeDay) ? activeDay : itineraryDates[0];

  const resumeScrollTracking = () => {
    programmaticScrollDay.current = null;
    if (scrollTrackingTimer.current) clearTimeout(scrollTrackingTimer.current);
    scrollTrackingTimer.current = null;
  };

  useEffect(() => () => {
    if (scrollTrackingTimer.current) clearTimeout(scrollTrackingTimer.current);
  }, []);

  const scrollToDay = (date: string) => {
    const offset = dayOffsets.current[date];
    resumeScrollTracking();
    programmaticScrollDay.current = date;
    setActiveDay(date);
    if (offset === undefined) {
      resumeScrollTracking();
      return;
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, offset - 68), animated: true });
    scrollTrackingTimer.current = setTimeout(resumeScrollTracking, 1000);
  };

  const trackVisibleDay = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (programmaticScrollDay.current) return;
    const scrollPosition = event.nativeEvent.contentOffset.y + 76;
    let visibleDay = itineraryDates[0];
    for (const date of itineraryDates) {
      if ((dayOffsets.current[date] ?? Number.POSITIVE_INFINITY) <= scrollPosition) visibleDay = date;
      else break;
    }
    if (visibleDay && visibleDay !== visibleActiveDay) setActiveDay(visibleDay);
  };

  const openAdd = () => {
    if (!selectedTrip) return;
    setEditingId(null);
    setDay(visibleActiveDay || selectedTrip.startsOn);
    setTime('10:00');
    setTitle('');
    setNote('');
    setAdding(true);
  };

  const openEdit = (item: ItineraryItem) => {
    setEditingId(item.id);
    setDay(item.day);
    setTime(item.time || '10:00');
    setTitle(item.title);
    setNote(item.note);
    setAdding(true);
  };

  const closeEditor = () => {
    setAdding(false);
    setEditingId(null);
  };

  const save = () => {
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      Alert.alert('入力を確認してください', '日付、時刻、予定名を入力してください。');
      return;
    }
    const input = { day, time, kind: '予定', title: title.trim(), note: note.trim() };
    if (editingId) updateItem(editingId, input);
    else createItem(input);
    closeEditor();
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert('予定を削除しますか？', title, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          deleteItem(editingId);
          closeEditor();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        onMomentumScrollEnd={resumeScrollTracking}
        onScroll={trackVisibleDay}
        onScrollBeginDrag={resumeScrollTracking}
        ref={scrollRef}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}>
        <View style={styles.dayNavSticky}>
          {selectedTrip && itineraryDates.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
            {itineraryDates.map((date, index) => {
              const selected = date === visibleActiveDay;
              return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={date} onPress={() => scrollToDay(date)} style={[styles.dayTab, selected && styles.dayTabSelected]}>
                <Text style={[styles.dayTabLabel, selected && styles.dayTabLabelSelected]}>{index + 1}日目</Text>
                <Text style={[styles.dayTabDate, selected && styles.dayTabDateSelected]}>{shortDate(date)}</Text>
              </Pressable>;
            })}
          </ScrollView> : null}
        </View>
        {pendingCount ? <Text style={styles.pending}>{pendingCount}件を端末に保存済み · オンライン時に同期</Text> : null}

        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行がありません</Text><Text style={styles.emptyBody}>旅行一覧から旅行を選択してください。</Text></View>
        ) : <View style={styles.timeline}>{itineraryDates.map((date, dayIndex) => {
          const dateItems = grouped[date] ?? [];
          const hasBookingAcrossDate = bookings.some((booking) => booking.endTime && booking.day < date && (booking.endDay || booking.day) >= date);
          return (
            <View key={date} onLayout={(event) => { dayOffsets.current[date] = event.nativeEvent.layout.y; }} style={styles.daySection}>
              <View style={[styles.dateBar, hasBookingAcrossDate && styles.linkedDateBar]}>
                {hasBookingAcrossDate ? <View style={styles.dateConnector} /> : null}
                <Text numberOfLines={1} style={styles.date}>{longDate(date)}</Text>
                <Text style={styles.dateDay}>DAY {String(dayIndex + 1).padStart(2, '0')}</Text>
              </View>
              {dateItems.length ? <View>
                  {dateItems.map((entry, entryIndex) => {
                    const details = bookingDetails(entry);
                    const isLinkedStart = entry.bookingEndpoint === 'start' && Boolean(entry.booking?.endTime);
                    const isLinkedEnd = entry.bookingEndpoint === 'end';
                    return (
                    <Pressable
                      accessibilityHint={entry.booking ? '予約の詳細を開きます' : '予定を編集します'}
                      accessibilityRole="button"
                      key={entry.key}
                      onPress={() => entry.booking && selectedTrip ? router.push({ pathname: '/trips/[tripId]/bookings', params: { tripId: selectedTrip.id, booking: entry.booking.id } }) : openEdit(entry.item!)}
                      style={({ pressed }) => [styles.itemRow, (isLinkedStart || isLinkedEnd) && styles.linkedBookingRow, pressed && styles.itemPressed]}>
                      <View style={styles.timeColumn}>
                        <Text style={styles.time}>{entry.time || '—'}</Text>
                        <Text style={styles.timeKind}>{entry.booking ? entry.bookingStage : entry.item?.kind || '予定'}</Text>
                      </View>
                      <View style={styles.railColumn}>
                        {entryIndex > 0 || isLinkedEnd ? <View style={[styles.rail, styles.railTop, isLinkedEnd && styles.linkedRail]} /> : null}
                        {entryIndex < dateItems.length - 1 || isLinkedStart ? <View style={[styles.rail, styles.railBottom, isLinkedStart && styles.linkedRail]} /> : null}
                        <View style={[styles.iconCircle, entry.booking && styles.bookingIconCircle, isLinkedEnd && styles.bookingEndIconCircle]}>
                          <SymbolView
                            name={entry.booking ? BOOKING_ICONS[entry.booking.kind] : PLAN_ICON}
                            size={21}
                            weight="semibold"
                            tintColor={entry.booking && !isLinkedEnd ? palette.paper : palette.ocean}
                          />
                        </View>
                      </View>
                      <View style={styles.itemCopy}>
                        <Text style={styles.itemTitle}>{entryTitle(entry)}</Text>
                        {details.map((detail, index) => <Text key={`${entry.key}-detail-${index}`} style={[styles.note, index === 0 && styles.bookingTag]}>{detail}</Text>)}
                        {!entry.booking && entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                    );
                  })}
                </View> : <View style={styles.emptyRow}>
                  <View style={styles.timeColumn}><Text style={styles.emptyTime}>—</Text></View>
                  <View style={styles.railColumn}><View style={styles.emptyIconCircle}><SymbolView name={EMPTY_ICON} size={18} tintColor={palette.smoke} /></View></View>
                  <Text style={styles.emptyDay}>予定はまだありません</Text>
                </View>}
            </View>
          );
        })}</View>}
      </ScrollView>

      {selectedTrip ? <FloatingAddButton label="予定を追加する" onPress={openAdd} /> : null}

      <Modal visible={adding} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeEditor}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={closeEditor}><Text style={styles.cancel}>キャンセル</Text></Pressable>
            <Text style={styles.modalTitle}>{editingId ? '予定を編集' : '予定を追加'}</Text>
            <Pressable onPress={save}><Text style={styles.save}>保存</Text></Pressable>
          </View>
          <View style={styles.form}>
            <DateRangePicker mode="single" showTime label="日時" startDate={day} endDate={day} startTime={time} onChange={(range) => { setDay(range.startDate); setTime(range.startTime); }} />
            <Text style={styles.label}>予定</Text><TextInput value={title} onChangeText={setTitle} placeholder="空港へ移動" style={styles.input} autoFocus />
            <Text style={styles.label}>メモ</Text><TextInput value={note} onChangeText={setNote} placeholder="集合場所や予約番号など" style={[styles.input, styles.noteInput]} multiline />
            {editingId ? <Pressable onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>この予定を削除</Text></Pressable> : null}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 128 },
  dayNavSticky: { zIndex: 4, marginHorizontal: -20, paddingHorizontal: 20, paddingBottom: 10, backgroundColor: palette.canvas, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  dayTabs: { gap: 8, paddingRight: 20 },
  dayTab: { minWidth: 68, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.mist, paddingHorizontal: 12 },
  dayTabSelected: { backgroundColor: palette.ocean },
  dayTabLabel: { color: palette.slate, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  dayTabLabelSelected: { color: palette.paper },
  dayTabDate: { color: palette.smoke, fontFamily: 'monospace', fontSize: 9, lineHeight: 13, marginTop: 1 },
  dayTabDateSelected: { color: palette.sky },
  pending: { color: palette.slate, fontFamily: 'monospace', fontSize: 11, marginTop: 4 },
  empty: { minHeight: 430, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyMark: { color: palette.accent, fontSize: 42, fontWeight: '900' },
  emptyTitle: { color: palette.ink, fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -0.8, marginTop: 14 },
  emptyBody: { color: palette.slate, textAlign: 'center', marginTop: 7 },
  timeline: { marginTop: 10, marginHorizontal: -20 },
  daySection: { backgroundColor: palette.paper },
  dateBar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.mist, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.ash, paddingHorizontal: 20, position: 'relative' },
  linkedDateBar: { paddingLeft: 122 },
  dateConnector: { position: 'absolute', left: 104, top: -1, bottom: -1, width: 2, backgroundColor: palette.ocean },
  date: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 20, fontWeight: '800', marginRight: 12 },
  dateDay: { color: palette.ocean, fontFamily: 'monospace', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  itemRow: { minHeight: 104, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 16 },
  linkedBookingRow: { backgroundColor: palette.soft },
  itemPressed: { opacity: 0.55 },
  timeColumn: { width: 64, alignItems: 'flex-end', paddingTop: 20, paddingRight: 6 },
  time: { color: palette.ink, fontFamily: 'monospace', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  timeKind: { color: palette.smoke, fontSize: 10, lineHeight: 15, marginTop: 2 },
  railColumn: { width: 50, alignItems: 'center', position: 'relative' },
  rail: { position: 'absolute', left: 24, width: 2, backgroundColor: palette.accent },
  linkedRail: { backgroundColor: palette.ocean },
  railTop: { top: 0, height: 22 },
  railBottom: { top: 62, bottom: 0 },
  iconCircle: { width: 42, height: 42, borderRadius: 21, marginTop: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft, borderWidth: 2, borderColor: palette.accent, zIndex: 1 },
  bookingIconCircle: { backgroundColor: palette.ocean, borderColor: palette.ocean },
  bookingEndIconCircle: { backgroundColor: palette.paper, borderColor: palette.ocean },
  itemCopy: { flex: 1, justifyContent: 'center', paddingVertical: 18, paddingLeft: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  bookingTag: { color: palette.ocean, fontWeight: '700' },
  itemTitle: { color: palette.ink, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  note: { color: palette.slate, fontSize: 12, lineHeight: 17, marginTop: 3 },
  chevron: { color: palette.smoke, alignSelf: 'center', fontSize: 22, lineHeight: 22, marginLeft: 8 },
  emptyRow: { minHeight: 82, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 16 },
  emptyTime: { color: palette.smoke, fontFamily: 'monospace', fontSize: 14 },
  emptyIconCircle: { width: 36, height: 36, borderRadius: 18, marginTop: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.mist },
  emptyDay: { flex: 1, alignSelf: 'center', color: palette.smoke, fontSize: 13, lineHeight: 19, paddingLeft: 8 },
  modal: { flex: 1, backgroundColor: palette.canvas },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  cancel: { color: palette.slate },
  modalTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  save: { color: palette.ocean, fontWeight: '700' },
  form: { padding: 20, gap: 9 },
  label: { color: palette.slate, fontFamily: 'monospace', fontSize: 11, fontWeight: '400', marginTop: 10 },
  input: { minHeight: 50, backgroundColor: palette.paper, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14, color: palette.ink, fontSize: 16 },
  noteInput: { minHeight: 120, textAlignVertical: 'top' },
  deleteButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  deleteText: { color: palette.danger, fontSize: 15, fontWeight: '700' },
});
