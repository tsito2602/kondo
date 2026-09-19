import { useThemedStyles } from '@/theme/theme-provider';
import { StyleSheet, Text, View } from 'react-native';
import { type Palette } from '@/constants/design';
import { findAirportByCode } from '@/data/airports';
import type { Booking } from '@/data/types';

/** Keep airport codes paired with their names in both tickets and details. */
export function BookingRoute({ booking, compact = false }: { booking: Booking; compact?: boolean }) {
  const styles = useThemedStyles(createStyles);

  const endpoint = (code: string, name: string) => {
    const airportName = booking.kind === 'flight' ? findAirportByCode(code)?.name || name : name;
    return <View style={styles.endpoint}>
      <Text style={[styles.code, compact && styles.compactCode]}>{code || airportName || '未定'}</Text>
      {code && airportName && airportName !== code ? <Text style={styles.name}>{airportName}</Text> : null}
    </View>;
  };
  return <View style={styles.route}>
    {endpoint(booking.originCode, booking.origin)}
    <Text style={styles.arrow}>→</Text>
    {endpoint(booking.destinationCode, booking.destination)}
  </View>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  route: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginVertical: 8 },
  endpoint: { flex: 1, minWidth: 0, gap: 4 },
  code: { color: palette.ink, fontSize: 28, lineHeight: 36, fontWeight: '700' },
  compactCode: { fontSize: 22, lineHeight: 30 },
  name: { color: palette.slate, fontSize: 12, lineHeight: 19 },
  arrow: { color: palette.slate, fontSize: 22, lineHeight: 30 },
});
