import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { type Palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

export function SyncStatus() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const { isDemo } = useAuth();
  const { ready, syncing, pendingCount, error, sync } = useTravel();
  const label = !ready ? '読み込み中' : isDemo ? 'サンプル · この端末に保存' : syncing ? '同期中' : pendingCount ? `${pendingCount}件を同期待ち` : error ? '同期を確認してください' : '同期済み';
  return <View style={styles.row}>
    {syncing && !isDemo ? <ActivityIndicator size="small" color={palette.ocean} /> : <View style={[styles.dot, Boolean(error || pendingCount) && styles.pendingDot]} />}
    <Text accessibilityLiveRegion="polite" style={styles.text}>{label}</Text>
    {error && !isDemo ? <Pressable accessibilityRole="button" onPress={() => void sync()} style={styles.retry}><Text style={styles.retryText}>再試行</Text></Pressable> : null}
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({ row: { minHeight: 28, flexDirection: 'row', gap: 7, alignItems: 'center' }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.ocean }, pendingDot: { backgroundColor: palette.slate }, text: { color: palette.slate, fontSize: 11 }, retry: { paddingHorizontal: 10, minHeight: 44, justifyContent: 'center' }, retryText: { color: palette.actionText, fontSize: 12, fontWeight: '700' } });
