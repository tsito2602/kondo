import { router } from 'expo-router';
import { CoverPicker } from './cover-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import type { Trip } from '@/data/types';
import { localDate, validDate } from '@/utils/dates';
import { DateRangePicker } from './date-range-picker';
import { FormSheet } from './form-sheet';

export function TripEditor({ trip, onClose, onSaved }: { trip?: Trip; onClose: () => void; onSaved?: (id: string) => void }) {
  const { createTrip, updateTrip, deleteTrip } = useTravel();
  const [name, setName] = useState(trip?.name ?? '');
  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [startsOn, setStartsOn] = useState(trip?.startsOn ?? localDate());
  const [endsOn, setEndsOn] = useState(trip?.endsOn ?? localDate());
  const [coverImage, setCoverImage] = useState(trip?.coverImage ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [initial] = useState(() => JSON.stringify([name, destination, startsOn, endsOn, coverImage]));
  const save = () => {
    if (!name.trim() || !validDate(startsOn) || !validDate(endsOn) || endsOn < startsOn) return setError('旅行名と正しい旅行期間を入力してください');
    const input = { name: name.trim(), destination: destination.trim(), startsOn, endsOn, coverImage };
    let id: string;
    if (trip) { updateTrip(trip.id, input); id = trip.id; } else id = createTrip(input);
    onClose(); onSaved?.(id);
  };
  return <FormSheet visible title={trip ? '旅行を編集' : '新しい旅行'} onClose={onClose} onSave={save} canSave={Boolean(name.trim()) && !deleting} dirty={JSON.stringify([name, destination, startsOn, endsOn, coverImage]) !== initial} error={error}>
    <Text style={styles.label}>トップ画像</Text>
    <CoverPicker value={coverImage} onChange={setCoverImage} />
    <Text style={styles.label}>旅行名</Text>
    <TextInput accessibilityLabel="旅行名" maxLength={100} value={name} onChangeText={setName} placeholder="例：ウィーンの街を歩く" placeholderTextColor={palette.smoke} returnKeyType="next" style={styles.input} />
    <Text style={styles.label}>行き先（任意）</Text>
    <TextInput accessibilityLabel="行き先" maxLength={160} value={destination} onChangeText={setDestination} placeholder="都市・エリア" placeholderTextColor={palette.smoke} style={styles.input} />
    <DateRangePicker startDate={startsOn} endDate={endsOn} label="旅行期間" onChange={(range) => { setStartsOn(range.startDate); setEndsOn(range.endDate); }} />
    {trip?.role === 'owner' ? <View style={{ marginTop: 24, gap: 12 }}>
      {confirmDelete ? <View style={{ gap: 12, backgroundColor: palette.paper, padding: 18, borderRadius: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: palette.ink }}>「{trip.name}」を削除しますか？</Text>
        <Text style={{ color: palette.slate, lineHeight: 22 }}>共有相手の画面からも、しおり・予約・書類・行きたい場所・準備が削除されます。この操作は元に戻せません。</Text>
        <Pressable disabled={deleting} onPress={() => { setDeleting(true); setError(''); void deleteTrip(trip.id).then(() => { onClose(); router.replace('/'); }).catch((cause) => setError(cause instanceof Error ? cause.message : '削除できませんでした')).finally(() => setDeleting(false)); }} style={{ backgroundColor: palette.danger, borderRadius: 10, padding: 16, alignItems: 'center' }}><Text style={{ color: palette.paper, fontWeight: '700' }}>{deleting ? '削除中…' : '旅行を完全に削除'}</Text></Pressable>
        <Pressable disabled={deleting} onPress={() => setConfirmDelete(false)} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: palette.slate }}>キャンセル</Text></Pressable>
      </View> : <Pressable onPress={() => setConfirmDelete(true)} style={{ padding: 16, alignItems: 'center' }}><Text style={{ color: palette.danger, fontSize: 14 }}>この旅行を削除</Text></Pressable>}
    </View> : null}
  </FormSheet>;
}
const styles = StyleSheet.create({ label: { color: palette.slate, fontSize: 13, fontWeight: '600', marginTop: 8 }, input: { minHeight: 52, backgroundColor: palette.paper, borderRadius: 10, padding: 16, color: palette.ink, fontSize: 16 } });
