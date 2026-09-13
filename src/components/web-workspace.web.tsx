import { PropsWithChildren, useEffect } from 'react';
import { Link, router, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/auth/auth-provider';
import { useTravel } from '@/data/travel-provider';
import { palette } from '@/constants/design';
import { useDesktop } from '@/hooks/use-desktop';

const pages = [
  { key: 'itinerary', label: 'しおり', icon: 'calendar_month' },
  { key: 'bookings', label: '予約', icon: 'confirmation_number' },
  { key: 'places', label: '行きたい場所', icon: 'location_on' },
  { key: 'packing', label: '準備', icon: 'checklist' },
  { key: 'members', label: 'メンバー', icon: 'group' },
] as const;

export function WebWorkspace({ children }: PropsWithChildren) {
  const desktop = useDesktop();
  const pathname = usePathname();
  const { trips, selectedTrip, syncing, sync } = useTravel();
  const { user, isDemo, exitDemo, signOut } = useAuth();
  const trip = pathname.startsWith('/trips/') ? selectedTrip : null;
  useEffect(() => {
    // A missed drop must never replace the app with a local file.
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    // RN Web handles Enter on these roles, but only handles Space for buttons.
    const pressSpace = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== ' ' || !(target instanceof HTMLElement) || !target.matches('[role="checkbox"], [role="radio"], [role="tab"]') || ['INPUT', 'BUTTON'].includes(target.tagName)) return;
      event.preventDefault();
      if (!event.repeat && target.getAttribute('aria-disabled') !== 'true' && !target.hasAttribute('disabled')) target.click();
    };
    window.addEventListener('keydown', pressSpace);
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => { window.removeEventListener('keydown', pressSpace); window.removeEventListener('dragover', preventFileNavigation); window.removeEventListener('drop', preventFileNavigation); };
  }, []);
  return <View testID="web-workspace" style={styles.workspace}>
    {desktop ? <a href="#workspace-main" className="skip-link">本文へ移動</a> : null}
    {desktop ? <View role="navigation" accessibilityLabel="メインナビゲーション" style={styles.sidebar}>
      <Link href="/" style={styles.brand} accessibilityLabel="tabi 旅行一覧"><Image source={require('../../assets/brand/logo.png')} style={{ width: 50, height: 50 }} contentFit="contain" /><Text style={styles.wordmark}>tabi</Text></Link>
      <Link href="/" style={[styles.nav, !trip && styles.selected]}><SymbolView name={{ web: 'luggage' }} size={21} tintColor={palette.ocean} /><Text style={styles.navText}>すべての旅行</Text></Link>
      {trip ? <View style={styles.section}>
        <Text style={styles.label}>旅行</Text>
        <select aria-label="旅行を切り替え" className="trip-switcher" value={trip.id} onChange={(event) => router.push({ pathname: '/trips/[tripId]/itinerary', params: { tripId: event.target.value } })}>
          {trips.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        <View style={styles.links}>{pages.map((page) => <Link key={page.key} href={{ pathname: `/trips/[tripId]/${page.key}`, params: { tripId: trip.id } }} style={[styles.nav, pathname.endsWith(`/${page.key}`) && styles.selected]} aria-current={pathname.endsWith(`/${page.key}`) ? 'page' : undefined}><SymbolView name={{ web: page.icon }} size={21} tintColor={palette.ocean} /><Text style={styles.navText}>{page.label}</Text></Link>)}</View>
      </View> : null}
      <ScrollView style={styles.tripList} contentContainerStyle={{ gap: 4 }}>
        <Text style={styles.label}>旅行一覧</Text>
        {trips.map((entry) => <Link nativeID={`trip-link-${entry.id}`} key={entry.id} href={{ pathname: '/trips/[tripId]/itinerary', params: { tripId: entry.id } }} style={[styles.tripLink, trip?.id === entry.id && styles.currentTrip]}><Text numberOfLines={2} style={styles.tripName}>{entry.name}</Text><Text style={styles.tripDate}>{entry.startsOn.replaceAll('-', '.')}</Text></Link>)}
      </ScrollView>
      <View style={styles.account}>
        <Text numberOfLines={1} style={styles.accountName}>{isDemo ? 'サンプルの旅行' : user?.name || 'アカウント'}</Text>
        {!isDemo ? <Pressable accessibilityRole="button" disabled={syncing} onPress={() => void sync()} style={styles.accountAction}><Text style={styles.accountText}>{syncing ? '同期中…' : '最新の情報に更新'}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" onPress={() => isDemo ? exitDemo() : void signOut()} style={styles.accountAction}><Text style={styles.accountText}>{isDemo ? 'サンプルを終了' : 'ログアウト'}</Text></Pressable>
      </View>
    </View> : null}
    <View nativeID="workspace-main" role="main" style={styles.main}>{children}</View>
  </View>;
}
const styles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', backgroundColor: palette.canvas },
  sidebar: { width: 232, flexShrink: 0, paddingHorizontal: 18, paddingTop: 24, backgroundColor: palette.paper, borderRightWidth: 1, borderColor: palette.ash },
  brand: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32, paddingHorizontal: 8, textDecorationLine: 'none' },
  wordmark: { color: palette.ink, fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  nav: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 10, textDecorationLine: 'none' },
  navText: { color: palette.ink, fontSize: 14, fontWeight: '600' }, selected: { backgroundColor: palette.sky },
  section: { marginTop: 26 }, label: { color: palette.smoke, fontSize: 11, fontWeight: '600', paddingHorizontal: 12, marginBottom: 10 }, links: { gap: 4, marginTop: 18 },
  tripList: { flex: 1, marginTop: 30 }, tripLink: { display: 'flex', padding: 12, gap: 5, borderRadius: 10, textDecorationLine: 'none' }, currentTrip: { backgroundColor: palette.canvas },
  tripName: { color: palette.slate, fontSize: 12, lineHeight: 18, fontWeight: '600' }, tripDate: { color: palette.smoke, fontSize: 10 },
  account: { paddingVertical: 18, borderTopWidth: 1, borderColor: palette.ash, marginTop: 16 }, accountName: { color: palette.ink, fontSize: 12, fontWeight: '600', padding: 10 }, accountAction: { padding: 10, borderRadius: 8 }, accountText: { color: palette.slate, fontSize: 12 },
  main: { flex: 1, minWidth: 0 },
});
