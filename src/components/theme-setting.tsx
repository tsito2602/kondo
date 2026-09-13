import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { darkPalette, lightPalette, type Palette } from '@/constants/design';
import { useAppTheme, useThemedStyles } from '@/theme/theme-provider';

const options = [
  { value: 'system', label: 'システム', icon: { ios: 'desktopcomputer', android: 'desktop_windows', web: 'desktop_windows' } },
  { value: 'light', label: 'ライト', icon: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' } },
  { value: 'dark', label: 'ダーク', icon: { ios: 'moon', android: 'dark_mode', web: 'dark_mode' } },
] as const;
export function ThemeSetting() {
  const { preference, setPreference, palette, storageError } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return <View style={{ gap: 12 }}><View accessibilityRole="radiogroup" accessibilityLabel="テーマ" style={styles.options}>
    {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} aria-checked={preference === option.value} onPress={() => setPreference(option.value)} style={[styles.option, preference === option.value && styles.selected]}>
      <View style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {(option.value === 'system' ? [lightPalette, darkPalette] : [option.value === 'dark' ? darkPalette : lightPalette]).map((sample, index) => <View key={index} style={{ flex: 1, backgroundColor: sample.canvas, padding: 8, gap: 6 }}>
          <View style={{ width: '65%', height: 5, borderRadius: 3, backgroundColor: sample.ocean }} />
          <View style={{ flex: 1, borderRadius: 5, backgroundColor: sample.paper, padding: 7, gap: 5 }}><View style={{ height: 16, borderRadius: 3, backgroundColor: sample.sky }} /><View style={{ height: 3, width: '70%', borderRadius: 2, backgroundColor: sample.ash }} /></View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: sample.paper }} />
        </View>)}
      </View>
      <View style={styles.caption}><SymbolView name={option.icon} size={18} tintColor={palette.ocean} /><Text style={styles.label}>{option.label}</Text></View>
      <View style={[styles.indicator, preference === option.value && { backgroundColor: palette.ocean, borderColor: palette.ocean }]}>{preference === option.value ? <Text style={{ color: palette.onOcean, fontSize: 12, fontWeight: '800' }}>✓</Text> : null}</View>
    </Pressable>)}
  </View>{storageError ? <Text accessibilityRole="alert" style={{ color: palette.danger, fontSize: 12 }}>{storageError}</Text> : null}</View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  options: { flexDirection: 'row', gap: 10 }, option: { flex: 1, minWidth: 0, padding: 8, gap: 12, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'transparent' }, selected: { backgroundColor: palette.soft, borderColor: palette.ocean },
  preview: { width: '100%', height: 84, flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: palette.ash }, caption: { alignItems: 'center', gap: 7 }, label: { fontSize: 12, fontWeight: '600', color: palette.ink },
  indicator: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: palette.ash, alignItems: 'center', justifyContent: 'center' },
});
