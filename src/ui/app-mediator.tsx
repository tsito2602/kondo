import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, type Href } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { type PropsWithChildren, useEffect, useMemo } from 'react';
import { Alert, Linking, Platform, Share } from 'react-native';

import { useAuth as useAuthService } from '../auth/auth-provider';
import { useToast as useToastService } from '../components/toast';
import { useAppTheme as useThemeService } from '../theme/theme-provider';
import { confirmDeletion as confirmDeletionService } from '../utils/confirm-deletion';
import { UiBoundary, type UiEvent, type UiEffects, UiMediatorProvider } from './mediator';
import type { SharePayload, UiDownloadFile, UiOpenDocument, UiPickedFile } from './platform';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let pwaPromptEvent: InstallEvent | null = null;

function args<T extends readonly unknown[]>(event: UiEvent): T {
  return (event.payload ?? []) as unknown as T;
}

export function AppMediator({ children }: PropsWithChildren) {
  const auth = useAuthService();
  const theme = useThemeService();
  const toast = useToastService();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const pressSpace = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== ' ' || !(target instanceof HTMLElement) || !target.matches('[role="checkbox"], [role="radio"], [role="tab"]') || ['INPUT', 'BUTTON'].includes(target.tagName)) return;
      event.preventDefault();
      if (!event.repeat && target.getAttribute('aria-disabled') !== 'true' && !target.hasAttribute('disabled')) target.click();
    };
    window.addEventListener('keydown', pressSpace);
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('keydown', pressSpace);
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      pwaPromptEvent = event as InstallEvent;
    };
    const update = () => {
      if (document.visibilityState === 'visible') void navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => undefined);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const effects = useMemo<UiEffects>(() => ({
    'auth.startDemo': () => auth.startDemo(),
    'auth.exitDemo': () => auth.exitDemo(),
    'auth.signIn': () => auth.signIn(),
    'auth.signOut': () => auth.signOut(),
    'auth.updateProfile': (event) => auth.updateProfile(...args<Parameters<typeof auth.updateProfile>>(event)),
    'auth.request': (event) => {
      const [path, init] = args<[string, RequestInit | undefined]>(event);
      return auth.request(path, init);
    },
    'auth.requestRaw': (event) => auth.requestRaw(...args<Parameters<typeof auth.requestRaw>>(event)),
    'theme.setPreference': (event) => theme.setPreference(...args<Parameters<typeof theme.setPreference>>(event)),
    'toast.show': (event) => toast(...args<Parameters<typeof toast>>(event)),
    'navigation.push': (event) => router.push(...args<[Href]>(event)),
    'navigation.replace': (event) => router.replace(...args<[Href]>(event)),
    'navigation.setParams': (event) => {
      const [params] = args<[Record<string, string | undefined>]>(event);
      router.setParams(params as never);
    },
    'navigation.backOrReplace': (event) => {
      const [fallback] = args<[Href]>(event);
      if (router.canGoBack()) router.back();
      else router.replace(fallback);
    },
    'platform.openURL': (event) => Linking.openURL(...args<[string]>(event)),
    'platform.share': (event) => Share.share(...args<[SharePayload]>(event)),
    'platform.copyText': (event) => Clipboard.setStringAsync(...args<[string]>(event)),
    'platform.uuid': () => Crypto.randomUUID(),
    'platform.pickDocuments': async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return null;
      return result.assets.map<UiPickedFile>((asset) => ({
        name: asset.name,
        type: asset.mimeType ?? '',
        size: asset.size ?? asset.file?.size ?? 1,
        arrayBuffer: () => asset.file ? asset.file.arrayBuffer() : new File(asset.uri).arrayBuffer(),
      }));
    },
    'platform.downloadFile': (event) => {
      const [file] = args<[UiDownloadFile]>(event);
      if (Platform.OS !== 'web') throw new Error('この端末ではブラウザ保存を利用できません');
      const url = URL.createObjectURL(new Blob([file.bytes], { type: file.contentType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    'platform.openDocument': async (event) => {
      const [entry] = args<[UiOpenDocument]>(event);
      if (Platform.OS === 'web') {
        const preview = window.open('', '_blank');
        if (!preview) throw new Error('書類を開くにはポップアップを許可してください');
        preview.opener = null;
        try {
          const source = await entry.load();
          if (!source.bytes) throw new Error('書類を読み込めませんでした');
          const objectUrl = URL.createObjectURL(new Blob([source.bytes], { type: entry.contentType }));
          preview.location.href = objectUrl;
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch (cause) {
          preview.close();
          throw cause;
        }
        return;
      }
      const source = await entry.load();
      if (source.uri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(source.uri, { dialogTitle: entry.filename, mimeType: entry.contentType });
        return;
      }
      throw new Error('この端末では書類を開けません');
    },
    'platform.processCoverImage': async (event) => {
      if (Platform.OS !== 'web') throw new Error('カバー画像の変更はWeb版から行ってください');
      const [file] = args<[UiPickedFile]>(event);
      if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください');
      if (file.size > 30 * 1024 * 1024) throw new Error('30MB以下の画像を選択してください');
      const url = URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: file.type }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('画像を読み込めませんでした');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.84;
        let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length > 500000 && quality > 0.24) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        if (result.length > 550000) throw new Error('小さい画像を選び直してください');
        return result;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    'platform.confirmDiscard': () => new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      Alert.alert('変更を保存せずに閉じますか？', undefined, [
        { text: '編集を続ける', style: 'cancel', onPress: () => finish(false) },
        { text: '変更を破棄', style: 'destructive', onPress: () => finish(true) },
      ], { cancelable: true, onDismiss: () => finish(false) });
    }),
    'platform.ensureOfflineReady': async () => {
      if (Platform.OS !== 'web') return;
      if (!('serviceWorker' in navigator)) throw new Error('このブラウザーではオフライン起動に対応していません');
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) throw new Error('起動の準備中です。少し待ってもう一度お試しください');
    },
    'platform.persistStorage': async () => {
      if (Platform.OS !== 'web') return true;
      return navigator.storage?.persist ? navigator.storage.persist().catch(() => false) : false;
    },
    'platform.getPwaStatus': async () => {
      if (Platform.OS !== 'web') return { standalone: true, updateAvailable: false, ios: Platform.OS === 'ios' };
      const media = matchMedia('(display-mode: standalone)');
      const standalone = media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
      return {
        standalone,
        updateAvailable: Boolean(registration?.waiting),
        ios: /iPhone|iPad|iPod/.test(navigator.userAgent),
      };
    },
    'platform.installPwa': async () => {
      if (Platform.OS !== 'web' || !pwaPromptEvent) return false;
      const event = pwaPromptEvent;
      pwaPromptEvent = null;
      await event.prompt();
      return (await event.userChoice).outcome === 'accepted';
    },
    'platform.activatePwaUpdate': async (event) => {
      const [pendingCount] = args<[number]>(event);
      if (pendingCount > 0) return { activated: false, message: '未同期の変更を送信してから更新できます' };
      if (Platform.OS !== 'web' || !('serviceWorker' in navigator)) return { activated: false, message: '' };
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.waiting) return { activated: false, message: '' };
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      return { activated: true, message: '' };
    },
    'dialog.confirmDeletion': (event) => confirmDeletionService(...args<[string, string, () => void]>(event)),
  }), [auth, theme, toast]);

  return <UiMediatorProvider effects={effects}><UiBoundary name="App">{children}</UiBoundary></UiMediatorProvider>;
}
