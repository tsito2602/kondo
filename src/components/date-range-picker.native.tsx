import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '@/constants/design';
import { formatDate, localDate, validDate } from '@/utils/dates';
import type { DateRangePickerProps } from './date-range-picker.types';

type Endpoint = 'start' | 'end';
export function DateRangePicker({ startDate, endDate, startTime = '10:00', endTime = '10:00', startLabel = '開始', endLabel = '終了', label = '日付', mode = 'range', showTime = false, disabled = false, onChange }: DateRangePickerProps) {
  const [active, setActive] = useState<{ endpoint: Endpoint; mode: 'date' | 'time' } | null>(null);
  const dateFor = (endpoint: Endpoint) => {
    const value = endpoint === 'start' ? startDate : endDate;
    const time = endpoint === 'start' ? startTime : endTime;
    return new Date(`${validDate(value) ? value : localDate()}T${time || '10:00'}:00`);
  };
  const change = (endpoint: Endpoint, selected: Date, part: 'date' | 'time' | 'datetime') => {
    const day = localDate(selected);
    const time = `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`;
    const next = { startDate, endDate, startTime, endTime };
    if (endpoint === 'start') {
      if (part !== 'time') next.startDate = day;
      if (part !== 'date') next.startTime = time;
      if (mode === 'single' || next.endDate < next.startDate) next.endDate = next.startDate;
    } else {
      if (part !== 'time') next.endDate = day;
      if (part !== 'date') next.endTime = time;
      if (next.startDate > next.endDate) next.startDate = next.endDate;
    }
    onChange(next);
    setActive(null);
  };
  const endpoints: Endpoint[] = mode === 'single' ? ['start'] : ['start', 'end'];
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.group}>
      {endpoints.map((endpoint, index) => <View key={endpoint} style={[styles.row, index > 0 && styles.border]}>
        <Text style={styles.endpoint}>{endpoint === 'start' ? startLabel : endLabel}</Text>
        {Platform.OS === 'ios' ? <DateTimePicker value={dateFor(endpoint)} mode={showTime ? 'datetime' : 'date'} display="compact" locale="ja-JP" themeVariant="light" disabled={disabled} accentColor={palette.ocean} onValueChange={(_, value) => change(endpoint, value, showTime ? 'datetime' : 'date')} style={styles.picker} /> : <View style={styles.values}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${endpoint === 'start' ? startLabel : endLabel}の日付`} disabled={disabled} onPress={() => setActive({ endpoint, mode: 'date' })} style={styles.trigger}><Text style={styles.value}>{formatDate(endpoint === 'start' ? startDate : endDate)}</Text></Pressable>
          {showTime ? <Pressable accessibilityRole="button" accessibilityLabel={`${endpoint === 'start' ? startLabel : endLabel}の時刻`} disabled={disabled} onPress={() => setActive({ endpoint, mode: 'time' })} style={styles.trigger}><Text style={styles.value}>{endpoint === 'start' ? startTime : endTime}</Text></Pressable> : null}
        </View>}
      </View>)}
    </View>
    {active && Platform.OS === 'android' ? <DateTimePicker value={dateFor(active.endpoint)} mode={active.mode} presentation="dialog" is24Hour positiveButton={{ label: '決定' }} negativeButton={{ label: 'キャンセル' }} accentColor={palette.ocean} onDismiss={() => setActive(null)} onValueChange={(_, value) => change(active.endpoint, value, active.mode)} /> : null}
  </View>;
}
const styles = StyleSheet.create({ field: { gap: 10, marginTop: 8 }, label: { fontSize: 13, fontWeight: '600', color: palette.slate }, group: { backgroundColor: palette.paper, borderRadius: 12, paddingHorizontal: 14 }, row: { minHeight: 62, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingVertical: 8 }, border: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.ash }, endpoint: { color: palette.slate, fontSize: 13, paddingVertical: 4 }, picker: { minHeight: 44, minWidth: 240 }, values: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, trigger: { minHeight: 44, paddingHorizontal: 10, backgroundColor: palette.mist, borderRadius: 8, justifyContent: 'center' }, value: { color: palette.ink, fontSize: 14, fontWeight: '600' } });
