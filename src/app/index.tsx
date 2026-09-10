import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const itinerary = [
  { time: '10:30', title: '羽田空港を出発', detail: '第2ターミナル・保安検査は9:45まで' },
  { time: '12:05', title: '福岡空港に到着', detail: '地下鉄で博多へ' },
  { time: '13:30', title: '博多でランチ', detail: '博多一双 本店' },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>次の旅まであと18日</Text>
            <Text style={styles.title}>福岡、ふたり旅</Text>
            <Text style={styles.date}>9月14日 — 9月16日・2泊3日</Text>
          </View>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, styles.avatarFirst]}><Text style={styles.avatarText}>つ</Text></View>
            <View style={[styles.avatar, styles.avatarSecond]}><Text style={styles.avatarText}>み</Text></View>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>DAY 1 · 9月14日</Text>
          <Text style={styles.heroTitle}>福岡へ出発</Text>
          <Text style={styles.heroBody}>羽田 10:30 → 福岡 12:05</Text>
          <View style={styles.weatherRow}>
            <Text style={styles.weather}>☀︎ 28°</Text>
            <Text style={styles.weatherNote}>歩きやすい靴がおすすめ</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>今日の予定</Text>
          <Text style={styles.sectionLink}>すべて見る</Text>
        </View>
        <View style={styles.timelineCard}>
          {itinerary.map((item, index) => (
            <View key={item.time} style={styles.timelineRow}>
              <Text style={styles.time}>{item.time}</Text>
              <View style={styles.timelineRail}>
                <View style={styles.dot} />
                {index < itinerary.length - 1 && <View style={styles.line} />}
              </View>
              <View style={styles.timelineCopy}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.quickRow}>
          <Pressable onPress={() => router.push('/packing')} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
            <Text style={styles.quickIcon}>✓</Text>
            <Text style={styles.quickValue}>3件</Text>
            <Text style={styles.quickLabel}>準備が必要</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/bookings')} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
            <Text style={styles.quickIcon}>⌁</Text>
            <Text style={styles.quickValue}>4件</Text>
            <Text style={styles.quickLabel}>予約済み</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F4EF' },
  content: { padding: 20, paddingBottom: 120, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: '#C65338', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  title: { color: '#20332C', fontSize: 29, lineHeight: 35, fontWeight: '800', letterSpacing: -0.7 },
  date: { color: '#6E756F', fontSize: 14, marginTop: 6 },
  avatarRow: { flexDirection: 'row', paddingTop: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#F6F4EF' },
  avatarFirst: { backgroundColor: '#355E52' },
  avatarSecond: { backgroundColor: '#D17A5B', marginLeft: -10 },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  heroCard: { backgroundColor: '#2F5A4E', borderRadius: 26, padding: 22, minHeight: 190, justifyContent: 'flex-end', shadowColor: '#19372F', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  heroLabel: { color: '#D3E4DD', fontSize: 12, fontWeight: '800', letterSpacing: 1.1 },
  heroTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 8 },
  heroBody: { color: '#E7F0EC', fontSize: 15, marginTop: 5 },
  weatherRow: { flexDirection: 'row', gap: 12, marginTop: 20, alignItems: 'center' },
  weather: { color: '#20332C', backgroundColor: '#F3D79D', overflow: 'hidden', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, fontWeight: '800' },
  weatherNote: { color: '#D3E4DD', fontSize: 13 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { color: '#20332C', fontSize: 20, fontWeight: '800' },
  sectionLink: { color: '#C65338', fontSize: 13, fontWeight: '700' },
  timelineCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, gap: 2 },
  timelineRow: { minHeight: 72, flexDirection: 'row' },
  time: { width: 52, color: '#6E756F', fontSize: 13, fontWeight: '700', paddingTop: 1 },
  timelineRail: { width: 22, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D56B4B', marginTop: 3 },
  line: { width: 2, flex: 1, backgroundColor: '#E6E3DC', marginVertical: 4 },
  timelineCopy: { flex: 1, paddingBottom: 18 },
  itemTitle: { color: '#20332C', fontSize: 15, fontWeight: '800' },
  itemDetail: { color: '#777D78', fontSize: 13, lineHeight: 19, marginTop: 3 },
  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: { flex: 1, backgroundColor: '#ECE8DD', borderRadius: 20, padding: 17 },
  quickIcon: { color: '#C65338', fontSize: 20, fontWeight: '800' },
  quickValue: { color: '#20332C', fontSize: 18, fontWeight: '800', marginTop: 13 },
  quickLabel: { color: '#777D78', fontSize: 13, marginTop: 2 },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
});
