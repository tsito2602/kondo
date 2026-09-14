"""One-shot, branch-scoped preparation; removed before the verified commit."""
from pathlib import Path
import json

def replace(path, old, new):
    file = Path(path)
    source = file.read_text()
    assert source.count(old) == 1, f'{path}: expected exactly one patch anchor: {old[:90]}'
    file.write_text(source.replace(old, new))

replace('src/app/index.tsx', "import { MotionPage }", "import { navigateTrip } from '@/utils/trip-navigation';\nimport { MotionPage }")
replace('src/app/index.tsx', "    selectTrip(tripId);\n    router.push({ pathname: '/trips/[tripId]/itinerary', params: { tripId } });", "    navigateTrip(tripId, 'open', () => {\n      selectTrip(tripId);\n      router.push({ pathname: '/trips/[tripId]/itinerary', params: { tripId } });\n    });")
replace('src/components/trip-ticket.tsx', '<View testID="trip-ticket"', '<View nativeID={`trip-ticket-${encodeURIComponent(trip.id)}`} testID="trip-ticket"')
replace('src/components/trip-ticket.tsx', '        {photo ? <><Image', '        <View testID="trip-ticket-art" style={[StyleSheet.absoluteFill, styles.art]}>\n        {photo ? <><Image')
replace('src/components/trip-ticket.tsx', 'styles.photoShade]} /></> : null}', 'styles.photoShade]} /></> : null}\n        </View>')
replace('src/components/trip-ticket.tsx', '<Text style={[styles.title, photo && styles.photoText]}', '<Text testID="trip-ticket-title" style={[styles.title, photo && styles.photoText]}')
replace('src/components/trip-ticket.tsx', "  photoShade: {", "  art: { backgroundColor: palette.paper, borderTopLeftRadius: 24, borderBottomLeftRadius: 24, overflow: 'hidden' },\n  photoShade: {")
replace('src/components/trip-hero.tsx', '    {trip.coverImage', '    <View testID="trip-hero-art" style={StyleSheet.absoluteFill}>\n    {trip.coverImage')
replace('src/components/trip-hero.tsx', '    <Animated.View style={[styles.caption, { opacity }]}>', '    </View>\n    <Animated.View style={[styles.caption, { opacity }]}>')
replace('src/components/trip-top-tabs.tsx', "import { MotionPresence }", "import { navigateTrip } from '@/utils/trip-navigation';\nimport { MotionPresence }")
replace('src/components/trip-top-tabs.tsx', ": router.replace('/')} testID=\"trip-back\"", ": navigateTrip(tripId, 'close', () => router.replace('/'))} testID=\"trip-back\"")
replace('src/components/trip-top-tabs.tsx', '<Text numberOfLines={1} style={styles.tripName}>', '<Text testID={managing ? undefined : "trip-title"} numberOfLines={1} style={styles.tripName}>')
replace('src/app/trips/[tripId]/_layout.tsx', 'import { useEffect, useState }', 'import { useEffect, useLayoutEffect, useRef, useState }')
replace('src/app/trips/[tripId]/_layout.tsx', 'ActivityIndicator, Animated, StyleSheet', 'ActivityIndicator, Animated, Platform, StyleSheet')
replace('src/app/trips/[tripId]/_layout.tsx', '  const [headerHeight, setHeaderHeight]', '  const headerRef = useRef<View>(null);\n  const [headerHeight, setHeaderHeight]')
replace('src/app/trips/[tripId]/_layout.tsx', '  if (!ready || (tripExists', "  // Measure the initial web header during commit, not after the snapshot.\n  useLayoutEffect(() => {\n    const element = headerRef.current as unknown as { getBoundingClientRect?: () => { height: number } } | null;\n    if (Platform.OS === 'web' && element?.getBoundingClientRect) {\n      setHeaderHeight(Math.max(0, element.getBoundingClientRect().height - insets.top));\n    }\n  }, [desktop, insets.top, ready, selectedTrip?.id, tripId]);\n\n  if (!ready || (tripExists")
replace('src/app/trips/[tripId]/_layout.tsx', "<View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}", "<View ref={headerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }}")
replace('src/app/trips/[tripId]/_layout.tsx', '<View style={styles.safeArea}>', '<View nativeID={`trip-workspace-${encodeURIComponent(tripId)}`} testID="trip-workspace" style={styles.safeArea}>')
replace('src/app/_layout.tsx', "import '@/motion.css';", "import '@/motion.css';\nimport '@/trip-transition.css';\nimport { useEffect } from 'react';\nimport { Platform } from 'react-native';\nimport { installTripHistory } from '@/utils/trip-navigation';")
replace('src/app/_layout.tsx', "  const { isDemo, user } = useAuth();", "  const { isDemo, user } = useAuth();\n  useEffect(installTripHistory, [isDemo, user?.id]);")
replace('src/app/_layout.tsx', "animation: reduced ? 'none' : 'slide_from_right'", "animation: Platform.OS === 'web' || reduced ? 'none' : 'slide_from_right'")

# Desktop's home links are another way back to the same selected ticket.
replace('src/components/web-workspace.web.tsx', "import { PropsWithChildren, useEffect }", "import { navigateTrip } from '@/utils/trip-navigation';\nimport { ComponentProps, PropsWithChildren, useEffect }")
replace('src/components/web-workspace.web.tsx', 'Link, usePathname', 'Link, usePathname, useRouter')
replace('src/components/web-workspace.web.tsx', '  const pathname = usePathname();', '  const pathname = usePathname();\n  const router = useRouter();')
replace('src/components/web-workspace.web.tsx', "  const trip = pathname.startsWith('/trips/') ? selectedTrip : null;", """  const trip = pathname.startsWith('/trips/') ? selectedTrip : null;
  const openHome: NonNullable<ComponentProps<typeof Link>['onPress']> = (event) => {
    const click = event.nativeEvent as MouseEvent;
    // Preserve modified-click/new-tab semantics of the real anchor.
    if (!trip || event.defaultPrevented || click.button > 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
    event.preventDefault();
    navigateTrip(trip.id, 'close', () => router.replace('/'));
  };""")
replace('src/components/web-workspace.web.tsx', '<Link href="/" style={styles.brand}', '<Link href="/" onPress={openHome} style={styles.brand}')
replace('src/components/web-workspace.web.tsx', '<Link href="/" style={[styles.nav,', '<Link href="/" onPress={openHome} style={[styles.nav,')

version = '1.7.0'
pkg_file = Path('package.json')
pkg = json.loads(pkg_file.read_text())
assert pkg['version'] == '1.6.3', 'base release changed; review before updating'
pkg['version'] = version
pkg['scripts']['test:motion'] += ' && node scripts/test-trip-navigation.mjs'
pkg_file.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + '\n')
lock_file = Path('package-lock.json')
lock = json.loads(lock_file.read_text())
lock['version'] = lock['packages']['']['version'] = version
lock_file.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + '\n')
app_file = Path('app.json')
app = json.loads(app_file.read_text())
app['expo']['version'] = version
app_file.write_text(json.dumps(app, indent=2, ensure_ascii=False) + '\n')
Path('.github/workflows/issue-146-verify.yml').unlink()
Path(__file__).unlink()
print('Prepared the final application diff and synchronized all three versions; temporary preparation files removed.')
