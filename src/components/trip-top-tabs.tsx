import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Platform, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { TripEditor } from './trip-editor';
import { SyncStatus } from './sync-status';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

const tabs = [
  { key: 'itinerary', label: 'しおり' },
  { key: 'packing', label: '準備' },
  { key: 'bookings', label: '予約' },
] as const;

export function TripTopTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const { createInvite, selectedTrip } = useTravel();
  const { isDemo } = useAuth();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const shareInvite = async () => {
    if (sharing || isDemo) return;
    setSharing(true);
    try {
      const url = await createInvite();
      await Share.share({ message: `tabiで旅程を一緒に編集しよう\n${url}`, url });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'オンラインで再度お試しください';
      if (Platform.OS === 'web') globalThis.alert(message); else Alert.alert('招待リンクを作れませんでした', message);
    } finally { setSharing(false); }
  };

  return (
    <View style={styles.shell}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="旅行一覧へ戻る" hitSlop={8} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backMark}>‹</Text>

        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="旅行名と日程を編集" onPress={() => setEditing(true)} style={styles.titleButton}><Text numberOfLines={2} style={styles.tripName}>{selectedTrip?.name}</Text><Text style={styles.tripDates}>{selectedTrip?.startsOn.replaceAll('-', '.')} — {selectedTrip?.endsOn.replaceAll('-', '.')}</Text></Pressable>
        {!isDemo ? <Pressable accessibilityRole="button" disabled={sharing} accessibilityLabel="この旅行に招待する" hitSlop={8} onPress={() => void shareInvite()} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
          <Text style={styles.shareMark}>{sharing ? '…' : '↗'}</Text>
        </Pressable> : null}
      </View>

      <SyncStatus />
      {editing && selectedTrip ? <TripEditor trip={selectedTrip} onClose={() => setEditing(false)} /> : null}
      <View accessibilityRole="tablist" style={styles.tabs}>
        {tabs.map((tab) => {
          const selected = pathname.endsWith(`/${tab.key}`);
          return (
            <Pressable
              accessibilityRole="tab"
              aria-selected={selected}
              key={tab.key}
              onPress={() => router.replace({ pathname: `/trips/[tripId]/${tab.key}`, params: { tripId } })}
              style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}>
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, backgroundColor: palette.canvas },
  topRow: { minHeight: 64, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  backButton: { position: 'absolute', left: 0, zIndex: 2, minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  backMark: { color: palette.ocean, fontSize: 32, lineHeight: 34, marginRight: 3, marginTop: -2 },
  backText: { color: palette.ocean, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  titleButton: { minHeight: 60, marginHorizontal: 52, alignItems: 'center', justifyContent: 'center' },
  tripDates: { color: palette.slate, fontSize: 10, marginTop: 4 },
  tripName: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800', textAlign: 'center' },
  shareButton: { position: 'absolute', right: 0, zIndex: 2, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
  shareMark: { color: palette.ocean, fontSize: 21, lineHeight: 23, fontWeight: '800' },
  tabs: { minHeight: 52, flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: palette.paper },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabSelected: { backgroundColor: palette.sky },
  tabText: { color: palette.slate, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  tabTextSelected: { color: palette.ink, fontWeight: '900' },
  pressed: { opacity: 0.58 },
});
