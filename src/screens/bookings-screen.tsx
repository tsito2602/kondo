import { useTripHeaderHeight } from '@/components/trip-header-context';
import { useToast } from '@/components/toast';
import { CopyButton } from '@/components/copy-button';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { type ComponentProps, type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormSheet } from '@/components/form-sheet';
import { addDays, formatDate, validDate } from '@/utils/dates';
import { DateRangePicker } from '@/components/date-range-picker';
import { useAuth } from '@/auth/auth-provider';
import { FloatingAddButton } from '@/components/floating-add-button';
import { FlightConnectionLink, FlightConnectionSheet } from '@/components/flight-connection-sheet';
import { palette, mono } from '@/constants/design';
import { findAirports, type Airport } from '@/data/airports';
import { cacheBookingDocument, getCachedDocumentUri, removeCachedBookingDocument } from '@/data/booking-document-cache';
import { findMatchingItineraryItem } from '@/data/booking-match';
import { findFlightConnections, hasLikelyFlightConnection } from '@/data/flight-connections';
import { useTravel } from '@/data/travel-provider';
import { Booking, BookingDocument, BookingKind } from '@/data/types';
import { confirmDeletion } from '@/utils/confirm-deletion';

const KINDS: { value: BookingKind; label: string; short: string; icon: string }[] = [
  { value: 'flight', label: '航空券', short: 'FLIGHT', icon: '✈' },
  { value: 'hotel', label: 'ホテル', short: 'HOTEL', icon: '⌂' },
  { value: 'train', label: '鉄道', short: 'TRAIN', icon: '↔' },
  { value: 'car', label: '車', short: 'CAR', icon: '◉' },
  { value: 'restaurant', label: '飲食', short: 'DINING', icon: '◇' },
  { value: 'ticket', label: '入場券', short: 'TICKET', icon: '◎' },
  { value: 'other', label: 'その他', short: 'OTHER', icon: '＋' },
];

type Draft = Pick<Booking, 'kind' | 'title' | 'detail' | 'origin' | 'originCode' | 'destination' | 'destinationCode' | 'day' | 'time' | 'endDay' | 'endTime' | 'confirmationCode' | 'note'>;

function blankDraft(day: string, kind: BookingKind = 'flight'): Draft {
  const defaults: Record<BookingKind, [string, string]> = {
    flight: ['10:00', '12:00'], hotel: ['15:00', '11:00'], train: ['09:00', '11:00'], car: ['09:00', '18:00'],
    restaurant: ['19:00', '19:00'], ticket: ['10:00', '10:00'], other: ['10:00', '10:00'],
  };
  return { kind, title: '', detail: '', origin: '', originCode: '', destination: '', destinationCode: '', day, time: defaults[kind][0], endDay: kind === 'hotel' && day ? addDays(day, 1) : day, endTime: defaults[kind][1], confirmationCode: '', note: '' };
}

export default function BookingsScreen() {
  const { selectedTrip } = useTravel();
  const { user } = useAuth();
  return <TripBookingsScreen key={`${user?.id}:${selectedTrip?.id}:${selectedTrip?.startsOn}:${selectedTrip?.endsOn}`} />;
}

function TripBookingsScreen() {
  const toast = useToast();
  const headerHeight = useTripHeaderHeight();
  const { booking: requestedBooking } = useLocalSearchParams<{ booking?: string | string[] }>();
  const { canEdit, bookings, createBooking, deleteBooking, deleteItem, documentsByBooking, items, selectedTrip, updateBooking } = useTravel();
  const [initialDraft, setInitialDraft] = useState('');
  const [viewing, setViewing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(selectedTrip?.startsOn ?? ''));
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [mergeItemId, setMergeItemId] = useState<string | null>(null);
  const [connectionBookingId, setConnectionBookingId] = useState<string | null>(null);
  const connections = useMemo(() => new Map(findFlightConnections(bookings).map((connection) => [connection.arrivalBookingId, connection])), [bookings]);
  const matchingCandidate = findMatchingItineraryItem(items, draft);
  const selectedMergeItem = matchingCandidate?.item.id === mergeItemId ? matchingCandidate.item : null;

  const openCreate = () => {
    setEditingId(null);
    const initial = blankDraft(selectedTrip?.startsOn ?? '');
    setInitialDraft(JSON.stringify(initial));
    setDraft(initial);
    setViewing(false);
    setFormError('');
    setMergeItemId(null);
    setFormOpen(true);
  };

  const openEdit = useCallback((booking: Booking) => {
    setEditingId(booking.id);
    const initial = {
      kind: booking.kind,
      title: booking.title,
      detail: booking.detail,
      origin: booking.origin,
      originCode: booking.originCode,
      destination: booking.destination,
      destinationCode: booking.destinationCode,
      day: booking.day,
      time: booking.time,
      endDay: booking.endDay,
      endTime: booking.endTime,
      confirmationCode: booking.confirmationCode,
      note: booking.note,
    };
    setDraft(initial);
    setInitialDraft(JSON.stringify(initial));
    setViewing(true);
    setFormError('');
    setMergeItemId(null);
    setFormOpen(true);
  }, []);

  useEffect(() => {
    const bookingId = Array.isArray(requestedBooking) ? requestedBooking[0] : requestedBooking;
    if (!bookingId) return;
    const booking = bookings.find((entry) => entry.id === bookingId);
    if (!booking) return;
    const timeout = setTimeout(() => {
      openEdit(booking);
      router.setParams({ booking: undefined });
    }, 0);
    return () => clearTimeout(timeout);
  }, [bookings, openEdit, requestedBooking]);

  const save = async () => {
    const needsRoute = ['flight', 'train', 'car'].includes(draft.kind);
    if (!draft.title.trim() || !validDate(draft.day) || (needsRoute && (!(draft.origin.trim() || draft.originCode) || !(draft.destination.trim() || draft.destinationCode)))) {
      setFormError(needsRoute ? '予約名、日付、出発地と到着地を入力してください' : '予約名と日付を入力してください');
      return;
    }
    if ((draft.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) || (draft.endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.endTime))) {
      setFormError('時刻は24時間表記（例 09:30）で入力してください。');
      return;
    }
    if (draft.endDay && (!validDate(draft.endDay) || draft.endDay < draft.day)) {
      setFormError('終了日は開始日以降を選択してください。');
      return;
    }
    if (draft.kind !== 'flight' && draft.endDay === draft.day && draft.time && draft.endTime && draft.endTime < draft.time) {
      setFormError('終了時刻は開始時刻以降にしてください');
      return;
    }
    const input = {
      ...draft,
      title: draft.title.trim(),
      detail: draft.detail.trim(),
      origin: draft.origin.trim(),
      destination: draft.destination.trim(),
      confirmationCode: draft.confirmationCode.trim(),
      note: draft.note.trim(),
    };
    const mergedContext = selectedMergeItem
      ? [selectedMergeItem.title.trim() !== input.title ? selectedMergeItem.title.trim() : '', selectedMergeItem.note.trim()].filter(Boolean).join(' — ')
      : '';
    const savedInput = mergedContext
      ? { ...input, note: [input.note, `日程から：${mergedContext}`].filter(Boolean).join('\n') }
      : input;
    try {
      if (editingId) updateBooking(editingId, savedInput);
      else {
        const id = createBooking(savedInput);
        setEditingId(id);
      }
      if (selectedMergeItem) deleteItem(selectedMergeItem.id);
      setDraft(savedInput);
      setInitialDraft(JSON.stringify(savedInput));
      setViewing(true); toast('予約を保存しました');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '予約を保存できませんでした。');
    }
  };

  const remove = () => {
    if (!editingId) return;
    confirmDeletion('予約を削除しますか？', 'この操作は取り消せません。', () => {
      for (const document of documentsByBooking[editingId] ?? []) removeCachedBookingDocument(document.id, document.filename);
      deleteBooking(editingId);
      setFormOpen(false);
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: headerHeight + 20 }]} showsVerticalScrollIndicator={false}>
        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行を作成してください</Text><Text style={styles.emptyBody}>予約は選択中の旅行ごとに保存されます。</Text></View>
        ) : bookings.length === 0 ? (
          <Pressable disabled={!canEdit} onPress={openCreate} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
            <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
            <Text style={styles.emptyTitle}>予約はまだありません</Text>
            <Text style={styles.emptyBody}>＋ 航空券・ホテル・チケットを追加</Text>
          </Pressable>
        ) : (
          <View style={styles.ticketList}>
            {bookings.map((booking, index) => {
              const kind = KINDS.find((entry) => entry.value === booking.kind) ?? KINDS[KINDS.length - 1];
              const hasRoute = Boolean(booking.origin || booking.destination || booking.originCode || booking.destinationCode);
              const route = hasRoute ? `${booking.originCode || booking.origin} → ${booking.destinationCode || booking.destination}` : booking.detail;
              const documentCount = documentsByBooking[booking.id]?.length ?? 0;
              const connection = connections.get(booking.id);
              return (
                <View key={booking.id}>
                <Pressable onPress={() => openEdit(booking)} style={({ pressed }) => [styles.ticket, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${booking.title}の詳細`}>
                  <View style={styles.copy}>
                    <View style={styles.ticketTop}>
                      <View style={styles.typeTag}><Text style={styles.type}>{kind.short}</Text></View>
                      <View style={styles.ticketTopMeta}>{documentCount ? <Text style={styles.documentCount}>書類 {documentCount}</Text> : null}<Text style={styles.serial}>TABI/{String(index + 1).padStart(2, '0')}</Text></View>
                    </View>
                    <Text numberOfLines={2} style={styles.cardTitle}>{booking.title}</Text>
                    {route ? <Text numberOfLines={2} style={styles.route}>{route}</Text> : null}
                    {hasRoute && booking.detail ? <Text numberOfLines={1} style={styles.detail}>{booking.detail}</Text> : null}
                    <Text style={styles.meta}>{formatDate(booking.day)}　{booking.time}{booking.endDay !== booking.day ? ` → ${formatDate(booking.endDay)}` : booking.endTime && booking.endTime !== booking.time ? ` – ${booking.endTime}` : ''}</Text>
                  </View>
                  <View style={styles.stub}>
                    <Text style={styles.icon}>{kind.icon}</Text>
                    <Text style={styles.stubNo}>{String(index + 1).padStart(2, '0')}</Text>
                    <Text style={styles.stubLabel}>PASS</Text>
                  </View>
                  <View style={[styles.notch, styles.notchTop]} />
                  <View style={[styles.notch, styles.notchBottom]} />
                </Pressable>
                {booking.kind === 'flight' && (connection || (canEdit && hasLikelyFlightConnection(booking, bookings))) ? <FlightConnectionLink disabled={!canEdit} booking={booking} connection={connection} nextFlight={bookings.find((flight) => flight.id === connection?.departureBookingId)} onPress={() => setConnectionBookingId(booking.id)} /> : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {selectedTrip && canEdit ? <FloatingAddButton label="予約を追加する" onPress={openCreate} /> : null}
      {connectionBookingId ? <FlightConnectionSheet bookingId={connectionBookingId} onClose={() => setConnectionBookingId(null)} /> : null}

      <FormSheet visible={formOpen} title={viewing ? '予約の詳細' : editingId ? '予約を編集' : '予約を追加'} onClose={() => setFormOpen(false)} onSave={canEdit ? viewing ? () => setViewing(false) : save : undefined} saveLabel={viewing ? '編集' : '保存'} canSave={viewing || Boolean(draft.title.trim())} dirty={!viewing && (JSON.stringify(draft) !== initialDraft || Boolean(selectedMergeItem))} error={formError}>
        {viewing && editingId ? <BookingDetails booking={{ id: editingId, ...draft }} documents={documentsByBooking[editingId] ?? []} /> : <>
              <Text style={styles.label}>種類</Text>
              <View style={styles.kindList}>
                {KINDS.map((kind) => <Pressable key={kind.value} accessibilityRole="radio" aria-checked={draft.kind === kind.value} onPress={() => setDraft((current) => ({ ...current, kind: kind.value }))} style={[styles.kindButton, draft.kind === kind.value && styles.kindSelected]}><Text style={[styles.kindText, draft.kind === kind.value && styles.kindTextSelected]}>{kind.label}</Text></Pressable>)}
              </View>

              <BookingFormFields draft={draft} setDraft={setDraft} />
              {matchingCandidate ? <View style={[styles.matchCard, selectedMergeItem && styles.matchCardSelected]}>
                <View style={styles.matchCopy}>
                  <Text style={styles.matchEyebrow}>{matchingCandidate.reason}</Text>
                  <Text numberOfLines={1} style={styles.matchTitle}>{matchingCandidate.item.time}　{matchingCandidate.item.title}</Text>
                  <Text style={styles.matchHelp}>{selectedMergeItem ? '保存すると、この予定の内容を予約へ移して1件にまとめます。' : '選ばなければ、予定と予約は別々に残ります。'}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setMergeItemId(selectedMergeItem ? null : matchingCandidate.item.id)} style={[styles.matchButton, selectedMergeItem && styles.matchButtonSelected]}>
                  <Text style={[styles.matchButtonText, selectedMergeItem && styles.matchButtonTextSelected]}>{selectedMergeItem ? '✓ まとめる' : 'まとめる'}</Text>
                </Pressable>
              </View> : null}
              {editingId ? <BookingDocuments bookingId={editingId} documents={documentsByBooking[editingId] ?? []} /> : <Text style={styles.documentNotice}>書類は予約を保存したあとに追加できます。</Text>}
              <Field label="メモ" multiline placeholder="任意" value={draft.note} onChangeText={(note) => setDraft((current) => ({ ...current, note }))} />
          {editingId && canEdit ? <Pressable accessibilityRole="button" onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>この予約を削除</Text></Pressable> : null}
        </>}
      </FormSheet>

    </SafeAreaView>
  );
}

function BookingDetails({ booking, documents }: { booking: Booking; documents: BookingDocument[] }) {
  const kind = KINDS.find((entry) => entry.value === booking.kind);
  const route = Boolean(booking.originCode || booking.origin || booking.destinationCode || booking.destination);
  return <>
    <View style={styles.detailTicket}>
      <Text style={styles.detailKind}>{kind?.label}</Text>
      <Text style={styles.detailTitle}>{booking.title}</Text>
      {route ? <View style={styles.detailRoute}><View style={styles.routeEndpoint}><Text style={styles.routeCode}>{booking.originCode || booking.origin}</Text>{booking.originCode ? <Text style={styles.placeName}>{booking.origin}</Text> : null}</View><Text style={styles.routeArrow}>→</Text><View style={styles.routeEndpoint}><Text style={styles.routeCode}>{booking.destinationCode || booking.destination}</Text>{booking.destinationCode ? <Text style={styles.placeName}>{booking.destination}</Text> : null}</View></View> : null}
      {booking.detail ? <Text selectable style={styles.detailBody}>{booking.detail}</Text> : null}
      <View style={styles.detailDates}>
        <View style={styles.dateColumn}><Text style={styles.label}>{booking.kind === 'hotel' ? 'チェックイン' : route ? '出発' : '開始'}</Text><Text style={styles.detailTime}>{booking.time || '時刻未定'}</Text><Text style={styles.placeName}>{formatDate(booking.day, true)}</Text></View>
        {booking.endDay && (booking.endDay !== booking.day || booking.endTime !== booking.time) ? <View style={styles.dateColumn}><Text style={styles.label}>{booking.kind === 'hotel' ? 'チェックアウト' : route ? '到着' : '終了'}</Text><Text style={styles.detailTime}>{booking.endTime || '時刻未定'}</Text><Text style={styles.placeName}>{formatDate(booking.endDay, true)}</Text></View> : null}
      </View>
      {booking.kind === 'flight' ? <Text style={styles.placeName}>時刻は各空港の現地時刻</Text> : null}
    </View>
    {booking.confirmationCode ? <View style={styles.confirmation}><View style={styles.confirmationCopy}><Text style={styles.label}>予約・確認番号</Text><Text selectable accessibilityLabel={`予約番号 ${booking.confirmationCode}`} style={styles.confirmationCode}>{booking.confirmationCode}</Text></View><CopyButton key={booking.confirmationCode} value={booking.confirmationCode} /></View> : null}
    <BookingDocuments bookingId={booking.id} documents={documents} />
    {booking.note ? <View style={styles.noteBlock}><Text style={styles.label}>メモ</Text><Text selectable style={styles.detailBody}>{booking.note}</Text></View> : null}
  </>;
}

function BookingDocuments({ bookingId, documents }: { bookingId: string; documents: BookingDocument[] }) {
  const { canEdit, deleteBookingDocument, downloadBookingDocument, uploadBookingDocument } = useTravel();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const addDocuments = async () => {
    if (busy) return;
    setError('');
    setBusy('upload');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'], multiple: true, copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      for (const asset of result.assets) {
        const bytes = asset.file ? await asset.file.arrayBuffer() : await new File(asset.uri).arrayBuffer();
        const size = bytes.byteLength;
        if (size > 20 * 1024 * 1024) throw new Error(`${asset.name}は20MBを超えています`);
        const extension = asset.name.split('.').pop()?.toLowerCase();
        const fallbackTypes: Record<string, string> = { pdf: 'application/pdf', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
        const contentType = (asset.mimeType || (extension ? fallbackTypes[extension] : '') || '').toLowerCase();
        if (!Object.values(fallbackTypes).includes(contentType)) throw new Error(`${asset.name}の形式には対応していません。画像かPDFを選択してください`);
        const document = await uploadBookingDocument(bookingId, { filename: asset.name, contentType, size, bytes });
        cacheBookingDocument(document.id, document.filename, bytes);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '書類を追加できませんでした');
    } finally {
      setBusy(null);
    }
  };

  const openDocument = async (document: BookingDocument) => {
    if (busy) return;
    setError('');
    setBusy(document.id);
    // Reserve the tab within the tap event so mobile browsers allow it.
    const preview = Platform.OS === 'web' ? window.open('', '_blank') : null;
    if (preview) preview.opener = null;
    try {
      if (Platform.OS === 'web' && !preview) throw new Error('書類を開くにはポップアップを許可してください');
      let uri = getCachedDocumentUri(document.id, document.filename);
      let bytes: ArrayBuffer | null = null;
      if (!uri) {
        bytes = await downloadBookingDocument(bookingId, document.id);
        uri = cacheBookingDocument(document.id, document.filename, bytes);
      }
      if (Platform.OS === 'web') {
        bytes ??= await downloadBookingDocument(bookingId, document.id);
        const objectUrl = URL.createObjectURL(new Blob([bytes], { type: document.contentType }));
        if (preview) preview.location.href = objectUrl;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else if (uri && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: document.filename, mimeType: document.contentType });
      } else {
        throw new Error('この端末では書類を開けません');
      }
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : '書類を開けませんでした');
    } finally {
      setBusy(null);
    }
  };

  const removeDocument = (document: BookingDocument) => {
    confirmDeletion('書類を削除しますか？', document.filename, () => {
      removeCachedBookingDocument(document.id, document.filename);
      deleteBookingDocument(bookingId, document.id);
    });
  };

  return <View style={styles.documentsSection}>
    <View style={styles.documentsHeading}><Text style={styles.label}>書類</Text><Pressable accessibilityRole="button" disabled={!canEdit || Boolean(busy)} onPress={addDocuments} style={({ pressed }) => [styles.documentAddButton, pressed && styles.pressed]}><Text style={styles.documentAddText}>＋ 画像・PDF</Text></Pressable></View>
    {documents.length ? <View style={styles.documentList}>{documents.map((document) => <View key={document.id} style={styles.documentRow}>
      <View style={styles.documentIcon}><Text style={styles.documentIconText}>{document.contentType === 'application/pdf' ? 'PDF' : 'IMG'}</Text></View>
      <Pressable accessibilityLabel={`${document.filename}を開く`} disabled={Boolean(busy)} onPress={() => openDocument(document)} style={({ pressed }) => [styles.documentCopy, pressed && styles.pressed]}>
        <Text numberOfLines={1} style={styles.documentName}>{document.filename}</Text><Text style={styles.documentMeta}>{formatFileSize(document.size)} · {getCachedDocumentUri(document.id, document.filename) ? '端末に保存済み' : 'タップして開く'}</Text>
      </Pressable>
      {busy === document.id ? <ActivityIndicator color={palette.ocean} size="small" /> : canEdit ? <Pressable accessibilityLabel={`${document.filename}を削除`} disabled={Boolean(busy)} onPress={() => removeDocument(document)} style={styles.documentDelete}><Text style={styles.documentDeleteText}>×</Text></Pressable> : null}
    </View>)}</View> : <View style={styles.documentEmpty}><Text style={styles.documentEmptyText}>画像やPDFを追加できます</Text></View>}
    {busy === 'upload' ? <View style={styles.uploading}><ActivityIndicator color={palette.ocean} size="small" /><Text style={styles.uploadingText}>アップロード中</Text></View> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
  </View>;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function BookingFormFields({ draft, setDraft }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setDraft((current) => ({ ...current, [key]: value }));
  const dateTimeRange = (label: string, startLabel: string, endLabel: string) => (
    <DateRangePicker
      endDate={draft.endDay}
      endLabel={endLabel}
      endTime={draft.endTime}
      label={label}
      showTime
      startDate={draft.day}
      startLabel={startLabel}
      startTime={draft.time}
      onChange={({ startDate, endDate, startTime, endTime }) => setDraft((current) => ({ ...current, day: startDate, endDay: endDate, time: startTime, endTime }))}
    />
  );
  const singleDateTime = (label: string, dateLabel: string, timeValue = draft.time) => (
    <DateRangePicker
      endDate={draft.day}
      label={label}
      mode="single"
      showTime
      startDate={draft.day}
      startLabel={dateLabel}
      startTime={timeValue}
      onChange={({ startDate, startTime }) => setDraft((current) => ({ ...current, day: startDate, endDay: startDate, time: startTime, endTime: startTime }))}
    />
  );
  const confirmation = (label = '予約・確認番号') => (
    <Field autoCapitalize="characters" label={label} placeholder="任意" value={draft.confirmationCode} onChangeText={(value) => set('confirmationCode', value)} />
  );

  if (draft.kind === 'flight') return <>
    <Field testID="booking-title" label="便名・航空会社" placeholder="例：ANA 257便" value={draft.title} onChangeText={(value) => set('title', value)} />
    <AirportField label="出発空港" placeholder="空港名・都市・HND" value={draft.origin} code={draft.originCode} onChange={(airport) => setDraft((current) => ({ ...current, origin: airport.name, originCode: airport.code }))} onChangeText={(value) => setDraft((current) => ({ ...current, origin: value, originCode: '' }))} />
    <AirportField label="到着空港" placeholder="空港名・都市・VIE" value={draft.destination} code={draft.destinationCode} onChange={(airport) => setDraft((current) => ({ ...current, destination: airport.name, destinationCode: airport.code }))} onChangeText={(value) => setDraft((current) => ({ ...current, destination: value, destinationCode: '' }))} />
    {dateTimeRange('フライト日時', '出発', '到着')}
    {confirmation('予約番号')}
  </>;

  if (draft.kind === 'hotel') return <>
    <Field label="ホテル名" placeholder="例：Hotel Astoria Vienna" value={draft.title} onChangeText={(value) => set('title', value)} />
    <Field label="住所・エリア" placeholder="例：ウィーン旧市街" value={draft.detail} onChangeText={(value) => set('detail', value)} />
    {dateTimeRange('宿泊期間', 'チェックイン', 'チェックアウト')}
    {confirmation()}
  </>;

  if (draft.kind === 'train' || draft.kind === 'car') {
    const car = draft.kind === 'car';
    return <>
      <Field label={car ? 'レンタカー会社・プラン' : '列車名・便名'} placeholder={car ? '例：トヨタレンタカー' : '例：のぞみ25号'} value={draft.title} onChangeText={(value) => set('title', value)} />
      <Field label={car ? '受取場所' : '乗車駅'} placeholder={car ? '例：博多駅前店' : '例：東京駅'} value={draft.origin} onChangeText={(value) => setDraft((current) => ({ ...current, origin: value, originCode: '' }))} />
      <Field label={car ? '返却場所' : '降車駅'} placeholder={car ? '例：福岡空港店' : '例：京都駅'} value={draft.destination} onChangeText={(value) => setDraft((current) => ({ ...current, destination: value, destinationCode: '' }))} />
      {dateTimeRange(car ? '利用期間' : '乗車日時', car ? '受取' : '出発', car ? '返却' : '到着')}
      {confirmation()}
    </>;
  }

  const config = draft.kind === 'restaurant'
    ? { title: '店名', titlePlaceholder: '例：博多もつ鍋 やま中', detail: '人数・席', detailPlaceholder: '例：2名・テーブル席', date: '予約日', time: '予約時刻' }
    : draft.kind === 'ticket'
      ? { title: '施設・イベント名', titlePlaceholder: '例：美術館 入場券', detail: '券種・座席', detailPlaceholder: '例：一般 2名', date: '利用日', time: '利用時刻' }
      : { title: '予約名', titlePlaceholder: '例：現地ツアー', detail: '詳細', detailPlaceholder: '例：集合場所・参加人数', date: '日付', time: '時刻' };
  return <>
    <Field label={config.title} placeholder={config.titlePlaceholder} value={draft.title} onChangeText={(value) => set('title', value)} />
    <Field label={config.detail} placeholder={config.detailPlaceholder} value={draft.detail} onChangeText={(value) => set('detail', value)} />
    {singleDateTime(`${config.date}・${config.time}`, config.date)}
    {confirmation()}
  </>;
}

function AirportField({ code, label, onChange, onChangeText, placeholder, value }: { code: string; label: string; onChange: (airport: Airport) => void; onChangeText: (value: string) => void; placeholder: string; value: string }) {
  const matches = findAirports(value);
  const selected = Boolean(code && matches.some((airport) => airport.code === code && airport.name === value));
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.airportInputWrap}>
      <TextInput accessibilityLabel={label} autoCapitalize="characters" onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.smoke} style={[styles.input, code && styles.airportInput]} value={value} />
      {code ? <View style={styles.codeBadge}><Text style={styles.codeText}>{code}</Text></View> : null}
    </View>
    {!selected && matches.length ? <View style={styles.suggestions}>
      {matches.map((airport) => <Pressable accessibilityLabel={`${airport.name} ${airport.code}を選択`} key={airport.code} onPress={() => onChange(airport)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
        <View style={styles.suggestionCopy}><Text style={styles.suggestionName}>{airport.name}</Text><Text style={styles.suggestionCity}>{airport.city}</Text></View>
        <Text style={styles.suggestionCode}>{airport.code}</Text>
      </Pressable>)}
    </View> : null}
  </View>;
}

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} maxLength={props.multiline ? 4000 : 240} placeholderTextColor={palette.smoke} style={[styles.input, props.multiline && styles.inputMultiline]} {...props} /></View>;
}

const styles = StyleSheet.create({
  detailTicket: { backgroundColor: palette.paper, borderRadius: 20, padding: 22, gap: 12 },
  detailKind: { color: palette.ocean, fontSize: 12, fontWeight: '700' },
  detailTitle: { color: palette.ink, fontSize: 25, fontWeight: '800', lineHeight: 34 },
  detailRoute: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  routeEndpoint: { flex: 1, minWidth: 0 }, routeCode: { color: palette.ink, fontSize: 28, lineHeight: 36, fontWeight: '700' },
  placeName: { color: palette.slate, fontSize: 12, lineHeight: 19 }, routeArrow: { color: palette.ocean, fontSize: 22 },
  detailDates: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: palette.ash, paddingTop: 18 },
  dateColumn: { flex: 1, minWidth: 120, gap: 4 }, detailTime: { color: palette.ink, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  confirmation: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderRadius: 16, backgroundColor: palette.sky },
  confirmationCopy: { flex: 1 }, confirmationCode: { color: palette.ink, fontSize: 21, fontWeight: '700', marginTop: 8 },
  copyButton: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: palette.paper, borderRadius: 8 }, copyText: { color: palette.ocean, fontSize: 13, fontWeight: '700' },
  detailBody: { fontSize: 15, color: palette.ink, lineHeight: 24 }, noteBlock: { gap: 8, padding: 8 },
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 112 },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper, borderRadius: 32, padding: 28, marginTop: 24 },
  emptyMark: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky, marginBottom: 18 },
  emptyMarkText: { color: palette.ocean, fontSize: 27, fontWeight: '700' },
  emptyTitle: { color: palette.ink, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: palette.slate, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  ticketList: { gap: 16, marginTop: 24 },
  ticket: { minHeight: 174, flexDirection: 'row', position: 'relative', overflow: 'hidden', borderRadius: 28, backgroundColor: palette.paper },
  copy: { flex: 1, minWidth: 0, padding: 20 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  ticketTopMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  documentCount: { color: palette.ocean, fontSize: 9, fontWeight: '800' },
  typeTag: { alignSelf: 'flex-start', backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 10, paddingVertical: 5 },
  type: { color: palette.ink, fontFamily: mono, fontSize: 9, letterSpacing: 0.8 },
  serial: { color: palette.smoke, fontFamily: mono, fontSize: 9 },
  cardTitle: { color: palette.ink, fontSize: 18, lineHeight: 25, fontWeight: '900', letterSpacing: -0.4, marginTop: 18 },
  route: { color: palette.ink, fontFamily: mono, fontSize: 16, fontWeight: '800', letterSpacing: 0.6, marginTop: 8 },
  detail: { color: palette.slate, fontSize: 14, marginTop: 6 },
  meta: { color: palette.slate, fontFamily: mono, fontSize: 10, lineHeight: 16, marginTop: 12 },
  stub: { width: 60, borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: palette.ocean, backgroundColor: palette.sky, alignItems: 'center', justifyContent: 'center' },
  icon: { color: palette.ocean, fontSize: 24, fontWeight: '900' },
  stubNo: { color: palette.ink, fontSize: 24, lineHeight: 27, fontWeight: '900', marginTop: 12 },
  stubLabel: { color: palette.smoke, fontFamily: mono, fontSize: 8, marginTop: 2 },
  notch: { position: 'absolute', right: 66, width: 20, height: 20, borderRadius: 10, backgroundColor: palette.canvas, zIndex: 2 },
  notchTop: { top: -10 },
  notchBottom: { bottom: -10 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(24,42,54,0.34)', padding: 16 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '94%', backgroundColor: palette.canvas, borderRadius: 28, overflow: 'hidden' },
  form: { gap: 16, padding: 20 },
  dialogHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dialogTitle: { color: palette.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { color: palette.ink, fontSize: 30, lineHeight: 32 },
  kindList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -8 },
  kindButton: { minHeight: 38, justifyContent: 'center', backgroundColor: palette.paper, borderRadius: 64, paddingHorizontal: 14 },
  kindSelected: { backgroundColor: palette.sky },
  kindText: { color: palette.slate, fontSize: 12, fontWeight: '700' },
  kindTextSelected: { color: palette.ink },
  twoColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flexField: { flex: 1, minWidth: 0 },
  field: { gap: 8 },
  label: { color: palette.slate, fontFamily: mono, fontSize: 11 },
  input: { minHeight: 52, backgroundColor: palette.paper, borderRadius: 8, color: palette.ink, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  airportInputWrap: { position: 'relative' },
  airportInput: { paddingRight: 68 },
  codeBadge: { position: 'absolute', right: 10, top: 10, minWidth: 48, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky, borderRadius: 8 },
  codeText: { color: palette.ink, fontFamily: mono, fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  suggestions: { overflow: 'hidden', backgroundColor: palette.paper, borderRadius: 12, marginTop: -2 },
  suggestion: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash, paddingHorizontal: 14 },
  suggestionCopy: { flex: 1, minWidth: 0 },
  suggestionName: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  suggestionCity: { color: palette.smoke, fontSize: 10, marginTop: 2 },
  suggestionCode: { color: palette.ocean, fontFamily: mono, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  matchCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, backgroundColor: palette.paper, padding: 14 },
  matchCardSelected: { backgroundColor: palette.sky },
  matchCopy: { flex: 1, minWidth: 0 },
  matchEyebrow: { color: palette.ocean, fontFamily: mono, fontSize: 9, fontWeight: '800' },
  matchTitle: { color: palette.ink, fontSize: 14, fontWeight: '800', marginTop: 4 },
  matchHelp: { color: palette.slate, fontSize: 10, lineHeight: 15, marginTop: 4 },
  matchButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: palette.sky, paddingHorizontal: 13 },
  matchButtonSelected: { backgroundColor: palette.ocean },
  matchButtonText: { color: palette.ocean, fontSize: 11, fontWeight: '800' },
  matchButtonTextSelected: { color: palette.paper },
  documentNotice: { color: palette.smoke, fontSize: 11, lineHeight: 17 },
  documentsSection: { gap: 10 },
  documentsHeading: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  documentAddButton: { minHeight: 36, justifyContent: 'center', borderRadius: 18, backgroundColor: palette.sky, paddingHorizontal: 13 },
  documentAddText: { color: palette.ocean, fontSize: 11, fontWeight: '800' },
  documentList: { overflow: 'hidden', borderRadius: 12, backgroundColor: palette.paper },
  documentRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash, paddingLeft: 10, paddingRight: 6 },
  documentIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: palette.sky },
  documentIconText: { color: palette.ocean, fontFamily: mono, fontSize: 9, fontWeight: '900' },
  documentCopy: { flex: 1, minWidth: 0, paddingVertical: 10 },
  documentName: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  documentMeta: { color: palette.smoke, fontSize: 9, marginTop: 4 },
  documentDelete: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  documentDeleteText: { color: palette.smoke, fontSize: 22, lineHeight: 24 },
  documentEmpty: { minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.paper },
  documentEmptyText: { color: palette.smoke, fontSize: 11 },
  uploading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  uploadingText: { color: palette.slate, fontSize: 11 },
  error: { color: palette.danger, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  deleteButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  deleteText: { color: palette.danger, fontSize: 14, fontWeight: '700' },
  saveButton: { minWidth: 120, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ocean, borderRadius: 8, paddingHorizontal: 22 },
  saveText: { color: palette.paper, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.62 },
});
