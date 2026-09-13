import { useTripHeaderHeight } from './trip-header-context';
import { useDesktop } from '@/hooks/use-desktop';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/constants/design';

export function FloatingAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const desktop = useDesktop();
  const headerHeight = useTripHeaderHeight();
  const insets = useSafeAreaInsets();

  return (
    <View testID="page-add-action" pointerEvents="box-none" style={[styles.overlay, desktop && { top: Math.max(20, headerHeight - 64), bottom: undefined, height: 48 }]}>
      <View pointerEvents="box-none" style={[styles.rail, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.mark}>＋</Text>{desktop ? <Text style={{ color: palette.paper, fontSize: 14, fontWeight: '700' }}>{label.replace(/する$/, '')}</Text> : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  rail: { flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center', alignItems: 'flex-end', justifyContent: 'flex-end', paddingHorizontal: 20 },
  button: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean },
  mark: { color: palette.paper, fontSize: 30, lineHeight: 32, fontWeight: '500', marginTop: -2 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.94 }] },
});
