import { MotionPresence } from '@/components/motion-presence';
import { SymbolView } from 'expo-symbols';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormSheet } from './form-sheet';
import { type Palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import { useUiPlatform } from '@/ui/platform';

export function PwaSetup() {
  return null;
}

export function PwaControls() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);
  const platform = useUiPlatform();

  const { pendingCount } = useTravel();
  const [guide, setGuide] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [ios, setIos] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void platform.getPwaStatus().then((status) => {
        if (!live) return;
        setStandalone(status.standalone);
        setUpdateAvailable(status.updateAvailable);
        setIos(status.ios);
      }).catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [platform]);
  const install = async () => {
    try {
      const accepted = await platform.installPwa();
      if (accepted) setStandalone(true);
      else setGuide(true);
    } catch { setGuide(true); }
  };
  const update = async () => {
    const result = await platform.activatePwaUpdate(pendingCount);
    setMessage(result.message);
    if (!result.activated && !result.message) setUpdateAvailable(false);
  };
  return <>
    {!standalone || updateAvailable ? <View style={styles.row}>{!standalone ? <Pressable onPress={() => void install()} style={styles.button}><SymbolView name={{ ios: 'plus.app', android: 'add_to_home_screen', web: 'add_to_home_screen' }} size={18} tintColor={palette.ocean} /><Text style={styles.text}>ホーム画面に追加</Text></Pressable> : null}{updateAvailable ? <Pressable onPress={() => void update()} style={styles.button}><Text style={styles.text}>新しいバージョンに更新 ↻</Text></Pressable> : null}</View> : null}
    {message ? <Text style={styles.text}>{message}</Text> : null}
    <MotionPresence>{guide ? <FormSheet visible title="ホーム画面に追加" onClose={() => setGuide(false)}><Text style={styles.guideTitle}>いつものアプリと同じように。</Text><Text style={styles.guideText}>{ios ? 'Safariの共有メニューから「ホーム画面に追加」を選び、「追加」をタップしてください。' : 'ブラウザーのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。'}</Text><Text style={styles.guideText}>旅行のしおりから「オフライン保存」をすると、保存した書類も圏外で開けます。</Text></FormSheet> : null}</MotionPresence>
  </>;
}
const createStyles = (palette: Palette) => StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, button: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: palette.sky, borderRadius: 10 }, text: { color: palette.ocean, fontSize: 12, fontWeight: '600' }, guideTitle: { color: palette.ink, fontSize: 22, fontWeight: '700', marginTop: 12 }, guideText: { color: palette.slate, fontSize: 15, lineHeight: 26 } });
