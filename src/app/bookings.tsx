import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const bookings = [
  { type: 'FLIGHT', icon: '✈', title: 'ANA 257便', detail: '羽田 → 福岡', meta: '9/14 10:30・確認番号 74K2' },
  { type: 'HOTEL', icon: '⌂', title: 'THE BASICS FUKUOKA', detail: '2泊・朝食なし', meta: 'チェックイン 9/14 15:00' },
  { type: 'CAR', icon: '◉', title: 'トヨタレンタカー 博多駅前', detail: 'ヤリス・禁煙', meta: '9/15 09:00 — 18:00' },
  { type: 'RESTAURANT', icon: '♨', title: '博多もつ鍋 やま中', detail: '2名・テーブル席', meta: '9/15 19:30' },
];

export default function BookingsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>すぐに見せられる</Text>
        <Text style={styles.title}>予約</Text>
        <Text style={styles.subtitle}>確認番号や時間を、旅行中でも迷わず確認</Text>
        {bookings.map((booking) => (
          <View key={booking.title} style={styles.card}>
            <View style={styles.iconBox}><Text style={styles.icon}>{booking.icon}</Text></View>
            <View style={styles.copy}>
              <Text style={styles.type}>{booking.type}</Text>
              <Text style={styles.cardTitle}>{booking.title}</Text>
              <Text style={styles.detail}>{booking.detail}</Text>
              <Text style={styles.meta}>{booking.meta}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F4EF' },
  content: { padding: 20, paddingBottom: 120 },
  eyebrow: { color: '#C65338', fontSize: 13, fontWeight: '800' },
  title: { color: '#20332C', fontSize: 31, fontWeight: '800', marginTop: 6, letterSpacing: -0.7 },
  subtitle: { color: '#777D78', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 24 },
  card: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, marginBottom: 14 },
  iconBox: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#ECE8DD', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  icon: { color: '#C65338', fontSize: 21, fontWeight: '800' },
  copy: { flex: 1 },
  type: { color: '#C65338', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  cardTitle: { color: '#20332C', fontSize: 16, fontWeight: '800', marginTop: 4 },
  detail: { color: '#5E675F', fontSize: 14, marginTop: 5 },
  meta: { color: '#8B918C', fontSize: 12, lineHeight: 18, marginTop: 9 },
});
