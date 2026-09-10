import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripTicket } from '@/components/trip-ticket';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

const today = new Date().toISOString().slice(0, 10);

export default function HomeScreen() {
  const { invite } = useLocalSearchParams<{ invite?: string | string[] }>();
  const { trips, selectedTrip, selectTrip, createTrip, createInvite, acceptInvite, ready, syncing, pendingCount, error } = useTravel();
  const acceptingInvite = useRef(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);

  useEffect(() => {
    const token = Array.isArray(invite) ? invite[0] : invite;
    if (!ready || !token || acceptingInvite.current) return;

    acceptingInvite.current = true;
    void acceptInvite(token)
      .then(() => Alert.alert('旅行に参加しました', '旅程がこの端末にも同期されました。'))
      .catch((cause) => Alert.alert('旅行に参加できませんでした', cause instanceof Error ? cause.message : '招待リンクを確認してください。'))
      .finally(() => router.replace('/'));
  }, [acceptInvite, invite, ready]);

  const save = () => {
    if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || startsOn > endsOn) {
      Alert.alert('入力を確認してください', '旅行名と正しい日付を入力してください。');
      return;
    }
    createTrip({ name: name.trim(), destination: destination.trim(), startsOn, endsOn });
    setCreating(false);
    setName('');
    setDestination('');
  };

  const shareInvite = async () => {
    try {
      const url = await createInvite();
      await Share.share({ message: `tabiで旅程を一緒に編集しよう\n${url}`, url });
    } catch (cause) {
      Alert.alert('招待リンクを作れませんでした', cause instanceof Error ? cause.message : 'オンラインで再度お試しください。');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>tabi</Text>
            <Text style={styles.sync}>{syncing ? '同期中…' : pendingCount ? `${pendingCount}件を同期待ち` : '同期済み'}</Text>
          </View>
          <Pressable onPress={() => setCreating(true)} style={styles.addButton}><Text style={styles.addButtonText}>＋ 旅行</Text></Pressable>
        </View>

        {error ? <Text style={styles.error}>オフラインで表示中 · {error}</Text> : null}

        {!selectedTrip ? (
          <View style={styles.empty}>
            <Text style={styles.emptyMark}>⌁</Text>
            <Text style={styles.emptyTitle}>最初の旅行を作成</Text>
            <Text style={styles.emptyBody}>予定は端末に保存され、通信が戻ると自動で同期されます。</Text>
            <Pressable onPress={() => setCreating(true)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>旅行を作る</Text></Pressable>
          </View>
        ) : (
          <>
            {trips.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripTabs}>
                {trips.map((trip) => (
                  <Pressable key={trip.id} onPress={() => selectTrip(trip.id)} style={[styles.tripTab, trip.id === selectedTrip.id && styles.tripTabActive]}>
                    <Text style={[styles.tripTabText, trip.id === selectedTrip.id && styles.tripTabTextActive]}>{trip.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <TripTicket trip={selectedTrip} />

            <View style={styles.actionRow}>
              <Pressable onPress={() => router.push('/itinerary')} style={styles.actionCard}>
                <Text style={styles.actionIcon}>≡</Text><Text style={styles.actionTitle}>旅程を編集</Text>
              </Pressable>
              <Pressable onPress={() => void shareInvite()} style={styles.actionCard}>
                <Text style={styles.actionIcon}>↗</Text><Text style={styles.actionTitle}>一緒に編集</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={creating} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCreating(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setCreating(false)}><Text style={styles.cancel}>キャンセル</Text></Pressable>
            <Text style={styles.modalTitle}>新しい旅行</Text>
            <Pressable onPress={save}><Text style={styles.save}>保存</Text></Pressable>
          </View>
          <View style={styles.form}>
            <Text style={styles.label}>旅行名</Text>
            <TextInput value={name} onChangeText={setName} placeholder="ローマ旅行" style={styles.input} autoFocus />
            <Text style={styles.label}>行き先</Text>
            <TextInput value={destination} onChangeText={setDestination} placeholder="Rome, Italy" style={styles.input} />
            <View style={styles.dateRow}>
              <View style={styles.dateField}><Text style={styles.label}>出発日</Text><TextInput value={startsOn} onChangeText={setStartsOn} placeholder="2026-11-21" style={styles.input} /></View>
              <View style={styles.dateField}><Text style={styles.label}>帰着日</Text><TextInput value={endsOn} onChangeText={setEndsOn} placeholder="2026-11-28" style={styles.input} /></View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingBottom: 120, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: palette.ink, fontSize: 40, lineHeight: 40, fontWeight: '900', letterSpacing: -1.8 },
  sync: { color: palette.slate, fontFamily: 'monospace', fontSize: 11, lineHeight: 16, marginTop: 3 },
  addButton: { minHeight: 44, backgroundColor: palette.ocean, borderRadius: 8, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: palette.paper, fontWeight: '700' },
  error: { color: palette.danger, fontSize: 12 },
  empty: { minHeight: 440, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyMark: { color: palette.coral, fontSize: 48, fontWeight: '900' },
  emptyTitle: { color: palette.ink, fontSize: 28, lineHeight: 30, fontWeight: '900', letterSpacing: -0.9, marginTop: 18 },
  emptyBody: { color: palette.slate, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  primaryButton: { backgroundColor: palette.ocean, paddingHorizontal: 24, paddingVertical: 15, borderRadius: 8, marginTop: 22 },
  primaryButtonText: { color: palette.paper, fontWeight: '700' },
  tripTabs: { gap: 8 },
  tripTab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 64, backgroundColor: palette.mist },
  tripTabActive: { backgroundColor: palette.sky },
  tripTabText: { color: palette.slate, fontWeight: '500' },
  tripTabTextActive: { color: palette.ink, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionCard: { flex: 1, backgroundColor: palette.paper, borderRadius: 28, padding: 20, minHeight: 120, justifyContent: 'space-between' },
  actionIcon: { color: palette.ocean, fontSize: 28, lineHeight: 30, fontWeight: '900' },
  actionTitle: { color: palette.ink, fontSize: 16, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: palette.canvas },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  cancel: { color: palette.slate },
  modalTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  save: { color: palette.ocean, fontWeight: '700' },
  form: { padding: 20, gap: 9 },
  label: { color: palette.slate, fontFamily: 'monospace', fontSize: 11, fontWeight: '400', marginTop: 10 },
  input: { minHeight: 50, backgroundColor: palette.paper, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14, color: palette.ink, fontSize: 16 },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateField: { flex: 1 },
});
