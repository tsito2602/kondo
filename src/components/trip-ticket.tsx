import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/design';
import type { Trip } from '@/data/types';

const bars = [1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 3, 2];

function ticketDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(date);
}

export function TripTicket({ trip }: { trip: Trip }) {
  const serial = trip.id.replaceAll('-', '').slice(0, 8).toUpperCase();

  return (
    <View style={styles.ticket} accessibilityLabel={`${trip.name}、${trip.startsOn}から${trip.endsOn}まで`}>
      <View style={styles.main}>
        <View style={styles.issuerRow}>
          <View style={styles.issuerTag}><Text style={styles.issuer}>TABI JOURNEY</Text></View>
          <Text style={styles.serial}>NO. {serial}</Text>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.destination}>{trip.destination || 'DESTINATION'}</Text>
          <Text style={styles.title} numberOfLines={2}>{trip.name}</Text>
        </View>

        <View style={styles.route}>
          <View>
            <Text style={styles.fieldLabel}>DEPART</Text>
            <Text style={styles.date}>{ticketDate(trip.startsOn)}</Text>
          </View>
          <View style={styles.routeLine}>
            <View style={styles.routeDot} />
            <View style={styles.routeRule} />
            <Text style={styles.routeArrow}>→</Text>
          </View>
          <View style={styles.arrival}>
            <Text style={styles.fieldLabel}>RETURN</Text>
            <Text style={styles.date}>{ticketDate(trip.endsOn)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.stub}>
        <Text style={styles.stubLabel}>TRAVELLERS</Text>
        <Text style={styles.memberCount}>{String(trip.memberCount).padStart(2, '0')}</Text>
        <View style={styles.barcode} accessibilityElementsHidden>
          {bars.map((width, index) => <View key={index} style={[styles.bar, { width }]} />)}
        </View>
        <Text style={styles.stubCode}>{serial.slice(0, 4)}</Text>
      </View>

      <View style={[styles.notch, styles.notchTop]} />
      <View style={[styles.notch, styles.notchBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: { minHeight: 238, flexDirection: 'row', overflow: 'hidden', position: 'relative', borderRadius: 32, backgroundColor: palette.carbon },
  main: { flex: 1, minWidth: 0, padding: 24, justifyContent: 'space-between' },
  issuerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  issuerTag: { alignSelf: 'flex-start', backgroundColor: palette.mint, borderRadius: 64, paddingHorizontal: 10, paddingVertical: 5 },
  issuer: { color: palette.carbon, fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 1.1 },
  serial: { color: palette.smoke, fontFamily: 'monospace', fontSize: 9, lineHeight: 20, letterSpacing: 0.5 },
  titleBlock: { paddingVertical: 20 },
  destination: { color: palette.smoke, fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: palette.paper, fontSize: 32, lineHeight: 32, fontWeight: '900', letterSpacing: -1.1, marginTop: 7 },
  route: { flexDirection: 'row', alignItems: 'flex-end' },
  fieldLabel: { color: palette.smoke, fontFamily: 'monospace', fontSize: 9, lineHeight: 13, fontWeight: '400', letterSpacing: 0.8 },
  date: { color: palette.paper, fontSize: 16, lineHeight: 20, fontWeight: '700', marginTop: 2 },
  routeLine: { flex: 1, minWidth: 36, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingBottom: 5 },
  routeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.voltage },
  routeRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: palette.smoke },
  routeArrow: { color: palette.voltage, fontSize: 15, lineHeight: 17, marginLeft: -2 },
  arrival: { alignItems: 'flex-end' },
  stub: { width: 96, borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: palette.carbon, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  stubLabel: { color: palette.carbon, fontFamily: 'monospace', fontSize: 8, lineHeight: 12, fontWeight: '400', letterSpacing: 0.7 },
  memberCount: { color: palette.carbon, fontSize: 42, lineHeight: 46, fontWeight: '900', letterSpacing: -1.6, marginTop: 2 },
  barcode: { height: 31, width: 60, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' },
  bar: { height: '100%', backgroundColor: palette.carbon },
  stubCode: { color: palette.carbon, fontFamily: 'monospace', fontSize: 8, lineHeight: 12, letterSpacing: 2, marginTop: 4 },
  notch: { position: 'absolute', right: 86, width: 20, height: 20, borderRadius: 10, backgroundColor: palette.canvas, zIndex: 2 },
  notchTop: { top: -10 },
  notchBottom: { bottom: -10 },
});
