import { useRef, useState } from 'react';
import { useTravel } from '@/data/travel-provider';
import { useToast } from '@/components/toast';
import { useUiPlatform } from '@/ui/platform';

export function useOfflineTrip() {
  const { saveTripOffline } = useTravel();
  const toast = useToast();
  const platform = useUiPlatform();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const save = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setProgress('保存中…');
    try {
      await platform.ensureOfflineReady();
      const count = await saveTripOffline((done, total) => setProgress(`書類を保存中 ${done} / ${total}`));
      await platform.persistStorage();
      toast(count ? `旅行と書類${count}件をオフライン保存しました` : '旅行をオフライン保存しました');
    } catch (cause) { toast(cause instanceof Error ? cause.message : '保存できませんでした。オンラインで再度お試しください'); }
    finally { busyRef.current = false; setBusy(false); setProgress(''); }
  };
  return { save, busy, progress };
}
