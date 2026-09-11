import { router, usePathname } from 'expo-router';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

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

  const shareInvite = async () => {
    try {
      const url = await createInvite();
      await Share.share({ message: `tabiで旅程を一緒に編集しよう\n${url}`, url });
    } catch (cause) {
      Alert.alert('招待リンクを作れませんでした', cause instanceof Error ? cause.message : 'オンラインで再度お試しください。');
    }
  };

  return (
    <View style={styles.shell}>
      <View style={styles.topRow}>
        <Pressable accessibilityLabel="旅行一覧へ戻る" hitSlop={8} onPress={() => router.replace('/')} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backMark}>‹</Text>
          <Text style={styles.backText}>旅行一覧</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.tripName}>{selectedTrip?.name}</Text>
        <Pressable accessibilityLabel="この旅行に招待する" hitSlop={8} onPress={() => void shareInvite()} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
          <Text style={styles.shareMark}>↗</Text>
        </Pressable>
      </View>

      <View accessibilityRole="tablist" style={styles.tabs}>
        {tabs.map((tab) => {
          const selected = pathname.endsWith(`/${tab.key}`);
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
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
  topRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { minWidth: 92, minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  backMark: { color: palette.ocean, fontSize: 32, lineHeight: 34, marginRight: 3, marginTop: -2 },
  backText: { color: palette.ocean, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  tripName: { flex: 1, color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800', textAlign: 'center' },
  shareButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
  shareMark: { color: palette.ocean, fontSize: 21, lineHeight: 23, fontWeight: '800' },
  tabs: { minHeight: 52, flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: palette.paper },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  tabSelected: { backgroundColor: palette.sky },
  tabText: { color: palette.slate, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  tabTextSelected: { color: palette.ink, fontWeight: '900' },
  pressed: { opacity: 0.58 },
});
