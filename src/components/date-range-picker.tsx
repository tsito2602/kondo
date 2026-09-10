import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/design';

import { calendarDate, displayDate, monthDays, rangeRows, selectRangeDate, type DateRange } from './date-range';

type Props = DateRange & {
  disabled?: boolean;
  label?: string;
  mode?: 'range' | 'single';
  onChange: (range: DateRange) => void;
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAY_HEIGHT = 32;
const ROW_HEIGHT = 46;
const MARKER_SIZE = 36;

function todayValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function DateRangePicker({ startDate, endDate, disabled, label = '期間', mode = 'range', onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'single' ? `日付 ${displayDate(startDate)}` : `開始日 ${displayDate(startDate)}、終了日 ${displayDate(endDate)}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, disabled && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.calendarIcon}>□</Text>
        {mode === 'single' ? (
          <View style={styles.triggerPart}><Text style={styles.triggerMeta}>日付</Text><Text style={styles.triggerValue}>{displayDate(startDate)}</Text></View>
        ) : (
          <>
            <View style={styles.triggerPart}><Text style={styles.triggerMeta}>出発日</Text><Text style={styles.triggerValue}>{displayDate(startDate)}</Text></View>
            <Text style={styles.triggerDash}>—</Text>
            <View style={styles.triggerPart}><Text style={styles.triggerMeta}>帰着日</Text><Text style={styles.triggerValue}>{displayDate(endDate)}</Text></View>
          </>
        )}
      </Pressable>
      {open ? <DateRangeDialog startDate={startDate} endDate={endDate} mode={mode} close={() => setOpen(false)} onChange={onChange} /> : null}
    </View>
  );
}

function DateRangeDialog({ startDate, endDate, mode, close, onChange }: Props & { close: () => void }) {
  const initial = startDate || endDate || todayValue();
  const [range, setRange] = useState<DateRange>({ startDate, endDate });
  const [anchorDate, setAnchorDate] = useState(startDate);
  const [phase, setPhase] = useState<'start' | 'end'>(mode === 'range' && startDate && !endDate ? 'end' : 'start');
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [yearText, setYearText] = useState(initial.slice(0, 4));
  const [gridWidth, setGridWidth] = useState(0);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  const days = useMemo(() => monthDays(year, monthIndex), [monthIndex, year]);

  const changeMonth = (value: string) => {
    setMonth(value);
    setYearText(value.slice(0, 4));
  };

  const applyYear = () => {
    const value = Number(yearText);
    if (!Number.isInteger(value) || value < 1 || value > 9999) {
      setYearText(month.slice(0, 4));
      return;
    }
    changeMonth(`${String(value).padStart(4, '0')}-${month.slice(5)}`);
  };

  const choose = (date: string) => {
    if (mode === 'single') {
      setRange({ startDate: date, endDate: date });
      setAnchorDate(date);
      return;
    }
    const next = selectRangeDate(range, phase, date);
    if (!next.endDate) setAnchorDate(next.startDate);
    setRange(next);
    setPhase(next.endDate ? 'start' : 'end');
  };

  const hint = mode === 'single'
    ? '日付を選択してください。'
    : phase === 'end' && range.startDate
      ? '帰着日を選択。同じ日なら日帰りです。'
      : range.endDate
        ? 'この期間でよければ「決定」を押してください。'
        : '出発日を選択してください。';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <SafeAreaView style={styles.backdrop}>
        <Pressable accessibilityLabel="日付選択を閉じる" onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.heading}>
            <Text style={styles.dialogTitle}>{mode === 'single' ? '日付' : '旅行期間'}</Text>
            <Pressable accessibilityLabel="日付選択を閉じる" onPress={close} style={styles.iconButton}><Text style={styles.close}>×</Text></Pressable>
          </View>

          <View style={styles.summary}>
            <Pressable onPress={() => setPhase('start')} style={[styles.summaryPart, phase === 'start' && styles.summaryActive]}>
              <Text style={styles.summaryMeta}>{mode === 'single' ? '日付' : '出発日'}</Text>
              <Text style={styles.summaryValue}>{displayDate(range.startDate)}</Text>
            </Pressable>
            {mode === 'range' ? <Pressable onPress={() => setPhase('end')} style={[styles.summaryPart, phase === 'end' && styles.summaryActive]}>
              <Text style={styles.summaryMeta}>帰着日</Text>
              <Text style={styles.summaryValue}>{displayDate(range.endDate)}</Text>
            </Pressable> : null}
          </View>

          <View style={styles.monthControls}>
            <Pressable accessibilityLabel="前の月" onPress={() => changeMonth(calendarDate(year, monthIndex - 1, 1).slice(0, 7))} style={styles.iconButton}><Text style={styles.arrow}>‹</Text></Pressable>
            <View style={styles.yearField}>
              <TextInput accessibilityLabel="年を入力" keyboardType="number-pad" maxLength={4} onBlur={applyYear} onChangeText={setYearText} onSubmitEditing={applyYear} selectTextOnFocus style={styles.yearInput} value={yearText} />
              <Text style={styles.yearSuffix}>年</Text>
            </View>
            <Text style={styles.monthLabel}>{monthIndex + 1}月</Text>
            <Pressable accessibilityLabel="次の月" onPress={() => changeMonth(calendarDate(year, monthIndex + 1, 1).slice(0, 7))} style={styles.iconButton}><Text style={styles.arrow}>›</Text></Pressable>
          </View>

          <View onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)} style={styles.grid}>
            {gridWidth ? <DateRangeHighlight anchorDate={anchorDate} days={days} gridWidth={gridWidth} range={range} /> : null}
            {WEEKDAYS.map((weekday) => <View key={weekday} style={styles.weekdayCell}><Text style={styles.weekday}>{weekday}</Text></View>)}
            {days.map((date, index) => {
              if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />;
              const selected = date === range.startDate || date === range.endDate;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${displayDate(date)}${date === range.startDate ? '、開始日' : ''}${date === range.endDate ? '、終了日' : ''}`}
                  accessibilityState={{ selected }}
                  key={date}
                  onPress={() => choose(date)}
                  style={styles.dayCell}>
                  <Text style={[styles.day, selected && styles.daySelected]}>{Number(date.slice(8))}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text accessibilityLiveRegion="polite" style={styles.hint}>{hint}</Text>
          <View style={styles.actions}>
            <Pressable onPress={() => { setRange({ startDate: '', endDate: '' }); setPhase('start'); }} style={styles.clearButton}><Text style={styles.clearText}>クリア</Text></Pressable>
            <Pressable disabled={!range.startDate || (mode === 'range' && !range.endDate)} onPress={() => { onChange(range); close(); }} style={({ pressed }) => [styles.confirmButton, (!range.startDate || (mode === 'range' && !range.endDate)) && styles.confirmDisabled, pressed && styles.pressed]}><Text style={styles.confirmText}>決定</Text></Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function DateRangeHighlight({ anchorDate, days, gridWidth, range }: { anchorDate: string; days: (string | null)[]; gridWidth: number; range: DateRange }) {
  const anchor = days.indexOf(anchorDate);
  const anchorRow = anchor < 0 ? (range.startDate < (days.find(Boolean) ?? '') ? 0 : 5) : Math.floor(anchor / 7);
  const rows = rangeRows(days, range);
  return (
    <View pointerEvents="none" style={styles.highlights}>
      {rows.map((segment, row) => <RangeBand anchorRow={anchorRow} gridWidth={gridWidth} key={row} row={row} segment={segment} />)}
      <DateMarker gridWidth={gridWidth} index={days.indexOf(range.startDate)} />
      <DateMarker gridWidth={gridWidth} index={range.endDate !== range.startDate ? days.indexOf(range.endDate) : -1} origin={anchor} />
    </View>
  );
}

function RangeBand({ anchorRow, gridWidth, row, segment }: { anchorRow: number; gridWidth: number; row: number; segment: { first: number; last: number } | null }) {
  const [progress] = useState(() => new Animated.Value(segment ? 1 : 0));
  useEffect(() => {
    Animated.timing(progress, { toValue: segment ? 1 : 0, duration: 220, delay: segment ? Math.abs(row - anchorRow) * 55 : 0, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [anchorRow, progress, row, segment]);
  if (!segment) return null;
  const cell = gridWidth / 7;
  return <Animated.View style={[styles.band, { left: segment.first * cell + 5, top: WEEKDAY_HEIGHT + row * ROW_HEIGHT + 5, width: (segment.last - segment.first + 1) * cell - 10, opacity: progress, transform: [{ scaleX: progress }] }]} />;
}

function DateMarker({ gridWidth, index, origin = -1 }: { gridWidth: number; index: number; origin?: number }) {
  const [position] = useState(() => new Animated.ValueXY());
  const [opacity] = useState(() => new Animated.Value(index >= 0 ? 1 : 0));
  const positioned = useRef(false);
  useEffect(() => {
    if (index < 0) {
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: false }).start();
      return;
    }
    const target = { x: ((index % 7) + 0.5) * gridWidth / 7 - MARKER_SIZE / 2, y: WEEKDAY_HEIGHT + Math.floor(index / 7) * ROW_HEIGHT + 5 };
    if (!positioned.current) {
      const start = origin >= 0 ? { x: ((origin % 7) + 0.5) * gridWidth / 7 - MARKER_SIZE / 2, y: WEEKDAY_HEIGHT + Math.floor(origin / 7) * ROW_HEIGHT + 5 } : target;
      position.setValue(start);
      positioned.current = true;
    }
    Animated.parallel([
      Animated.spring(position, { toValue: target, damping: 22, stiffness: 230, mass: 0.75, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: false }),
    ]).start();
  }, [gridWidth, index, opacity, origin, position]);
  return <Animated.View style={[styles.marker, { left: position.x, top: position.y, opacity }]} />;
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: palette.slate, fontFamily: 'monospace', fontSize: 11 },
  trigger: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.paper, borderRadius: 8, paddingHorizontal: 14 },
  calendarIcon: { width: 24, height: 24, borderWidth: 1.5, borderColor: palette.ocean, borderRadius: 6, color: palette.ocean, fontSize: 0 },
  triggerPart: { flex: 1, minWidth: 0 },
  triggerMeta: { color: palette.smoke, fontFamily: 'monospace', fontSize: 9 },
  triggerValue: { color: palette.ink, fontSize: 13, fontWeight: '700', marginTop: 3 },
  triggerDash: { color: palette.ash },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(24,42,54,0.34)', padding: 16 },
  dialog: { width: '100%', maxWidth: 500, backgroundColor: palette.canvas, borderRadius: 28, padding: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dialogTitle: { color: palette.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { color: palette.ink, fontSize: 30, lineHeight: 32, fontWeight: '400' },
  summary: { flexDirection: 'row', gap: 8, marginTop: 16 },
  summaryPart: { flex: 1, minHeight: 60, justifyContent: 'center', backgroundColor: palette.mist, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: 'transparent' },
  summaryActive: { backgroundColor: palette.sky, borderColor: palette.ocean },
  summaryMeta: { color: palette.smoke, fontFamily: 'monospace', fontSize: 9 },
  summaryValue: { color: palette.ink, fontSize: 13, fontWeight: '700', marginTop: 3 },
  monthControls: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  arrow: { color: palette.ink, fontSize: 30, lineHeight: 32 },
  yearField: { height: 40, flexDirection: 'row', alignItems: 'center', backgroundColor: palette.paper, borderRadius: 8, paddingLeft: 10, paddingRight: 8 },
  yearInput: { width: 46, color: palette.ink, fontSize: 15, fontWeight: '700', textAlign: 'right', padding: 0 },
  yearSuffix: { color: palette.slate, fontSize: 13, marginLeft: 3 },
  monthLabel: { width: 42, color: palette.ink, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  grid: { position: 'relative', flexDirection: 'row', flexWrap: 'wrap' },
  highlights: { position: 'absolute', inset: 0, zIndex: 0 },
  weekdayCell: { width: `${100 / 7}%`, height: WEEKDAY_HEIGHT, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  weekday: { color: palette.smoke, fontFamily: 'monospace', fontSize: 10 },
  dayCell: { width: `${100 / 7}%`, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  day: { color: palette.ink, fontSize: 14, fontWeight: '600', zIndex: 3 },
  daySelected: { color: palette.paper, fontWeight: '900' },
  band: { position: 'absolute', height: MARKER_SIZE, borderRadius: MARKER_SIZE / 2, backgroundColor: palette.sky },
  marker: { position: 'absolute', width: MARKER_SIZE, height: MARKER_SIZE, borderRadius: MARKER_SIZE / 2, backgroundColor: palette.ocean },
  hint: { minHeight: 18, color: palette.slate, fontSize: 12, textAlign: 'center', marginTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  clearButton: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: palette.slate, fontSize: 14, fontWeight: '700' },
  confirmButton: { minWidth: 112, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean, borderRadius: 8 },
  confirmDisabled: { opacity: 0.35 },
  confirmText: { color: palette.paper, fontSize: 15, fontWeight: '700' },
});
