import { Platform, StyleSheet, Text, View } from 'react-native';

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
          <Text style={styles.issuer}>TABI JOURNEY</Text>
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

const serif = Platform.select({ web: 'Georgia, ui-serif, serif', default: 'serif' });

const styles = StyleSheet.create({
  ticket: {
    minHeight: 224,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4E2DE',
  },
  main: { flex: 1, minWidth: 0, padding: 22, justifyContent: 'space-between' },
  issuerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  issuer: { color: '#17191C', fontSize: 10, lineHeight: 14, fontWeight: '500', letterSpacing: 1.45 },
  serial: { color: '#979799', fontSize: 9, lineHeight: 14, letterSpacing: 0.6 },
  titleBlock: { paddingVertical: 18 },
  destination: { color: '#777B86', fontSize: 11, lineHeight: 15, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: '#17191C', fontFamily: serif, fontSize: 30, lineHeight: 36, fontWeight: '400', letterSpacing: -0.45, marginTop: 5 },
  route: { flexDirection: 'row', alignItems: 'flex-end' },
  fieldLabel: { color: '#979799', fontSize: 9, lineHeight: 13, fontWeight: '500', letterSpacing: 1 },
  date: { color: '#17191C', fontSize: 15, lineHeight: 20, fontWeight: '500', marginTop: 2 },
  routeLine: { flex: 1, minWidth: 36, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingBottom: 5 },
  routeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#5D2A1A' },
  routeRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#B8B5B0' },
  routeArrow: { color: '#5D2A1A', fontSize: 15, lineHeight: 17, marginLeft: -2 },
  arrival: { alignItems: 'flex-end' },
  stub: { width: 92, borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: '#B98975', backgroundColor: '#FBE1D1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  stubLabel: { color: '#5D2A1A', fontSize: 8, lineHeight: 12, fontWeight: '500', letterSpacing: 0.9 },
  memberCount: { color: '#5D2A1A', fontFamily: serif, fontSize: 38, lineHeight: 44, fontWeight: '400', marginTop: 2 },
  barcode: { height: 31, width: 60, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' },
  bar: { height: '100%', backgroundColor: '#5D2A1A' },
  stubCode: { color: '#5D2A1A', fontSize: 8, lineHeight: 12, letterSpacing: 2, marginTop: 4 },
  notch: { position: 'absolute', right: 82, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FAF9F6', zIndex: 2 },
  notchTop: { top: -10 },
  notchBottom: { bottom: -10 },
});
