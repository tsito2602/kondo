import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useItineraryTravel } from '@/data/itinerary-editor-draft';
import type { PlanSource } from '@/data/planner';
import type { ItineraryCategory, ItineraryDetails } from '@/data/types';
import { emptyItineraryDetails, itineraryDetailsError, transportLabel } from '@/data/itinerary';
import { validDate } from '@/utils/dates';
import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { type Palette } from '@/constants/design';
import { MotionPresence } from './motion-presence';
import { MotionModal } from './motion-modal';
import { FormSheet } from './form-sheet';
import { PlacePlanSheet } from './place-plan-sheet';
import { DateRangePicker } from './date-range-picker';
import { ItineraryCategoryPicker, ItineraryFields } from './itinerary-fields';
import { useToast } from './toast';

type Props = {
  source: PlanSource | null;
  disabled?: boolean;
  onSelect?: (source: PlanSource | null) => void;
  onViewItem?: (id: string) => void;
};
type SymbolName = ComponentProps<typeof SymbolView>['name'];

const PLAN_ICON: SymbolName = { ios: 'calendar.badge.plus', android: 'event', web: 'event' };
const MOVE_ICON: SymbolName = { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' };
const PLACE_ICON: SymbolName = { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' };
const CLOSE_ICON: SymbolName = { ios: 'xmark', android: 'close', web: 'close' };

export function PlannerCandidates({ disabled = false, onViewItem }: Props) {
  const { places, items, canEdit, selectedTrip, createItem } = useItineraryTravel();
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [placesOpen, setPlacesOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [planningPlaceId, setPlanningPlaceId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState(selectedTrip?.startsOn ?? '');
  const [time, setTime] = useState('10:00');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [details, setDetails] = useState<ItineraryDetails>(emptyItineraryDetails('sightseeing'));
  const [initialDraft, setInitialDraft] = useState('');
  const [formError, setFormError] = useState('');
  const moving = details.category === 'transport';
  const availablePlaces = places.filter((place) => !items.some((item) => item.id === place.itineraryItemId));

  const openNew = (category: ItineraryCategory) => {
    const startDay = selectedTrip?.startsOn ?? '';
    const startTime = category === 'transport' ? '' : '10:00';
    const nextDetails: ItineraryDetails = category === 'transport'
      ? { ...emptyItineraryDetails('transport'), transport: { mode: 'walk', origin: '', destination: '' } }
      : emptyItineraryDetails(category);
    setDay(startDay);
    setTime(startTime);
    setTitle('');
    setNote('');
    setDetails(nextDetails);
    setInitialDraft(JSON.stringify([startDay, startTime, '', '', nextDetails]));
    setFormError('');
    setAddMenuOpen(false);
    setAdding(true);
  };

  const saveNew = () => {
    const savedTitle = title.trim() || (moving
      ? [details.transport?.origin, details.transport?.destination].filter(Boolean).join(' → ') || `${transportLabel(details)}で移動`
      : '');
    if (!savedTitle || !validDate(day) || !/^([01]\d|2[0-3]):[0-5]\d$|^$/.test(time)) {
      setFormError('日付、予定名、正しい時刻を入力してください');
      return;
    }
    const normalized: ItineraryDetails = {
      ...details,
      ...(moving
        ? { location: '', transport: details.transport ?? { mode: 'walk', origin: '', destination: '' } }
        : { transport: undefined }),
    };
    const error = itineraryDetailsError(day, time, normalized)
      || (normalized.endDay && !normalized.endTime ? '終了・到着時刻を入力するか、日時を外してください' : '');
    if (error) { setFormError(error); return; }
    const id = createItem({ day, time, kind: '予定', title: savedTitle.slice(0, 160), note: note.trim(), details: normalized });
    setAdding(false);
    toast('編集内容に追加しました');
    onViewItem?.(id);
  };

  const openPlacePlan = (id: string) => {
    setPlacesOpen(false);
    setPlanningPlaceId(id);
  };

  return <>
    <View testID="planner-panel" style={[styles.dockShell, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
      <View style={styles.dock}>
        <Pressable
          testID="planner-places-action"
          accessibilityRole="button"
          accessibilityLabel={`行きたい場所から追加${availablePlaces.length ? `、${availablePlaces.length}件` : ''}`}
          disabled={disabled || !canEdit}
          onPress={() => setPlacesOpen(true)}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, (disabled || !canEdit) && styles.disabled]}>
          <SymbolView name={PLACE_ICON} size={18} tintColor={palette.ocean} />
          <Text style={styles.secondaryText}>行きたい場所</Text>
          {availablePlaces.length ? <View style={styles.badge}><Text style={styles.badgeText}>{availablePlaces.length}</Text></View> : null}
        </Pressable>
        <Pressable
          testID="planner-add-action"
          accessibilityRole="button"
          accessibilityLabel="予定を追加"
          disabled={disabled || !canEdit}
          onPress={() => setAddMenuOpen(true)}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, (disabled || !canEdit) && styles.disabled]}>
          <Text style={styles.plus}>＋</Text><Text style={styles.primaryText}>予定を追加</Text>
        </Pressable>
      </View>
    </View>

    <MotionModal visible={placesOpen} transparent animationType="fade" onRequestClose={() => setPlacesOpen(false)}>
      <View testID="planner-places-sheet-viewport" style={styles.overlay}>
        <Pressable accessibilityLabel="行きたい場所を閉じる" onPress={() => setPlacesOpen(false)} style={StyleSheet.absoluteFill} />
        <SafeAreaView accessibilityViewIsModal edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeading}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>行きたい場所から追加</Text>
              <Text style={styles.sheetCaption}>まだしおりに追加していない場所を表示しています。</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => setPlacesOpen(false)} style={styles.closeButton}>
              <SymbolView name={CLOSE_ICON} size={17} tintColor={palette.slate} />
            </Pressable>
          </View>
          <ScrollView testID="planner-candidates" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.placeList}>
            {availablePlaces.map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`${place.title}をしおりに追加`} onPress={() => openPlacePlan(place.id)} style={({ pressed }) => [styles.placeRow, pressed && styles.placeRowPressed]}>
              <View style={styles.placeIcon}><SymbolView name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} size={18} tintColor={palette.ocean} /></View>
              <View style={styles.placeCopy}><Text numberOfLines={2} style={styles.placeTitle}>{place.title}</Text>{place.note ? <Text numberOfLines={1} style={styles.placeMeta}>{place.note}</Text> : null}</View>
              <View style={styles.rowAdd}><Text style={styles.rowAddText}>＋</Text></View>
            </Pressable>)}
            {!availablePlaces.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>追加できる場所はありません</Text><Text style={styles.emptyBody}>行きたい場所に保存した候補は、ここから日付と時刻を決めて追加できます。</Text></View> : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </MotionModal>

    <MotionModal visible={addMenuOpen} transparent animationType="fade" onRequestClose={() => setAddMenuOpen(false)}>
      <View testID="planner-add-sheet-viewport" style={styles.overlay}>
        <Pressable accessibilityLabel="追加メニューを閉じる" onPress={() => setAddMenuOpen(false)} style={StyleSheet.absoluteFill} />
        <SafeAreaView accessibilityViewIsModal edges={['bottom']} style={[styles.sheet, styles.addSheet]}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>何を追加しますか？</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => setAddMenuOpen(false)} style={styles.closeButton}>
              <SymbolView name={CLOSE_ICON} size={17} tintColor={palette.slate} />
            </Pressable>
          </View>
          <View style={styles.addChoices}>
            <AddChoice icon={PLAN_ICON} title="予定" caption="観光・食事・アクティビティなど" onPress={() => openNew('sightseeing')} />
            <AddChoice icon={MOVE_ICON} title="移動" caption="徒歩・電車・バスなどの移動" onPress={() => openNew('transport')} />
            <AddChoice icon={PLACE_ICON} title="行きたい場所から" caption="保存済みの候補から追加" onPress={() => { setAddMenuOpen(false); setPlacesOpen(true); }} />
          </View>
        </SafeAreaView>
      </View>
    </MotionModal>

    <MotionPresence>{planningPlaceId ? <PlacePlanSheet key={planningPlaceId} placeId={planningPlaceId} onClose={() => setPlanningPlaceId(null)} onComplete={(_, itemId) => {
      setPlanningPlaceId(null);
      toast('編集内容に追加しました');
      onViewItem?.(itemId);
    }} /> : null}</MotionPresence>

    <FormSheet visible={adding} title={moving ? '移動を追加' : '予定を追加'} onClose={() => setAdding(false)} onSave={saveNew} saveLabel="保存"
      canSave={moving || Boolean(title.trim())}
      dirty={JSON.stringify([day, time, title, note, details]) !== initialDraft} error={formError}>
      <ItineraryCategoryPicker value={details.category} onChange={(category) => setDetails((current) => ({
        ...current,
        category,
        ...(category === 'transport'
          ? { transport: current.transport ?? { mode: 'walk', origin: '', destination: '' } }
          : { transport: undefined }),
      }))} />
      <View style={styles.formGap}><DateRangePicker mode="single" showTime label={moving ? '出発' : '開始'} startDate={day} endDate={day} startTime={time} onChange={(range) => { setDay(range.startDate); setTime(range.startTime); }} /></View>
      {moving ? <ItineraryFields day={day} time={time} details={details} onChange={setDetails} /> : null}
      <Text style={styles.label}>{moving ? '移動名（任意）' : '予定'}</Text>
      <TextInput accessibilityLabel="予定名" maxLength={160} value={title} onChangeText={setTitle}
        placeholder={moving ? '例：空港行きのバス' : details.category === 'meal' ? 'ランチ・夕食など' : details.category === 'shopping' ? 'おみやげを買う' : '美術館を訪れる'}
        placeholderTextColor={palette.placeholder} style={styles.input} />
      {!moving ? <ItineraryFields day={day} time={time} details={details} onChange={setDetails} /> : null}
      <Text style={styles.label}>メモ</Text>
      <TextInput accessibilityLabel="メモ" maxLength={4000} value={note} onChangeText={setNote}
        placeholder={moving ? '路線名・乗り場・乗り換えなど' : '当日のメモなど'} placeholderTextColor={palette.placeholder} style={[styles.input, styles.noteInput]} multiline />
    </FormSheet>
  </>;
}

function AddChoice({ icon, title, caption, onPress }: { icon: SymbolName; title: string; caption: string; onPress: () => void }) {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.addChoice, pressed && styles.placeRowPressed]}>
    <View style={styles.choiceIcon}><SymbolView name={icon} size={20} tintColor={palette.ocean} /></View>
    <View style={styles.placeCopy}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.placeMeta}>{caption}</Text></View>
    <Text style={styles.chevron}>›</Text>
  </Pressable>;
}

const createStyles = (palette: Palette) => StyleSheet.create({
  dockShell: { flexShrink: 0, backgroundColor: palette.canvas, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.ash, paddingTop: 10, paddingHorizontal: 12 },
  dock: { width: '100%', maxWidth: 800, alignSelf: 'center', flexDirection: 'row', gap: 10 },
  secondaryAction: { minHeight: 50, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: palette.paper },
  secondaryText: { color: palette.ink, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky },
  badgeText: { color: palette.ocean, fontSize: 11, fontWeight: '800' },
  primaryAction: { minHeight: 50, flex: 1.15, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: palette.ocean },
  primaryText: { color: palette.onOcean, fontSize: 14, fontWeight: '800' },
  plus: { color: palette.onOcean, fontSize: 22, lineHeight: 24, marginTop: -2 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.38 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,42,54,0.24)' },
  sheet: { width: '100%', maxWidth: 760, maxHeight: '74%', alignSelf: 'center', backgroundColor: palette.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  addSheet: { maxHeight: '58%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 4, backgroundColor: palette.ash },
  sheetHeader: { minHeight: 68, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetHeading: { flex: 1, minWidth: 0, gap: 3 },
  sheetTitle: { flex: 1, color: palette.ink, fontSize: 18, lineHeight: 25, fontWeight: '800' },
  sheetCaption: { color: palette.slate, fontSize: 11, lineHeight: 17 },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.mist },
  placeList: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  placeRow: { minHeight: 70, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: palette.paper },
  placeRowPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  placeIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky },
  placeCopy: { flex: 1, minWidth: 0, gap: 2 },
  placeTitle: { color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  placeMeta: { color: palette.slate, fontSize: 11, lineHeight: 17 },
  rowAdd: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.mist },
  rowAddText: { color: palette.ocean, fontSize: 21, lineHeight: 23 },
  empty: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24, gap: 7 },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: '700' },
  emptyBody: { color: palette.slate, fontSize: 12, lineHeight: 19, textAlign: 'center', maxWidth: 320 },
  addChoices: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  addChoice: { minHeight: 74, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: palette.paper },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky },
  choiceTitle: { color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  chevron: { color: palette.smoke, fontSize: 24, lineHeight: 28 },
  formGap: { marginTop: 8 },
  label: { color: palette.slate, fontSize: 12, fontWeight: '600', marginTop: 18, marginBottom: 8 },
  input: { color: palette.ink, backgroundColor: palette.paper, borderRadius: 10, padding: 14, minHeight: 48, fontSize: 16 },
  noteInput: { minHeight: 120, textAlignVertical: 'top' },
});
