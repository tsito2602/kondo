import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '@/constants/design';
import { TripCover } from './trip-cover';

export function CoverPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const select = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    const url = URL.createObjectURL(file);
    try {
      if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください');
      if (file.size > 30 * 1024 * 1024) throw new Error('30MB以下の画像を選択してください');
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d'); if (!context) throw new Error('画像を読み込めませんでした');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.84, result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > 500000 && quality > 0.24) { quality -= 0.1; result = canvas.toDataURL('image/jpeg', quality); }
      if (result.length > 550000) throw new Error('小さい画像を選び直してください');
      onChange(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '画像を読み込めませんでした。JPEG・PNGでお試しください'); }
    finally { URL.revokeObjectURL(url); setBusy(false); if (input.current) input.current.value = ''; }
  };
  return <View style={{ gap: 10 }}>
    <TripCover image={value} />
    <input ref={input} type="file" accept="image/*" aria-label="トップ画像を選択" style={{ display: 'none' }} onChange={(event) => void select(event.target.files?.[0])} />
    <View style={styles.actions}><Pressable disabled={busy} onPress={() => input.current?.click()} style={styles.button}><Text style={styles.text}>{busy ? '画像を準備中…' : value ? '画像を変更' : '画像を選ぶ'}</Text></Pressable>{value ? <Pressable disabled={busy} onPress={() => onChange('')} style={styles.button}><Text style={styles.remove}>画像を解除</Text></Pressable> : null}</View>
    {error ? <Text style={styles.remove}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ actions: { flexDirection: 'row', gap: 12 }, button: { minHeight: 40, justifyContent: 'center' }, text: { color: palette.ocean, fontWeight: '700', fontSize: 14 }, remove: { color: palette.danger, fontSize: 13 } });
