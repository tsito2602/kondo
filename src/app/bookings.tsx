import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/design';

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
        <View style={styles.headingRow}>
          <View style={styles.tag}><Text style={styles.tagText}>DOCUMENTS</Text></View>
          <Text style={styles.counter}>{String(bookings.length).padStart(2, '0')} SAVED</Text>
        </View>
        <Text style={styles.title}>予約</Text>

        <View style={styles.ticketList}>
          {bookings.map((booking, index) => (
            <View key={booking.title} style={styles.ticket} accessibilityLabel={`${booking.title}、${booking.detail}、${booking.meta}`}>
              <View style={styles.copy}>
                <View style={styles.ticketTop}>
                  <View style={styles.typeTag}><Text style={styles.type}>{booking.type}</Text></View>
                  <Text style={styles.serial}>TABI/{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <Text style={styles.cardTitle}>{booking.title}</Text>
                <Text style={styles.detail}>{booking.detail}</Text>
                <Text style={styles.meta}>{booking.meta}</Text>
              </View>
              <View style={styles.stub}>
                <Text style={styles.icon}>{booking.icon}</Text>
                <Text style={styles.stubNo}>{String(index + 1).padStart(2, '0')}</Text>
                <Text style={styles.stubLabel}>PASS</Text>
              </View>
              <View style={[styles.notch, styles.notchTop]} />
              <View style={[styles.notch, styles.notchBottom]} />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingBottom: 120 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tag: { backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { color: palette.ink, fontFamily: 'monospace', fontSize: 10 },
  counter: { color: palette.slate, fontFamily: 'monospace', fontSize: 11 },
  title: { color: palette.ink, fontSize: 42, lineHeight: 42, fontWeight: '900', letterSpacing: -1.5, marginTop: 8 },
  ticketList: { gap: 16, marginTop: 24 },
  ticket: { minHeight: 174, flexDirection: 'row', position: 'relative', overflow: 'hidden', borderRadius: 28, backgroundColor: palette.paper },
  copy: { flex: 1, minWidth: 0, padding: 20 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  typeTag: { alignSelf: 'flex-start', backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 10, paddingVertical: 5 },
  type: { color: palette.ink, fontFamily: 'monospace', fontSize: 9, fontWeight: '400', letterSpacing: 0.8 },
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
});
