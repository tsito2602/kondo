import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FormSheet } from '@/components/form-sheet';
import { FloatingAddButton } from '@/components/floating-add-button';
import { palette, mono } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import type { Place, PlaceInput, PlaceStatus } from '@/data/types';
import { mapUrl, placeStatuses, reservationStatuses } from '@/data/places';
import { confirmDeletion } from '@/utils/confirm-deletion';
import { DateRangePicker } from '@/components/date-range-picker';
import { useToast } from '@/components/toast';
import { useTripHeaderHeight } from '@/components/trip-header-context';

const empty: PlaceInput = { title: '', note: '', openingHours: '', reservationStatus: 'not_needed', location: '', status: 'want' };
export default function PlacesScreen() {
  const { canEdit, places, createPlace, updatePlace, deletePlace, selectedTrip, createItem } = useTravel();
  const toast = useToast();
  const headerHeight = useTripHeaderHeight();
  const [filter, setFilter] = useState<PlaceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Place | 'new' | null>(null);
  const [draft, setDraft] = useState<PlaceInput>(empty);
  const [initial, setInitial] = useState('');
  const [error, setError] = useState('');
  const [statusPlace, setStatusPlace] = useState<Place | null>(null);
  const [planning, setPlanning] = useState<Place | null>(null);
  const [day, setDay] = useState('');
  const filtered = useMemo(() => places.filter((place) => (filter === 'all' || place.status === filter) && `${place.title} ${place.note} ${place.location}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [places, filter, search]);
  const open = (place?: Place) => { const value = place ?? empty; setDraft(value); setInitial(JSON.stringify(value)); setError(''); setEditing(place ?? 'new'); };
  const save = () => {
    if (!draft.title.trim()) return setError('タイトルを入力してください');
    if (draft.location.trim() && !mapUrl(draft.location)) return setError('場所は住所か、http / httpsのURLを入力してください');
    const input = { ...draft, title: draft.title.trim(), location: draft.location.trim() };
    if (editing && editing !== 'new') updatePlace(editing.id, input); else createPlace(input);
    setEditing(null); toast('場所を保存しました');
  };
  const remove = () => { if (!editing || editing === 'new') return; confirmDeletion('この場所を削除しますか？', editing.title, () => { deletePlace(editing.id); setEditing(null); }); };
  const plan = () => {
    if (!planning || !day) return;
    createItem({ title: planning.title, day, time: '', kind: '予定', note: [planning.note, planning.location].filter(Boolean).join('\n') });
    updatePlace(planning.id, { ...planning, status: 'planned' });
    toast('しおりに追加しました'); setPlanning(null);
  };
  return <View style={styles.screen}>
    <ScrollView testID="places-scroll" contentContainerStyle={[styles.content, { paddingTop: headerHeight + 24 }]} showsVerticalScrollIndicator={false}>
      <View testID="places-heading" style={styles.heading}><View><Text style={styles.eyebrow}>SAVED PLACES</Text><Text style={styles.title}>行きたい場所</Text></View><Text style={styles.total}>{String(places.length).padStart(2, '0')}</Text></View>
      {places.length ? <TextInput value={search} onChangeText={setSearch} placeholder="場所を検索" accessibilityLabel="場所を検索" placeholderTextColor={palette.placeholder} style={styles.search} /> : null}
      {places.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {[{ value: 'all' as const, label: 'すべて' }, ...placeStatuses].map((item) => <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, filter === item.value && styles.filterSelected]}><Text style={[styles.filterText, filter === item.value && styles.filterTextSelected]}>{item.label} {item.value === 'all' ? places.length : places.filter((place) => place.status === item.value).length}</Text></Pressable>)}
      </ScrollView> : null}
      {!places.length ? <View style={styles.empty}><View style={styles.emptyPlaceMark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} size={46} tintColor={palette.ocean} /><View style={styles.emptyPlaceAdd}><SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} tintColor={palette.paper} /></View></View><Text style={styles.emptyTitle}>気になる場所を保存</Text><Pressable disabled={!canEdit} onPress={() => open()} style={styles.primary}><Text style={styles.primaryText}>＋ 場所を追加</Text></Pressable></View> : !filtered.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>該当する場所がありません</Text><Pressable onPress={() => { setFilter('all'); setSearch(''); }} style={styles.primary}><Text style={styles.primaryText}>絞り込みを解除</Text></Pressable></View> : <View testID="place-grid" style={{ gap: 16 }}>{filtered.map((place, index) => {
        const status = placeStatuses.find((entry) => entry.value === place.status)!;
        const reservation = reservationStatuses.find((entry) => entry.value === place.reservationStatus)!;
        return <View key={place.id} testID="place-card" style={[styles.card, place.status === 'visited' && styles.visited]}>
          <Pressable onPress={() => open(place)} style={styles.cardBody} accessibilityLabel={`${place.title}を編集`}>
            <View style={styles.cardTop}><Text style={styles.serial}>SPOT / {String(index + 1).padStart(2, '0')}</Text><Text style={[styles.reservation, place.reservationStatus === 'needed' && styles.needed]}>{reservation.label}</Text></View>
            <Text style={styles.placeTitle}>{place.title}</Text>
            {place.note ? <Text numberOfLines={3} style={styles.note}>{place.note}</Text> : null}
            {place.openingHours ? <Text style={styles.hours}>◷　{place.openingHours}</Text> : null}
            {place.location ? <Text numberOfLines={1} style={styles.location}>{/^https?:/i.test(place.location) ? '↗ 地図リンクを保存済み' : place.location}</Text> : null}
          </Pressable>
          <View style={styles.cardFooter}>
            <Pressable accessibilityLabel={`${place.title}のステータスを変更`} disabled={!canEdit} onPress={() => setStatusPlace(place)} style={[styles.status, place.status === 'visited' && styles.statusVisited]}><Text style={styles.statusText}>{status.mark}　{status.label}</Text></Pressable>
            <View style={styles.cardActions}>{canEdit && place.status === 'want' ? <Pressable onPress={() => { setDay(selectedTrip?.startsOn ?? ''); setPlanning(place); }} style={styles.action}><Text style={styles.actionText}>しおりへ</Text></Pressable> : null}<Pressable accessibilityLabel={`${place.title}の地図を開く`} onPress={() => { const url = mapUrl(place.location, place.title); if (url) void Linking.openURL(url); }} style={styles.action}><Text style={styles.actionText}>地図 ↗</Text></Pressable></View>
          </View>
        </View>;
      })}</View>}
    </ScrollView>
    {canEdit ? <FloatingAddButton label="場所を追加" onPress={() => open()} /> : null}
    {editing ? <FormSheet visible title={!canEdit ? '場所の詳細' : editing === 'new' ? '場所を追加' : '場所を編集'} onClose={() => setEditing(null)} onSave={canEdit ? save : undefined} canSave={Boolean(draft.title.trim())} dirty={JSON.stringify(draft) !== initial} error={error}>
      <Text style={styles.label}>タイトル</Text><TextInput editable={canEdit} autoFocus={canEdit} accessibilityLabel="場所のタイトル" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} maxLength={160} placeholder="カフェ、美術館、気になるお店" placeholderTextColor={palette.placeholder} style={styles.input} />
      <Text style={styles.label}>ステータス</Text><View style={styles.options}>{placeStatuses.map((item) => <Pressable key={item.value} disabled={!canEdit} onPress={() => setDraft({ ...draft, status: item.value })} style={[styles.option, draft.status === item.value && styles.filterSelected]}><Text style={styles.optionText}>{item.mark} {item.label}</Text></Pressable>)}</View>
      <Text style={styles.label}>場所</Text><TextInput editable={canEdit} accessibilityLabel="場所" value={draft.location} onChangeText={(location) => setDraft({ ...draft, location })} maxLength={2000} placeholder="URL または住所" placeholderTextColor={palette.placeholder} autoCapitalize="none" style={styles.input} /><Text style={styles.hint}>Google Mapsの共有URLがおすすめです</Text>
      <Text style={styles.label}>営業時間</Text><TextInput editable={canEdit} accessibilityLabel="営業時間" value={draft.openingHours} onChangeText={(openingHours) => setDraft({ ...draft, openingHours })} maxLength={500} placeholder="例：10:00–18:00 ／ 月曜休み" placeholderTextColor={palette.placeholder} style={styles.input} />
      <Text style={styles.label}>予約状況</Text><View style={styles.options}>{reservationStatuses.map((item) => <Pressable key={item.value} disabled={!canEdit} onPress={() => setDraft({ ...draft, reservationStatus: item.value })} style={[styles.option, draft.reservationStatus === item.value && styles.filterSelected]}><Text style={styles.optionText}>{item.label}</Text></Pressable>)}</View>
      <Text style={styles.label}>メモ</Text><TextInput editable={canEdit} accessibilityLabel="場所のメモ" value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} maxLength={4000} multiline placeholder="食べたいもの、見たい展示など" placeholderTextColor={palette.placeholder} style={[styles.input, styles.memo]} />
      {canEdit && editing !== 'new' ? <Pressable onPress={remove} style={styles.delete}><Text style={styles.deleteText}>この場所を削除</Text></Pressable> : null}
    </FormSheet> : null}
    {statusPlace ? <FormSheet visible title="ステータスを変更" onClose={() => setStatusPlace(null)}><Text style={styles.placeTitle}>{statusPlace.title}</Text>{placeStatuses.map((entry) => <Pressable key={entry.value} disabled={!canEdit} onPress={() => { updatePlace(statusPlace.id, { ...statusPlace, status: entry.value }); setStatusPlace(null); }} style={[styles.option, statusPlace.status === entry.value && styles.filterSelected]}><Text style={styles.optionText}>{entry.mark}　{entry.label}{statusPlace.status === entry.value ? '　✓' : ''}</Text></Pressable>)}</FormSheet> : null}
    {planning ? <FormSheet visible title="しおりに追加" onClose={() => setPlanning(null)} onSave={canEdit ? plan : undefined} saveLabel="追加" canSave={Boolean(day)}><Text style={styles.placeTitle}>{planning.title}</Text><DateRangePicker mode="single" startDate={day} endDate={day} label="訪問日" onChange={(range) => setDay(range.startDate)} /></FormSheet> : null}
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas }, content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 110, gap: 16 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }, eyebrow: { color: palette.ocean, fontFamily: mono, fontSize: 10, letterSpacing: 2, marginBottom: 8 }, title: { color: palette.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.7 }, total: { color: palette.ash, fontSize: 48, fontWeight: '300', fontFamily: mono },
  search: { minHeight: 48, backgroundColor: palette.paper, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, color: palette.ink }, filters: { gap: 6 }, filter: { borderRadius: 24, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: palette.mist }, filterSelected: { backgroundColor: palette.sky }, filterText: { color: palette.slate, fontSize: 12 }, filterTextSelected: { color: palette.ink, fontWeight: '700' },
  card: { borderRadius: 20, backgroundColor: palette.paper, overflow: 'hidden' }, visited: { backgroundColor: '#F4F8F6' }, cardBody: { padding: 20, gap: 10 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, serial: { color: palette.smoke, fontFamily: mono, fontSize: 10, letterSpacing: 1 }, reservation: { color: palette.ocean, fontSize: 11 }, needed: { color: '#A06839' }, placeTitle: { color: palette.ink, fontSize: 21, lineHeight: 29, fontWeight: '700' }, note: { color: palette.slate, fontSize: 14, lineHeight: 23 }, hours: { color: palette.slate, fontSize: 12, lineHeight: 20, marginTop: 4 }, location: { color: palette.smoke, fontSize: 12 },
  cardFooter: { padding: 12, paddingHorizontal: 16, borderTopWidth: 1, borderStyle: 'dashed', borderColor: palette.ash, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, status: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', backgroundColor: palette.soft, borderRadius: 20 }, statusVisited: { backgroundColor: '#DFEBE4' }, statusText: { color: palette.ink, fontSize: 12, fontWeight: '600' }, cardActions: { flexDirection: 'row', gap: 8 }, action: { paddingHorizontal: 6, minHeight: 36, justifyContent: 'center' }, actionText: { color: palette.ocean, fontSize: 12, fontWeight: '600' },
  empty: { paddingVertical: 60, alignItems: 'center', gap: 24 }, emptyPlaceMark: { width: 96, height: 96, borderRadius: 48, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' }, emptyPlaceAdd: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: palette.ocean, borderWidth: 3, borderColor: palette.canvas, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: palette.slate, fontSize: 18, fontWeight: '600' }, primary: { paddingHorizontal: 20, paddingVertical: 15, backgroundColor: palette.ocean, borderRadius: 12 }, primaryText: { color: palette.paper, fontSize: 14, fontWeight: '700' },
  label: { color: palette.slate, fontSize: 13, fontWeight: '600', marginTop: 8 }, input: { minHeight: 52, padding: 16, borderRadius: 10, backgroundColor: palette.paper, color: palette.ink, fontSize: 16 }, memo: { minHeight: 110, textAlignVertical: 'top' }, hint: { fontSize: 12, color: palette.smoke, marginTop: -4 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { padding: 12, backgroundColor: palette.paper, borderRadius: 10 }, optionText: { color: palette.ink, fontSize: 13 }, delete: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 16 }, deleteText: { color: palette.danger, fontSize: 14 }, notice: { padding: 14, borderRadius: 10, backgroundColor: palette.sky }, noticeText: { color: palette.ink, fontSize: 13 },
});
