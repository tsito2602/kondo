import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, mono } from '@/constants/design';

import { useAuth } from './auth-provider';

export function AuthGate({ children }: PropsWithChildren) {
  const { configured, error, loading, signingIn, signIn, user, isDemo, startDemo } = useAuth();
  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={palette.ocean} size="large" />
      </SafeAreaView>
    );
  }
  if (user || isDemo) return children;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.ticketMark}><Text style={styles.ticketMarkText}>TABI / TRAVEL ORGANIZER</Text></View>
        <Text style={styles.title}>TABI</Text>
        <Text style={styles.body}>しおり、予約、旅の準備をひとつに。</Text>
        <Pressable
          accessibilityRole="button"
          disabled={signingIn || !configured}
          onPress={() => void signIn()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, (signingIn || !configured) && styles.disabled]}>
          {signingIn ? <ActivityIndicator color={palette.paper} /> : <Text style={styles.buttonText}>Googleで続ける</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={startDemo} style={styles.sampleButton}><Text style={styles.sampleText}>サンプルの旅行で試す</Text></Pressable>
        {!configured && <Text style={styles.note}>このプレビューではサンプルの旅行を利用できます</Text>}
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
  tagText: { color: palette.ink, fontFamily: mono, fontSize: 10, fontWeight: '400', letterSpacing: -0.2 },
  index: { color: palette.slate, fontFamily: mono, fontSize: 10 },
  ticketMark: { alignSelf: 'flex-start', borderBottomWidth: 1, borderStyle: 'dashed', borderColor: palette.ash, paddingBottom: 16, marginBottom: 24 },
  ticketMarkText: { color: palette.ocean, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  sampleButton: { minHeight: 56, justifyContent: 'center', alignItems: 'center', marginTop: 12, backgroundColor: palette.paper, borderRadius: 8 },
  sampleText: { color: palette.ocean, fontSize: 15, fontWeight: '700' },
  title: { color: palette.ink, fontSize: 72, lineHeight: 66, fontWeight: '900', letterSpacing: -3 },
  body: { maxWidth: 460, color: palette.slate, fontSize: 16, lineHeight: 24, marginTop: 24, marginBottom: 40 },
  button: { minHeight: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean },
  buttonText: { color: palette.paper, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.65 },
  note: { color: palette.slate, fontSize: 12, textAlign: 'center', marginTop: 14 },
  error: { color: palette.danger, fontSize: 13, textAlign: 'center', marginTop: 14 },
});
