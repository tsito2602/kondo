import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateRangePicker } from '@/components/date-range-picker';
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

export default function ItineraryScreen() {
  const { selectedTrip, items, bookings, createItem, updateItem, deleteItem, pendingCount } = useTravel();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [day, setDay] = useState(selectedTrip?.startsOn ?? '');
  const [time, setTime] = useState('10:00');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  const timeline = [
    ...items.map<TimelineEntry>((item) => ({ key: `item-${item.id}`, day: item.day, time: item.time, title: item.title, note: item.note, item })),
    ...bookings.flatMap(bookingTimelineEntries),
  ].sort((left, right) => left.day.localeCompare(right.day) || left.time.localeCompare(right.time) || left.key.localeCompare(right.key));
  const grouped = timeline.reduce<Record<string, TimelineEntry[]>>((result, entry) => {
    (result[entry.day] ??= []).push(entry);
    return result;
  }, {});

  const openAdd = () => {
    if (!selectedTrip) return;
    setEditingId(null);
    setDay(selectedTrip.startsOn);
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>ITINERARY</Text><Text style={styles.title}>しおり</Text></View>
          {selectedTrip ? <Pressable onPress={openAdd} style={styles.addButton}><Text style={styles.addText}>＋ 予定</Text></Pressable> : null}
        </View>
        {pendingCount ? <Text style={styles.pending}>{pendingCount}件を端末に保存済み · オンライン時に同期</Text> : null}

        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行がありません</Text><Text style={styles.emptyBody}>旅行一覧から旅行を選択してください。</Text></View>
        ) : !timeline.length ? (
          <View style={styles.empty}><Text style={styles.emptyMark}>＋</Text><Text style={styles.emptyTitle}>予定を追加</Text><Text style={styles.emptyBody}>移動、食事、観光などを時系列でまとめられます。</Text></View>
        ) : (
          Object.entries(grouped).map(([date, dateItems], dayIndex) => (
            <View key={date} style={styles.dayCard}>
              <View style={styles.dayBadge}><Text style={styles.dayLabel}>DAY</Text><Text style={styles.dayNumber}>{dayIndex + 1}</Text></View>
              <View style={styles.dayContent}>
                <Text style={styles.date}>{date}</Text>
                <View style={styles.items}>
                  {dateItems.map((entry) => (
                    <Pressable
                      accessibilityHint={entry.booking ? '予約の詳細を開きます' : '予定を編集します'}
                      accessibilityRole="button"
                      key={entry.key}
                      onPress={() => entry.booking && selectedTrip ? router.push({ pathname: '/trips/[tripId]/bookings', params: { tripId: selectedTrip.id, booking: entry.booking.id } }) : openEdit(entry.item!)}
                      style={({ pressed }) => [styles.itemRow, entry.booking && styles.bookingRow, pressed && styles.itemPressed]}>
                      <Text style={styles.time}>{entry.time}</Text>
                      <View style={styles.itemCopy}>
                        {entry.booking ? <Text style={styles.bookingTag}>予約 · {entry.bookingStage}</Text> : null}
                        <Text style={styles.itemTitle}>{entry.title}</Text>
                        {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

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
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingTop: 10, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { alignSelf: 'flex-start', color: palette.ink, backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 12, paddingVertical: 5, fontFamily: 'monospace', fontSize: 10, fontWeight: '400' },
  title: { color: palette.ink, fontSize: 42, lineHeight: 42, fontWeight: '900', letterSpacing: -1.5, marginTop: 8 },
  addButton: { minHeight: 44, backgroundColor: palette.ocean, borderRadius: 8, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' },
  addText: { color: palette.paper, fontWeight: '700' },
  pending: { color: palette.slate, fontFamily: 'monospace', fontSize: 11, marginTop: 12 },
  empty: { minHeight: 430, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyMark: { color: palette.accent, fontSize: 42, fontWeight: '900' },
  emptyTitle: { color: palette.ink, fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -0.8, marginTop: 14 },
  emptyBody: { color: palette.slate, textAlign: 'center', marginTop: 7 },
  dayCard: { flexDirection: 'row', backgroundColor: palette.paper, borderRadius: 32, padding: 20, marginTop: 16 },
  dayBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  dayLabel: { color: palette.ink, fontFamily: 'monospace', fontSize: 8, fontWeight: '400' },
  dayNumber: { color: palette.ink, fontSize: 22, lineHeight: 24, fontWeight: '900' },
  dayContent: { flex: 1 },
  date: { color: palette.slate, fontFamily: 'monospace', fontSize: 11, fontWeight: '400' },
  items: { marginTop: 8 },
  itemRow: { minHeight: 58, flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  bookingRow: { backgroundColor: palette.soft, borderRadius: 12, borderBottomWidth: 0, paddingHorizontal: 10, marginVertical: 3 },
  itemPressed: { opacity: 0.55 },
  time: { color: palette.ocean, width: 52, fontFamily: 'monospace', fontSize: 12, fontWeight: '700' },
  itemCopy: { flex: 1 },
  bookingTag: { color: palette.ocean, fontFamily: 'monospace', fontSize: 9, lineHeight: 13, fontWeight: '700', marginBottom: 2 },
  itemTitle: { color: palette.ink, fontSize: 16, fontWeight: '700' },
  note: { color: palette.slate, fontSize: 12, lineHeight: 18, marginTop: 4 },
  chevron: { color: palette.smoke, fontSize: 22, lineHeight: 22, marginLeft: 12 },
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

