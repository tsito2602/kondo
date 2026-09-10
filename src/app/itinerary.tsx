import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateRangePicker } from '@/components/date-range-picker';
import { palette } from '@/constants/design';
import type { ItineraryItem } from '@/data/types';
import { useTravel } from '@/data/travel-provider';

export default function ItineraryScreen() {
  const { selectedTrip, items, createItem, updateItem, deleteItem, pendingCount } = useTravel();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [day, setDay] = useState(selectedTrip?.startsOn ?? '');
  const [time, setTime] = useState('10:00');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  const grouped = items.reduce<Record<string, typeof items>>((result, item) => {
    (result[item.day] ??= []).push(item);
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>{selectedTrip?.name ?? 'tabi'}</Text><Text style={styles.title}>日程</Text></View>
          {selectedTrip ? <Pressable onPress={openAdd} style={styles.addButton}><Text style={styles.addText}>＋ 予定</Text></Pressable> : null}
        </View>
        {pendingCount ? <Text style={styles.pending}>{pendingCount}件を端末に保存済み · オンライン時に同期</Text> : null}

        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行がありません</Text><Text style={styles.emptyBody}>「旅」タブから旅行を作成してください。</Text></View>
        ) : !items.length ? (
          <View style={styles.empty}><Text style={styles.emptyMark}>＋</Text><Text style={styles.emptyTitle}>予定を追加</Text><Text style={styles.emptyBody}>移動、食事、観光などを時系列でまとめられます。</Text></View>
        ) : (
          Object.entries(grouped).map(([date, dateItems], dayIndex) => (
            <View key={date} style={styles.dayCard}>
              <View style={styles.dayBadge}><Text style={styles.dayLabel}>DAY</Text><Text style={styles.dayNumber}>{dayIndex + 1}</Text></View>
              <View style={styles.dayContent}>
                <Text style={styles.date}>{date}</Text>
                <View style={styles.items}>
                  {dateItems.map((item) => (
                    <Pressable
                      accessibilityHint="予定を編集します"
                      accessibilityRole="button"
                      key={item.id}
                      onPress={() => openEdit(item)}
                      style={({ pressed }) => [styles.itemRow, pressed && styles.itemPressed]}>
                      <Text style={styles.time}>{item.time}</Text>
                      <View style={styles.itemCopy}><Text style={styles.itemTitle}>{item.title}</Text>{item.note ? <Text style={styles.note}>{item.note}</Text> : null}</View>
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
            <View style={styles.dateRow}>
              <View style={styles.dateField}><DateRangePicker mode="single" label="日付" startDate={day} endDate={day} onChange={(range) => setDay(range.startDate)} /></View>
              <View style={styles.timeField}><Text style={styles.label}>時刻</Text><TextInput value={time} onChangeText={setTime} placeholder="10:00" style={styles.input} /></View>
            </View>
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
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingBottom: 120 },
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
  itemPressed: { opacity: 0.55 },
  time: { color: palette.ocean, width: 52, fontFamily: 'monospace', fontSize: 12, fontWeight: '700' },
  itemCopy: { flex: 1 },
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
  dateRow: { flexDirection: 'row', gap: 12 },
  dateField: { flex: 1 },
  timeField: { width: 110 },
  deleteButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  deleteText: { color: palette.danger, fontSize: 15, fontWeight: '700' },
});
