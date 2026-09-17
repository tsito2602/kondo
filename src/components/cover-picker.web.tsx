import { useThemedStyles } from '@/theme/theme-provider';
import { FileDrop, type DroppedFile } from './file-drop';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Palette } from '@/constants/design';
import { TripCover } from './trip-cover';
import { useUiPlatform } from '@/ui/platform';

export function CoverPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const platform = useUiPlatform();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const select = async (file?: DroppedFile) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await platform.processCoverImage(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '画像を読み込めませんでした。JPEG・PNGでお試しください');
    } finally {
      setBusy(false);
    }
  };
  return <View style={{ gap: 10 }}>
    <FileDrop label={value ? '画像をドロップして変更' : 'カバー画像をドロップ'} selectLabel={value ? 'カバー画像を変更' : 'カバー画像を選択'} hint="画像1枚・30MBまで" accept="image/*" disabled={busy} onFiles={(files) => select(files[0])}>
      <TripCover image={value} />
    </FileDrop>
    {value ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => onChange('')} style={styles.button}><Text style={styles.remove}>画像を解除</Text></Pressable> : null}
    {error ? <Text style={styles.remove}>{error}</Text> : null}
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({ actions: { flexDirection: 'row', gap: 12 }, button: { minHeight: 40, justifyContent: 'center' }, text: { color: palette.ocean, fontWeight: '700', fontSize: 14 }, remove: { color: palette.danger, fontSize: 13 } });
