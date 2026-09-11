import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/design';

import { useAuth } from './auth-provider';

export function AuthGate({ children }: PropsWithChildren) {
  const { configured, error, loading, signingIn, signIn, user } = useAuth();
  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={palette.ocean} size="large" />
      </SafeAreaView>
    );
  }
  if (user) return children;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.tag}><Text style={styles.tagText}>OFFLINE READY</Text></View>
          <Text style={styles.index}>TRAVEL TOOL / 01</Text>
        </View>
        <Text style={styles.title}>TABI</Text>
        <Text style={styles.body}>旅程・予約票・持ち物を共有し、通信がなくても確認できます。</Text>
        <Pressable
          accessibilityRole="button"
          disabled={signingIn}
          onPress={() => void signIn()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, signingIn && styles.disabled]}>
          {signingIn ? <ActivityIndicator color={palette.paper} /> : <Text style={styles.buttonText}>Googleで続ける →</Text>}
        </Pressable>
        {!configured && <Text style={styles.note}>OAuth設定後にログインを利用できます</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  tag: { backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 12, paddingVertical: 7 },
  tagText: { color: palette.ink, fontFamily: 'monospace', fontSize: 10, fontWeight: '400', letterSpacing: -0.2 },
  index: { color: palette.slate, fontFamily: 'monospace', fontSize: 10 },
  title: { color: palette.ink, fontSize: 72, lineHeight: 66, fontWeight: '900', letterSpacing: -3 },
  body: { maxWidth: 460, color: palette.slate, fontSize: 16, lineHeight: 24, marginTop: 24, marginBottom: 40 },
  button: { minHeight: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean },
  buttonText: { color: palette.paper, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.65 },
  note: { color: palette.slate, fontSize: 12, textAlign: 'center', marginTop: 14 },
  error: { color: palette.danger, fontSize: 13, textAlign: 'center', marginTop: 14 },
});
