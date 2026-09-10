import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTravel } from '@/data/travel-provider';

export default function ItineraryScreen() {
  const { selectedTrip, items, createItem, deleteItem, pendingCount } = useTravel();
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState(selectedTrip?.startsOn ?? '');
  const [time, setTime] = useState('10:00');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  const grouped = items.reduce<Record<string, typeof items>>((result, item) => {
    (result[item.day] ??= []).push(item);
    return result;
  }, {});

  const save = () => {
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      Alert.alert('入力を確認してください', '日付、時刻、予定名を入力してください。');
      return;
    }
    createItem({ day, time, kind: '予定', title: title.trim(), note: note.trim() });
    setAdding(false);
    setTitle('');
    setNote('');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>{selectedTrip?.name ?? 'tabi'}</Text><Text style={styles.title}>旅の日程</Text></View>
          {selectedTrip ? <Pressable onPress={() => { setDay(selectedTrip.startsOn); setAdding(true); }} style={styles.addButton}><Text style={styles.addText}>＋ 予定</Text></Pressable> : null}
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
                    <Pressable key={item.id} onLongPress={() => Alert.alert('予定を削除しますか？', item.title, [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => deleteItem(item.id) }])} style={styles.itemRow}>
                      <Text style={styles.time}>{item.time}</Text>
                      <View style={styles.itemCopy}><Text style={styles.itemTitle}>{item.title}</Text>{item.note ? <Text style={styles.note}>{item.note}</Text> : null}</View>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={adding} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAdding(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setAdding(false)}><Text style={styles.cancel}>キャンセル</Text></Pressable>
            <Text style={styles.modalTitle}>予定を追加</Text>
            <Pressable onPress={save}><Text style={styles.save}>保存</Text></Pressable>
          </View>
          <View style={styles.form}>
            <View style={styles.dateRow}>
              <View style={styles.dateField}><Text style={styles.label}>日付</Text><TextInput value={day} onChangeText={setDay} placeholder="2026-11-21" style={styles.input} /></View>
              <View style={styles.timeField}><Text style={styles.label}>時刻</Text><TextInput value={time} onChangeText={setTime} placeholder="10:00" style={styles.input} /></View>
            </View>
            <Text style={styles.label}>予定</Text><TextInput value={title} onChangeText={setTitle} placeholder="空港へ移動" style={styles.input} autoFocus />
            <Text style={styles.label}>メモ</Text><TextInput value={note} onChangeText={setNote} placeholder="集合場所や予約番号など" style={[styles.input, styles.noteInput]} multiline />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F0E9' }, content: { padding: 20, paddingBottom: 120 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: '#C45F43', fontSize: 12, fontWeight: '800' }, title: { color: '#20332C', fontSize: 30, fontWeight: '900', marginTop: 4 }, addButton: { backgroundColor: '#20332C', borderRadius: 15, paddingHorizontal: 15, paddingVertical: 11 }, addText: { color: '#FFF', fontWeight: '800' }, pending: { color: '#8C654D', fontSize: 12, marginTop: 12 },
  empty: { minHeight: 430, alignItems: 'center', justifyContent: 'center', padding: 32 }, emptyMark: { color: '#C45F43', fontSize: 38 }, emptyTitle: { color: '#20332C', fontSize: 21, fontWeight: '800', marginTop: 14 }, emptyBody: { color: '#717871', textAlign: 'center', marginTop: 7 },
  dayCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 22, padding: 18, marginTop: 15 }, dayBadge: { width: 52, height: 62, borderRadius: 16, backgroundColor: '#31594E', alignItems: 'center', justifyContent: 'center', marginRight: 16 }, dayLabel: { color: '#BFD2CB', fontSize: 8, fontWeight: '800' }, dayNumber: { color: '#FFF', fontSize: 23, fontWeight: '900' }, dayContent: { flex: 1 }, date: { color: '#C45F43', fontSize: 12, fontWeight: '800' }, items: { marginTop: 8 }, itemRow: { flexDirection: 'row', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DEDAD2' }, time: { color: '#69716B', width: 50, fontSize: 13, fontWeight: '700' }, itemCopy: { flex: 1 }, itemTitle: { color: '#20332C', fontSize: 15, fontWeight: '800' }, note: { color: '#727972', fontSize: 12, lineHeight: 18, marginTop: 3 },
  modal: { flex: 1, backgroundColor: '#F7F5F0' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E4E0D8' }, cancel: { color: '#69716B' }, modalTitle: { color: '#20332C', fontSize: 17, fontWeight: '800' }, save: { color: '#C45F43', fontWeight: '800' }, form: { padding: 20, gap: 9 }, label: { color: '#56605A', fontSize: 12, fontWeight: '800', marginTop: 10 }, input: { backgroundColor: '#FFF', borderRadius: 15, paddingHorizontal: 15, paddingVertical: 14, color: '#20332C', fontSize: 15 }, noteInput: { minHeight: 120, textAlignVertical: 'top' }, dateRow: { flexDirection: 'row', gap: 12 }, dateField: { flex: 1 }, timeField: { width: 110 },
});
