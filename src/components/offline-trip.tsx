import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useTravel } from '@/data/travel-provider';
import { useToast } from './toast';

export function useOfflineTrip() {
  const { saveTripOffline } = useTravel();
  const toast = useToast();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const save = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setProgress('保存中…');
    try {
      if (Platform.OS === 'web') {
        if (!('serviceWorker' in navigator)) throw new Error('このブラウザーではオフライン起動に対応していません');
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration?.active) throw new Error('起動の準備中です。少し待ってもう一度お試しください');
      }
      const count = await saveTripOffline((done, total) => setProgress(`書類を保存中 ${done} / ${total}`));
      if (Platform.OS === 'web') await navigator.storage?.persist?.().catch(() => false);
      toast(count ? `旅行と書類${count}件をオフライン保存しました` : '旅行をオフライン保存しました');
    } catch (cause) { toast(cause instanceof Error ? cause.message : '保存できませんでした。オンラインで再度お試しください'); }
    finally { busyRef.current = false; setBusy(false); setProgress(''); }
  };
  return { save, busy, progress };
}
