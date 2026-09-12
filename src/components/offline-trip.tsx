import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTravel } from '@/data/travel-provider';
import { palette } from '@/constants/design';

export function OfflineTrip() {
  const { saveTripOffline, selectedTrip } = useTravel();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      if (Platform.OS === 'web') {
        if (!('serviceWorker' in navigator)) throw new Error('このブラウザーではオフライン起動に対応していません');
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration?.active) throw new Error('起動の準備中です。少し待ってもう一度お試しください');
      }
      const count = await saveTripOffline((done, total) => setMessage(`書類を保存中 ${done} / ${total}`));
      if (Platform.OS === 'web') await navigator.storage?.persist?.();
      setMessage(count ? `しおり・場所・書類${count}件を端末に保存しました` : 'しおり・予約・場所・準備を端末に保存しました');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '保存できませんでした。オンラインで再度お試しください'); }
    finally { setBusy(false); }
  };
  if (!selectedTrip || Platform.OS !== 'web') return null;
  return <View style={styles.row}><Pressable disabled={busy} onPress={() => void save()} style={styles.button}><Text style={styles.text}>{busy ? '保存中…' : '↓ オフライン保存'}</Text></Pressable>{message ? <Text style={styles.message}>{message}</Text> : null}</View>;
}
const styles = StyleSheet.create({ row: { marginBottom: 16, gap: 8 }, button: { alignSelf: 'flex-end', minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: palette.sky, justifyContent: 'center' }, text: { fontSize: 12, fontWeight: '600', color: palette.ocean }, message: { fontSize: 12, color: palette.slate, lineHeight: 20 } });
