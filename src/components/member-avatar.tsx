import { usePalette } from '@/theme/theme-provider';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';


export function MemberAvatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const palette = usePalette();

  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <View accessibilityLabel={`${name}のアイコン`} style={{ width: size, height: size, flexShrink: 0, borderRadius: size / 2, overflow: 'hidden', backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' }}>
    {avatarUrl && failedUrl !== avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: size, height: size }} contentFit="cover" onError={() => setFailedUrl(avatarUrl)} /> : <Text style={{ color: palette.ocean, fontSize: size * 0.38, fontWeight: '700' }}>{Array.from(name.trim())[0]?.toUpperCase() || '？'}</Text>}
  </View>;
}
