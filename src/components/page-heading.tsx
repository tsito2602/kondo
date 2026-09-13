import { Text, View } from 'react-native';
import { useDesktop } from '@/hooks/use-desktop';
import { palette } from '@/constants/design';
export function PageHeading({ title, count }: { title: string; count?: string }) {
  const desktop = useDesktop();
  if (!desktop) return null;
  return <View testID="page-heading" style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 }}><Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.7 }}>{title}</Text>{count ? <Text style={{ color: palette.smoke, fontSize: 13 }}>{count}</Text> : null}</View>;
}
