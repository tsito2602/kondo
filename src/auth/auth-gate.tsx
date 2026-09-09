import { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from './auth-provider';

export function AuthGate({ children }: PropsWithChildren) {
  const { configured, error, loading, signingIn, signIn, user } = useAuth();
  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color="#2F5A4E" size="large" />
      </SafeAreaView>
    );
  }
  if (user) return children;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.mark}><Text style={styles.markText}>旅</Text></View>
        <Text style={styles.eyebrow}>tabi</Text>
        <Text style={styles.title}>ふたりの旅を、{`\n`}ひとつのしおりに。</Text>
        <Text style={styles.body}>予定も予約票も端末に保存。海外で通信がなくても確認できます。</Text>
        <Pressable
          accessibilityRole="button"
          disabled={signingIn}
          onPress={() => void signIn()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, signingIn && styles.disabled]}>
          {signingIn ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Googleで続ける</Text>}
        </Pressable>
        {!configured && <Text style={styles.note}>OAuth設定後にログインを利用できます</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F4EF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F4EF' },
  content: { flex: 1, justifyContent: 'center', padding: 28 },
  mark: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2F5A4E', marginBottom: 24 },
  markText: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  eyebrow: { color: '#C65338', fontSize: 14, fontWeight: '800', letterSpacing: 1.8, marginBottom: 10 },
  title: { color: '#20332C', fontSize: 34, lineHeight: 44, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: '#6E756F', fontSize: 15, lineHeight: 24, marginTop: 16, marginBottom: 36 },
  button: { minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2F5A4E' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.65 },
  note: { color: '#777D78', fontSize: 12, textAlign: 'center', marginTop: 14 },
  error: { color: '#B42318', fontSize: 13, textAlign: 'center', marginTop: 14 },
});
