import { SymbolView } from 'expo-symbols';
import { useThemedStyles } from '@/theme/theme-provider';
import { Image, StyleSheet, Text, View } from 'react-native';
import { type Palette } from '@/constants/design';

export function TripCover({ image, compact = false, fill = false }: { image?: string; compact?: boolean; fill?: boolean }) {
  const styles = useThemedStyles(createStyles);

  return <View style={[styles.cover, compact && styles.compact, fill && styles.fill]}>
    {image ? <Image source={{ uri: image }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : <>
      <View style={styles.sun} /><View style={styles.hillBack} /><View style={styles.hillFront} />
      <Text style={styles.mark}>TABI</Text>
      <View style={styles.route}><View style={styles.dot} /><View style={styles.line} /><SymbolView name={{ ios: 'mappin.circle.fill', android: 'location_on', web: 'location_on' }} size={22} tintColor="#FFFFFF" /></View>
    </>}
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  cover: { height: 210, backgroundColor: palette.mist, overflow: 'hidden', borderRadius: 22 }, compact: { height: 160, borderRadius: 0 },
  fill: { ...StyleSheet.absoluteFill, height: '100%', borderRadius: 0 },
  sun: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', position: 'absolute', top: 26, right: '24%' },
  hillBack: { width: '105%', height: 180, backgroundColor: palette.ash, borderRadius: 150, position: 'absolute', left: '-20%', top: 90, transform: [{ rotate: '14deg' }] },
  hillFront: { width: '120%', height: 160, backgroundColor: '#525252', borderRadius: 150, position: 'absolute', right: '-35%', top: 122, transform: [{ rotate: '-20deg' }] },
  mark: { position: 'absolute', top: 22, left: 22, fontSize: 11, fontWeight: '700', letterSpacing: 4, color: palette.ink },
  route: { position: 'absolute', bottom: 22, left: 22, flexDirection: 'row', alignItems: 'center', width: 100, gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }, line: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#FFFFFF' },
});
