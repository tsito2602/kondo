import { type ComponentProps, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateRangePicker } from '@/components/date-range-picker';
import { palette } from '@/constants/design';
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

type Draft = Pick<Booking, 'kind' | 'title' | 'detail' | 'day' | 'time' | 'confirmationCode' | 'note'>;

function blankDraft(day: string): Draft {
  return { kind: 'flight', title: '', detail: '', day, time: '', confirmationCode: '', note: '' };
}

export default function BookingsScreen() {
  const { bookings, createBooking, deleteBooking, pendingCount, selectedTrip, updateBooking } = useTravel();
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
      day: booking.day,
      time: booking.time,
      confirmationCode: booking.confirmationCode,
      note: booking.note,
    });
    setFormError('');
    setFormOpen(true);
  };

  const save = () => {
    if (!draft.title.trim() || !draft.day) {
      setFormError('予約名と日付を入力してください。');
      return;
    }
    if (draft.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
      setFormError('時刻は24時間表記（例 09:30）で入力してください。');
      return;
    }
    const input = {
      ...draft,
      title: draft.title.trim(),
      detail: draft.detail.trim(),
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
            {bookings.map((booking, index) => {
              const kind = KINDS.find((entry) => entry.value === booking.kind) ?? KINDS[KINDS.length - 1];
              return (
                <Pressable key={booking.id} onPress={() => openEdit(booking)} style={({ pressed }) => [styles.ticket, pressed && styles.pressed]} accessibilityLabel={`${booking.title}を編集`}>
                  <View style={styles.copy}>
                    <View style={styles.ticketTop}>
                      <View style={styles.typeTag}><Text style={styles.type}>{kind.short}</Text></View>
                      <Text style={styles.serial}>TABI/{String(index + 1).padStart(2, '0')}</Text>
                    </View>
                    <Text numberOfLines={2} style={styles.cardTitle}>{booking.title}</Text>
                    {booking.detail ? <Text numberOfLines={2} style={styles.detail}>{booking.detail}</Text> : null}
                    <Text style={styles.meta}>{booking.day.replaceAll('-', '.')} {booking.time}{booking.confirmationCode ? `  /  ${booking.confirmationCode}` : ''}</Text>
                  </View>
                  <View style={styles.stub}>
                    <Text style={styles.icon}>{kind.icon}</Text>
                    <Text style={styles.stubNo}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text style={styles.stubLabel}>PASS</Text>
                  </View>
                  <View style={[styles.notch, styles.notchTop]} />
                  <View style={[styles.notch, styles.notchBottom]} />
                </Pressable>
              );
            })}
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
                {KINDS.map((kind) => <Pressable key={kind.value} onPress={() => setDraft((current) => ({ ...current, kind: kind.value }))} style={[styles.kindButton, draft.kind === kind.value && styles.kindSelected]}><Text style={[styles.kindText, draft.kind === kind.value && styles.kindTextSelected]}>{kind.label}</Text></Pressable>)}
              </View>

              <Field label="予約名" placeholder="例：ANA 257便" value={draft.title} onChangeText={(title) => setDraft((current) => ({ ...current, title }))} />
              <Field label="詳細" placeholder="例：羽田 → 福岡" value={draft.detail} onChangeText={(detail) => setDraft((current) => ({ ...current, detail }))} />
              <DateRangePicker label="日付" mode="single" startDate={draft.day} endDate={draft.day} onChange={({ startDate }) => setDraft((current) => ({ ...current, day: startDate }))} />
              <Field label="時刻" placeholder="09:30" value={draft.time} onChangeText={(time) => setDraft((current) => ({ ...current, time }))} />
              <Field label="予約・確認番号" placeholder="任意" value={draft.confirmationCode} onChangeText={(confirmationCode) => setDraft((current) => ({ ...current, confirmationCode }))} />
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
  ticket: { minHeight: 174, flexDirection: 'row', position: 'relative', overflow: 'hidden', borderRadius: 28, backgroundColor: palette.paper },
  copy: { flex: 1, minWidth: 0, padding: 20 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  typeTag: { alignSelf: 'flex-start', backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 10, paddingVertical: 5 },
  type: { color: palette.ink, fontFamily: 'monospace', fontSize: 9, letterSpacing: 0.8 },
  serial: { color: palette.smoke, fontFamily: 'monospace', fontSize: 9 },
  cardTitle: { color: palette.ink, fontSize: 20, lineHeight: 23, fontWeight: '900', letterSpacing: -0.4, marginTop: 18 },
  detail: { color: palette.slate, fontSize: 14, marginTop: 6 },
  meta: { color: palette.slate, fontFamily: 'monospace', fontSize: 10, lineHeight: 16, marginTop: 12 },
  stub: { width: 76, borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: palette.ocean, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  icon: { color: palette.ocean, fontSize: 24, fontWeight: '900' },
  stubNo: { color: palette.ink, fontSize: 24, lineHeight: 27, fontWeight: '900', marginTop: 12 },
  stubLabel: { color: palette.smoke, fontFamily: 'monospace', fontSize: 8, marginTop: 2 },
  notch: { position: 'absolute', right: 66, width: 20, height: 20, borderRadius: 10, backgroundColor: palette.canvas, zIndex: 2 },
  notchTop: { top: -10 },
  notchBottom: { bottom: -10 },
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
  field: { gap: 8 },
  label: { color: palette.slate, fontFamily: 'monospace', fontSize: 11 },
  input: { minHeight: 52, backgroundColor: palette.paper, borderRadius: 8, color: palette.ink, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  error: { color: palette.danger, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  deleteButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  deleteText: { color: palette.danger, fontSize: 14, fontWeight: '700' },
  saveButton: { minWidth: 120, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean, borderRadius: 8, paddingHorizontal: 22 },
  saveText: { color: palette.paper, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.62 },
});
