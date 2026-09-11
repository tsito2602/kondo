import { router } from 'expo-router';
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

const BOOKING_MARKS: Record<BookingKind, string> = {
  flight: '空',
  hotel: '宿',
  train: '鉄',
  car: '車',
  restaurant: '食',
  ticket: '券',
  other: '予',
};

const BOOKING_LABELS: Record<BookingKind, string> = {
  flight: 'フライト',
  hotel: '宿泊',
  train: '鉄道',
  car: 'レンタカー',
  restaurant: 'レストラン',
  ticket: 'チケット',
  other: '予約',
};

type TimelineEntry = {
  key: string;
  day: string;
  time: string;
  title: string;
  note: string;
  item?: ItineraryItem;
  booking?: Booking;
  bookingStage?: string;
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
  }];

  if (booking.endDay && booking.endDay !== booking.day) {
    entries.push({
      key: `booking-${booking.id}-end`,
      day: booking.endDay,
      time: booking.endTime,
      title: booking.title,
      note: booking.kind === 'hotel' ? booking.detail : bookingNote(booking),
      booking,
      bookingStage: endStage,
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

function dayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
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
        ) : itineraryDates.map((date, dayIndex) => {
          const dateItems = grouped[date] ?? [];
          return (
            <View key={date} onLayout={(event) => { dayOffsets.current[date] = event.nativeEvent.layout.y; }} style={styles.daySection}>
              <View style={styles.dayHeading}>
                <View style={styles.dayCount}><Text style={styles.dayCountLabel}>DAY</Text><Text style={styles.dayCountNumber}>{dayIndex + 1}</Text></View>
                <View style={styles.dayHeadingCopy}>
                  <Text style={styles.dayDate}>{dayDate(date)}</Text>
                  <Text style={styles.dayDestination}>{selectedTrip.destination}</Text>
                </View>
                <View style={styles.dayHeadingRule} />
              </View>

              {dateItems.length ? <View style={styles.timeline}>
                {dateItems.map((entry, entryIndex) => {
                  const isBooking = Boolean(entry.booking);
                  const mark = entry.booking ? BOOKING_MARKS[entry.booking.kind] : '•';
                  return (
                    <Pressable
                      accessibilityHint={entry.booking ? '予約の詳細を開きます' : '予定を編集します'}
                      accessibilityRole="button"
                      key={entry.key}
                      onPress={() => entry.booking && selectedTrip ? router.push({ pathname: '/trips/[tripId]/bookings', params: { tripId: selectedTrip.id, booking: entry.booking.id } }) : openEdit(entry.item!)}
                      style={({ pressed }) => [styles.timelineRow, pressed && styles.itemPressed]}>
                      <View style={styles.timeColumn}>
                        <Text style={styles.time}>{entry.time || '—'}</Text>
                      </View>
                      <View style={styles.railColumn}>
                        {entryIndex < dateItems.length - 1 ? <View style={styles.rail} /> : null}
                        <View style={[styles.timelineNode, isBooking && styles.bookingNode]}>
                          <Text style={[styles.timelineMark, isBooking && styles.bookingMark]}>{mark}</Text>
                        </View>
                      </View>
                      <View style={[styles.entryCard, isBooking && styles.bookingCard]}>
                        {entry.booking ? <View style={styles.bookingMetaRow}>
                          <Text style={styles.bookingTag}>{BOOKING_LABELS[entry.booking.kind]} · {entry.bookingStage}</Text>
                          {entry.booking.confirmationCode ? <Text accessibilityLabel={`予約番号 ${entry.booking.confirmationCode}`} numberOfLines={1} style={styles.confirmation}>NO. {entry.booking.confirmationCode}</Text> : null}
                        </View> : null}
                        <View style={styles.entryTitleRow}>
                          <Text style={styles.itemTitle}>{entry.title}</Text>
                          <Text style={styles.chevron}>›</Text>
                        </View>
                        {entry.note ? <Text style={[styles.note, isBooking && styles.bookingNote]}>{entry.note}</Text> : null}
                        {entry.booking?.detail && entry.note !== entry.booking.detail ? <Text style={styles.detail} numberOfLines={2}>{entry.booking.detail}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View> : <View style={styles.emptyTimelineRow}>
                <View style={styles.timeColumn}><Text style={styles.emptyTime}>—</Text></View>
                <View style={styles.railColumn}><View style={styles.emptyNode} /></View>
                <View style={styles.emptyDayCard}><Text style={styles.emptyDay}>予定はまだありません</Text></View>
              </View>}
            </View>
          );
        })}
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
  pending: { color: palette.slate, fontFamily: 'monospace', fontSize: 11, marginTop: 12 },
  empty: { minHeight: 430, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: palette.ink, fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -0.8, marginTop: 14 },
  emptyBody: { color: palette.slate, textAlign: 'center', marginTop: 7 },
  daySection: { marginTop: 28 },
  dayHeading: { minHeight: 52, flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  dayCount: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  dayCountLabel: { color: palette.slate, fontFamily: 'monospace', fontSize: 7, lineHeight: 10, fontWeight: '700', letterSpacing: 0.7 },
  dayCountNumber: { color: palette.ink, fontSize: 20, lineHeight: 21, fontWeight: '900' },
  dayHeadingCopy: { marginLeft: 13 },
  dayDate: { color: palette.ink, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  dayDestination: { color: palette.smoke, fontSize: 11, lineHeight: 16, marginTop: 1 },
  dayHeadingRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.ash, marginLeft: 16 },
  timeline: { width: '100%' },
  timelineRow: { minHeight: 82, flexDirection: 'row', alignItems: 'stretch' },
  timeColumn: { width: 56, alignItems: 'flex-end', paddingTop: 16, paddingRight: 10 },
  time: { color: palette.ocean, fontFamily: 'monospace', fontSize: 12, lineHeight: 18, fontWeight: '800' },
  railColumn: { width: 32, alignItems: 'center', position: 'relative' },
  rail: { position: 'absolute', top: 32, bottom: -16, width: 1, backgroundColor: palette.ash },
  timelineNode: { width: 24, height: 24, marginTop: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.ash, zIndex: 1 },
  bookingNode: { backgroundColor: palette.ocean, borderColor: palette.ocean },
  timelineMark: { color: palette.slate, fontSize: 13, lineHeight: 16, fontWeight: '900' },
  bookingMark: { color: palette.paper, fontSize: 10 },
  entryCard: { flex: 1, minWidth: 0, backgroundColor: palette.paper, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12 },
  bookingCard: { borderLeftWidth: 3, borderLeftColor: palette.ocean },
  bookingMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  bookingTag: { flexShrink: 0, color: palette.ocean, fontFamily: 'monospace', fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0.3 },
  confirmation: { flex: 1, color: palette.smoke, fontFamily: 'monospace', fontSize: 8, lineHeight: 12, textAlign: 'right' },
  entryTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  itemTitle: { flex: 1, color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  note: { color: palette.slate, fontSize: 12, lineHeight: 18, marginTop: 5 },
  bookingNote: { color: palette.ocean, fontFamily: 'monospace', fontSize: 13, fontWeight: '800' },
  detail: { color: palette.slate, fontSize: 11, lineHeight: 17, marginTop: 5 },
  chevron: { color: palette.smoke, fontSize: 22, lineHeight: 22, marginLeft: 12 },
  itemPressed: { opacity: 0.55 },
  emptyTimelineRow: { minHeight: 62, flexDirection: 'row' },
  emptyTime: { color: palette.ash, fontFamily: 'monospace', fontSize: 12 },
  emptyNode: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: palette.ash, backgroundColor: palette.canvas, marginTop: 19 },
  emptyDayCard: { flex: 1, minHeight: 48, justifyContent: 'center', borderRadius: 16, backgroundColor: palette.soft, paddingHorizontal: 16, marginBottom: 8 },
  emptyDay: { color: palette.smoke, fontSize: 12, lineHeight: 18 },
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
