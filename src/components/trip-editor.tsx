import { router } from 'expo-router';
import { CoverPicker } from './cover-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import type { Trip } from '@/data/types';
import { localDate, validDate } from '@/utils/dates';
import { DateRangePicker } from './date-range-picker';
import { FormSheet } from './form-sheet';
import { DeleteTripDialog } from './delete-trip-dialog';

export function TripEditor({ trip, onClose, onSaved }: { trip?: Trip; onClose: () => void; onSaved?: (id: string) => void }) {
  const { createTrip, updateTrip, deleteTrip } = useTravel();
  const [name, setName] = useState(trip?.name ?? '');
  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [startsOn, setStartsOn] = useState(trip?.startsOn ?? localDate());
  const [endsOn, setEndsOn] = useState(trip?.endsOn ?? localDate());
  const [coverImage, setCoverImage] = useState(trip?.coverImage ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [error, setError] = useState('');
  const [initial] = useState(() => JSON.stringify([name, destination, startsOn, endsOn, coverImage]));
  const save = () => {
    if (!name.trim() || !validDate(startsOn) || !validDate(endsOn) || endsOn < startsOn) return setError('旅行名と正しい旅行期間を入力してください');
    const input = { name: name.trim(), destination: destination.trim(), startsOn, endsOn, coverImage };
    let id: string;
    if (trip) { updateTrip(trip.id, input); id = trip.id; } else id = createTrip(input);
    onClose(); onSaved?.(id);
  };
  const remove = async () => {
    if (!trip || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteTrip(trip.id);
      onClose();
      router.replace('/');
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : '削除できませんでした');
    } finally { setDeleting(false); }
  };
  return <><FormSheet visible title={trip ? '旅行を編集' : '新しい旅行'} onClose={onClose} onSave={save} canSave={Boolean(name.trim()) && !deleting} dirty={JSON.stringify([name, destination, startsOn, endsOn, coverImage]) !== initial} error={error}>
    <Text style={styles.label}>トップ画像</Text>
    <CoverPicker value={coverImage} onChange={setCoverImage} />
    <Text style={styles.label}>旅行名</Text>
    <TextInput accessibilityLabel="旅行名" maxLength={100} value={name} onChangeText={setName} placeholder="例：ウィーンの街を歩く" placeholderTextColor={palette.smoke} returnKeyType="next" style={styles.input} />
    <Text style={styles.label}>行き先（任意）</Text>
    <TextInput accessibilityLabel="行き先" maxLength={160} value={destination} onChangeText={setDestination} placeholder="都市・エリア" placeholderTextColor={palette.smoke} style={styles.input} />
    <DateRangePicker startDate={startsOn} endDate={endsOn} label="旅行期間" onChange={(range) => { setStartsOn(range.startDate); setEndsOn(range.endDate); }} />
    {trip?.role === 'owner' ? <Pressable accessibilityRole="button" onPress={() => { setDeleteError(''); setConfirmDelete(true); }} style={{ marginTop: 24, padding: 16, alignItems: 'center' }}><Text style={{ color: palette.danger, fontSize: 14 }}>この旅行を削除</Text></Pressable> : null}
  </FormSheet>
    {trip?.role === 'owner' ? <DeleteTripDialog visible={confirmDelete} name={trip.name} busy={deleting} error={deleteError} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} /> : null}
  </>;
}
const styles = StyleSheet.create({ label: { color: palette.slate, fontSize: 13, fontWeight: '600', marginTop: 8 }, input: { minHeight: 52, backgroundColor: palette.paper, borderRadius: 10, padding: 16, color: palette.ink, fontSize: 16 } });
