import { router, usePathname } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TripEditor } from './trip-editor';
import { DeleteTripDialog } from './delete-trip-dialog';
import { SyncStatus } from './sync-status';
import { useOfflineTrip } from './offline-trip';
import { useToast } from './toast';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

const tabs = [
  { key: 'itinerary', label: 'しおり' },
  { key: 'places', label: '行きたい場所' },
  { key: 'packing', label: '準備' },
  { key: 'bookings', label: '予約' },
] as const;

export function TripTopTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const managing = pathname.endsWith('/members');
  const { selectedTrip, deleteTrip } = useTravel();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const offline = useOfflineTrip();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const canEdit = selectedTrip?.role !== 'viewer';
  const remove = async () => {
    if (deleting) return;
    setDeleting(true); setDeleteError('');
    try { await deleteTrip(tripId); setConfirmDelete(false); router.replace('/'); toast('旅行を削除しました'); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : '削除できませんでした'); }
    finally { setDeleting(false); }
  };
  return <View testID="trip-header" style={styles.shell}>
    <View style={styles.inner}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={managing ? 'しおりへ戻る' : '旅行一覧へ戻る'} onPress={() => managing ? router.replace({ pathname: '/trips/[tripId]/itinerary', params: { tripId } }) : router.replace('/')} style={styles.backButton}><Text style={styles.backMark}>‹</Text></Pressable>
        <View style={styles.title}><Text numberOfLines={1} style={styles.tripName}>{managing ? 'メンバー' : selectedTrip?.name}</Text><Text style={styles.tripDates}>{managing ? selectedTrip?.name : `${selectedTrip?.startsOn.replaceAll('-', '.')} — ${selectedTrip?.endsOn.replaceAll('-', '.')}`}</Text></View>
        {!managing ? <Pressable accessibilityRole="button" accessibilityLabel="メンバーを管理" onPress={() => router.push({ pathname: '/trips/[tripId]/members', params: { tripId } })} style={styles.membersButton}><SymbolView name={{ ios: 'person.2', android: 'group', web: 'group' }} size={23} tintColor={palette.ocean} /></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="旅行メニュー" onPress={() => setMenu(true)} style={styles.menuButton}><Text style={styles.menuMark}>⋯</Text></Pressable>
      </View>
      {!managing ? <>
        <SyncStatus />
        <View accessibilityRole="tablist" style={styles.tabs}>{tabs.map((tab) => {
          const selected = pathname.endsWith(`/${tab.key}`);
          return <Pressable accessibilityRole="tab" aria-selected={selected} key={tab.key} onPress={() => router.replace({ pathname: `/trips/[tripId]/${tab.key}`, params: { tripId } })} style={[styles.tab, selected && styles.tabSelected]}><Text style={[styles.tabText, selected && styles.tabTextSelected]}>{tab.label}</Text></Pressable>;
        })}</View>
      </> : null}
      {offline.busy ? <Text style={styles.progress}>{offline.progress}</Text> : null}
    </View>
    <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
      <View style={styles.menuOverlay}>
        <Pressable accessibilityLabel="メニューを閉じる" onPress={() => setMenu(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.menuPosition, { top: insets.top + 58 }]} pointerEvents="box-none">
          <View testID="trip-menu" style={styles.menu}>
            {canEdit ? <Pressable accessibilityRole="button" onPress={() => { setMenu(false); setEditing(true); }} style={styles.menuRow}><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={19} tintColor={palette.ocean} /><Text style={styles.menuText}>旅行を編集</Text></Pressable> : null}
            {Platform.OS === 'web' ? <Pressable accessibilityRole="button" disabled={offline.busy} onPress={() => { setMenu(false); void offline.save(); }} style={styles.menuRow}><SymbolView name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }} size={19} tintColor={palette.ocean} /><Text style={styles.menuText}>{offline.busy ? offline.progress : 'オフライン保存'}</Text></Pressable> : null}
            {selectedTrip?.role === 'owner' ? <Pressable accessibilityRole="button" onPress={() => { setMenu(false); setDeleteError(''); setConfirmDelete(true); }} style={[styles.menuRow, styles.deleteRow]}><SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={19} tintColor={palette.danger} /><Text style={[styles.menuText, { color: palette.danger }]}>旅行を削除</Text></Pressable> : null}
          </View>
        </View>
      </View>
    </Modal>
    {editing && selectedTrip ? <TripEditor trip={selectedTrip} onClose={() => setEditing(false)} /> : null}
    <DeleteTripDialog visible={confirmDelete} name={selectedTrip?.name ?? ''} busy={deleting} error={deleteError} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />
  </View>;
}
const styles = StyleSheet.create({
  shell: { width: '100%', backgroundColor: Platform.OS === 'web' ? 'rgba(238,242,244,0.66)' : 'rgba(238,242,244,0.92)' },
  inner: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  topRow: { minHeight: 64, justifyContent: 'center', position: 'relative' },
  backButton: { position: 'absolute', left: 0, width: 40, height: 48, justifyContent: 'center' },
  backMark: { color: palette.ocean, fontSize: 32, lineHeight: 36 },
  title: { marginLeft: 42, marginRight: 88, minHeight: 60, justifyContent: 'center' },
  tripName: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  tripDates: { color: palette.slate, fontSize: 10, marginTop: 4 },
  membersButton: { position: 'absolute', right: 42, width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuButton: { position: 'absolute', right: 0, width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuMark: { color: palette.ocean, fontSize: 26, fontWeight: '800' },
  tabs: { minHeight: 52, flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: palette.paper },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabSelected: { backgroundColor: palette.sky },
  tabText: { color: palette.slate, fontSize: 12, lineHeight: 20, fontWeight: '700' },
  tabTextSelected: { color: palette.ink, fontWeight: '900' },
  progress: { color: palette.ocean, fontSize: 11, paddingTop: 8, textAlign: 'right' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(18,35,45,0.16)' },
  menuPosition: { position: 'absolute', width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, alignItems: 'flex-end' },
  menu: { width: 236, borderRadius: 18, padding: 6, backgroundColor: palette.paper },
  menuRow: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12 },
  menuText: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  deleteRow: { borderRadius: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.ash },
});
