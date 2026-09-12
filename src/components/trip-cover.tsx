import { Image, StyleSheet, Text, View } from 'react-native';
import { palette } from '@/constants/design';

export function TripCover({ image, compact = false }: { image?: string; compact?: boolean }) {
  return <View style={[styles.cover, compact && styles.compact]}>
    {image ? <Image source={{ uri: image }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : <>
      <View style={styles.sun} /><View style={styles.hillBack} /><View style={styles.hillFront} />
      <Text style={styles.mark}>TABI</Text>
      <View style={styles.route}><View style={styles.dot} /><View style={styles.line} /><Text style={styles.arrow}>↗</Text></View>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  cover: { height: 210, backgroundColor: '#C9D9DF', overflow: 'hidden', borderRadius: 22 }, compact: { height: 160, borderRadius: 0 },
  sun: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F2E7D5', position: 'absolute', top: 26, right: '24%' },
  hillBack: { width: '105%', height: 180, backgroundColor: '#92ADB7', borderRadius: 150, position: 'absolute', left: '-20%', top: 90, transform: [{ rotate: '14deg' }] },
  hillFront: { width: '120%', height: 160, backgroundColor: '#557984', borderRadius: 150, position: 'absolute', right: '-35%', top: 122, transform: [{ rotate: '-20deg' }] },
  mark: { position: 'absolute', top: 22, left: 22, fontSize: 11, fontWeight: '700', letterSpacing: 4, color: palette.ink },
  route: { position: 'absolute', bottom: 22, left: 22, flexDirection: 'row', alignItems: 'center', width: 100, gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F2E7D5' }, line: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#F2E7D5' }, arrow: { color: '#F2E7D5', fontSize: 22 },
});
