import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const days = [
  { day: '1', date: '9/14', title: '福岡に到着', items: ['10:30　羽田空港を出発', '13:30　博多でランチ', '16:00　ホテルにチェックイン', '19:00　中洲で屋台めぐり'] },
  { day: '2', date: '9/15', title: '糸島ドライブ', items: ['09:00　博多駅でレンタカー', '10:30　桜井二見ヶ浦', '12:00　海辺でランチ', '17:30　博多に戻る'] },
  { day: '3', date: '9/16', title: '太宰府と帰宅', items: ['09:30　太宰府天満宮', '12:30　福岡空港へ', '15:10　福岡空港を出発'] },
];

export default function ItineraryScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>福岡、ふたり旅</Text>
        <Text style={styles.title}>旅の日程</Text>
        <Text style={styles.subtitle}>予定を詰めすぎず、余白も楽しむ3日間</Text>
        {days.map((day) => (
          <View key={day.day} style={styles.dayCard}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayLabel}>DAY</Text>
              <Text style={styles.dayNumber}>{day.day}</Text>
            </View>
            <View style={styles.dayContent}>
              <Text style={styles.date}>{day.date}</Text>
              <Text style={styles.dayTitle}>{day.title}</Text>
              <View style={styles.items}>
                {day.items.map((item) => <Text key={item} style={styles.item}>{item}</Text>)}
              </View>
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
  dayCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, marginBottom: 14 },
  dayBadge: { width: 54, height: 64, borderRadius: 16, backgroundColor: '#2F5A4E', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  dayLabel: { color: '#BFD3CB', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  dayNumber: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  dayContent: { flex: 1 },
  date: { color: '#C65338', fontSize: 12, fontWeight: '800' },
  dayTitle: { color: '#20332C', fontSize: 18, fontWeight: '800', marginTop: 3 },
  items: { gap: 8, marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#ECE9E2' },
  item: { color: '#606861', fontSize: 14, lineHeight: 20 },
});
