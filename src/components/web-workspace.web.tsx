import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { MemberAvatar } from './member-avatar';
import { PropsWithChildren } from 'react';
import { closeTripTransition } from '@/utils/trip-transition';
import { usePathname } from 'expo-router';
import { BrandLogo } from '@/components/brand-logo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/auth/auth-provider';
import { useTravel } from '@/data/travel-provider';
import { type Palette } from '@/constants/design';
import { useDesktop } from '@/hooks/use-desktop';
import { useUiNavigation } from '@/ui/navigation';

const pages = [
  { key: 'itinerary', label: 'しおり', icon: 'calendar_month' },
  { key: 'bookings', label: '予約', icon: 'confirmation_number' },
  { key: 'places', label: '行きたい場所', icon: 'location_on' },
  { key: 'packing', label: '準備', icon: 'checklist' },
  { key: 'notes', label: 'メモ', icon: 'description' },
  { key: 'members', label: 'メンバー', icon: 'group' },
] as const;

export function WebWorkspace({ children }: PropsWithChildren) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);

  const desktop = useDesktop();
  const navigation = useUiNavigation();
  const pathname = usePathname();
  const { selectedTrip, syncing, sync } = useTravel();
  const { user, isDemo } = useAuth();
  const trip = pathname.startsWith('/trips/') ? selectedTrip : null;
  const goHome = () => {
    if (trip) closeTripTransition(trip.id, () => navigation.replace('/'));
    else navigation.replace('/');
  };
  return <View testID="web-workspace" style={styles.workspace}>
    {desktop ? <a href="#workspace-main" className="skip-link">本文へ移動</a> : null}
    {desktop ? <View role="navigation" accessibilityLabel="メインナビゲーション" style={styles.sidebar}>
      <Pressable accessibilityRole="link" accessibilityLabel="tabi 旅行一覧" onPress={goHome} style={styles.brand}><BrandLogo style={{ width: 50, height: 50 }} contentFit="contain" /><Text style={styles.wordmark}>tabi</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={goHome} style={[styles.nav, pathname === '/' && styles.selected]}><SymbolView name={{ web: 'luggage' }} size={21} tintColor={palette.ocean} /><Text style={styles.navText}>すべての旅行</Text></Pressable>
      {trip ? <View style={styles.section}>
        <View style={styles.links}>{pages.map((page) => <Pressable accessibilityRole="link" accessibilityState={{ selected: pathname.endsWith(`/${page.key}`) }} key={page.key} onPress={() => navigation.push({ pathname: `/trips/[tripId]/${page.key}`, params: { tripId: trip.id } })} style={[styles.nav, pathname.endsWith(`/${page.key}`) && styles.selected]}><SymbolView name={{ web: page.icon }} size={21} tintColor={palette.ocean} /><Text style={styles.navText}>{page.label}</Text></Pressable>)}</View>
      </View> : null}
      <View style={{ flex: 1 }} />
      <View style={styles.account}>
        <Pressable accessibilityRole="link" onPress={() => navigation.push('/settings')} style={[styles.nav, pathname === '/settings' && styles.selected]}><MemberAvatar name={user?.name || 'あなた'} avatarUrl={user?.avatarUrl} size={32} /><View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={{ color: palette.ink, fontSize: 12, fontWeight: '600' }}>{user?.name || (isDemo ? 'サンプルの旅行' : 'アカウント')}</Text><Text style={styles.accountText}>設定</Text></View></Pressable>
        {!isDemo ? <Pressable accessibilityRole="button" disabled={syncing} onPress={() => void sync()} style={styles.accountAction}><Text style={styles.accountText}>{syncing ? '同期中…' : '最新の情報に更新'}</Text></Pressable> : null}

      </View>
    </View> : null}
    <View nativeID="workspace-main" role="main" style={styles.main}>{children}</View>
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', backgroundColor: palette.canvas },
  sidebar: { width: 232, flexShrink: 0, paddingHorizontal: 18, paddingTop: 24, backgroundColor: palette.paper, borderRightWidth: 1, borderColor: palette.ash },
  brand: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32, paddingHorizontal: 8, textDecorationLine: 'none' },
  wordmark: { color: palette.ink, fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  nav: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 10, textDecorationLine: 'none' },
  navText: { color: palette.ink, fontSize: 14, fontWeight: '600' }, selected: { backgroundColor: palette.sky },
  section: { marginTop: 26 }, links: { gap: 4 },
  account: { paddingVertical: 18, borderTopWidth: 1, borderColor: palette.ash, marginTop: 16 }, accountAction: { padding: 10, borderRadius: 8 }, accountText: { color: palette.slate, fontSize: 12 },
  main: { flex: 1, minWidth: 0 },
});
