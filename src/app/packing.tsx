import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import { PackingItem } from '@/data/types';

const CATEGORIES = ['衣類', '洗面・衛生', '電子機器', '書類', '薬', 'その他'];

type Draft = Pick<PackingItem, 'name' | 'category' | 'quantity' | 'packed'>;

const blankDraft = (): Draft => ({ name: '', category: CATEGORIES[0], quantity: 1, packed: false });

export default function PackingScreen() {
  const { createPackingItem, deletePackingItem, packingItems, pendingCount, selectedTrip, updatePackingItem } = useTravel();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const packedCount = packingItems.filter((item) => item.packed).length;
  const progress = packingItems.length ? packedCount / packingItems.length : 0;
  const grouped = useMemo(() => CATEGORIES.map((category) => ({
    category,
    items: packingItems.filter((item) => item.category === category),
  })).filter((group) => group.items.length), [packingItems]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(blankDraft());
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (item: PackingItem) => {
    setEditingId(item.id);
    setDraft({ name: item.name, category: item.category, quantity: item.quantity, packed: item.packed });
    setFormError('');
    setFormOpen(true);
  };

  const save = () => {
    if (!draft.name.trim()) {
      setFormError('持ち物の名前を入力してください。');
      return;
    }
    const input = { ...draft, name: draft.name.trim() };
    if (editingId) updatePackingItem(editingId, input);
    else createPackingItem(input);
    setFormOpen(false);
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert('持ち物を削除しますか？', 'この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => { deletePackingItem(editingId); setFormOpen(false); } },
    ]);
  };

  const toggle = (item: PackingItem) => updatePackingItem(item.id, {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    packed: !item.packed,
  });

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headingRow}>
          <View style={styles.tag}><Text style={styles.tagText}>PACKING LIST</Text></View>
          <Text style={styles.counter}>{pendingCount ? `${pendingCount} SYNCING` : `${String(packedCount).padStart(2, '0')} / ${String(packingItems.length).padStart(2, '0')}`}</Text>
        </View>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>持ち物</Text>
            {selectedTrip ? <Text numberOfLines={1} style={styles.tripName}>{selectedTrip.name}</Text> : null}
          </View>
          {selectedTrip ? <Pressable accessibilityLabel="持ち物を追加する" onPress={openCreate} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><Text style={styles.addButtonText}>＋ 追加</Text></Pressable> : null}
        </View>

        {selectedTrip ? (
          <View style={styles.progressCard}>
            <View style={styles.progressCopy}>
              <Text style={styles.progressLabel}>準備の進み具合</Text>
              <Text style={styles.progressValue}>{packingItems.length ? `${Math.round(progress * 100)}%` : '0%'}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressMeta}>{packedCount}個準備済み・残り{packingItems.length - packedCount}個</Text>
          </View>
        ) : null}

        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行を作成してください</Text><Text style={styles.emptyBody}>持ち物は選択中の旅行ごとに保存されます。</Text></View>
        ) : packingItems.length === 0 ? (
          <Pressable onPress={openCreate} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
            <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
            <Text style={styles.emptyTitle}>最初の持ち物を追加</Text>
            <Text style={styles.emptyBody}>服、充電器、パスポートなどを準備していきましょう。</Text>
          </Pressable>
        ) : (
          <View style={styles.groups}>
            {grouped.map((group) => (
              <View key={group.category} style={styles.group}>
                <View style={styles.groupHeading}>
                  <Text style={styles.groupTitle}>{group.category}</Text>
                  <Text style={styles.groupCount}>{group.items.filter((item) => item.packed).length}/{group.items.length}</Text>
                </View>
                <View style={styles.list}>
                  {group.items.map((item, index) => (
                    <View key={item.id} style={[styles.row, index > 0 && styles.rowBorder]}>
                      <Pressable accessibilityLabel={`${item.name}を${item.packed ? '未準備' : '準備済み'}にする`} accessibilityRole="checkbox" accessibilityState={{ checked: item.packed }} hitSlop={8} onPress={() => toggle(item)} style={[styles.check, item.packed && styles.checkDone]}>
                        <Text style={[styles.checkText, item.packed && styles.checkTextDone]}>{item.packed ? '✓' : ''}</Text>
                      </Pressable>
                      <Pressable accessibilityLabel={`${item.name}を編集`} onPress={() => openEdit(item)} style={({ pressed }) => [styles.rowCopy, pressed && styles.pressed]}>
                        <Text style={[styles.itemName, item.packed && styles.itemDone]}>{item.name}</Text>
                        {item.quantity > 1 ? <Text style={styles.quantity}>× {item.quantity}</Text> : null}
                      </Pressable>
                      <Pressable accessibilityLabel={`${item.name}を編集`} hitSlop={8} onPress={() => openEdit(item)}><Text style={styles.editMark}>•••</Text></Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal animationType="fade" onRequestClose={() => setFormOpen(false)} transparent visible={formOpen}>
        <SafeAreaView style={styles.backdrop}>
          <Pressable accessibilityLabel="持ち物編集を閉じる" onPress={() => setFormOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.dialog}>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.dialogHeading}>
                <Text style={styles.dialogTitle}>{editingId ? '持ち物を編集' : '持ち物を追加'}</Text>
                <Pressable accessibilityLabel="持ち物編集を閉じる" onPress={() => setFormOpen(false)} style={styles.closeButton}><Text style={styles.close}>×</Text></Pressable>
              </View>
              <Text style={styles.label}>持ち物</Text>
              <TextInput autoFocus maxLength={120} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} placeholder="例：モバイルバッテリー" placeholderTextColor={palette.smoke} style={styles.input} value={draft.name} />
              <Text style={styles.label}>カテゴリー</Text>
              <View style={styles.categoryList}>
                {CATEGORIES.map((category) => <Pressable key={category} onPress={() => setDraft((current) => ({ ...current, category }))} style={[styles.categoryButton, draft.category === category && styles.categorySelected]}><Text style={[styles.categoryText, draft.category === category && styles.categoryTextSelected]}>{category}</Text></Pressable>)}
              </View>
              <Text style={styles.label}>個数</Text>
              <View style={styles.stepper}>
                <Pressable accessibilityLabel="個数を減らす" disabled={draft.quantity <= 1} onPress={() => setDraft((current) => ({ ...current, quantity: Math.max(1, current.quantity - 1) }))} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}><Text style={styles.stepText}>−</Text></Pressable>
                <Text accessibilityLiveRegion="polite" style={styles.stepValue}>{draft.quantity}</Text>
                <Pressable accessibilityLabel="個数を増やす" disabled={draft.quantity >= 99} onPress={() => setDraft((current) => ({ ...current, quantity: Math.min(99, current.quantity + 1) }))} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}><Text style={styles.stepText}>＋</Text></Pressable>
              </View>
              {formError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{formError}</Text> : null}
              <View style={styles.actions}>
                {editingId ? <Pressable onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>削除</Text></Pressable> : <View />}
                <Pressable onPress={save} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}><Text style={styles.saveText}>保存</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 26, paddingBottom: 120 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: { backgroundColor: palette.sky, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
  tagText: { color: palette.ink, fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.5 },
  counter: { color: palette.smoke, fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.5 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginTop: 20 },
  title: { color: palette.ink, fontSize: 48, lineHeight: 52, fontWeight: '900', letterSpacing: -2.4 },
  tripName: { maxWidth: 420, color: palette.slate, fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 3 },
  addButton: { backgroundColor: palette.ink, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 13 },
  addButtonText: { color: palette.paper, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  progressCard: { backgroundColor: palette.ocean, borderRadius: 28, padding: 24, marginTop: 28 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressLabel: { color: palette.paper, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  progressValue: { color: palette.paper, fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -1.5 },
  progressTrack: { height: 10, backgroundColor: 'rgba(250,252,253,0.24)', borderRadius: 999, overflow: 'hidden', marginTop: 18 },
  progressFill: { height: '100%', minWidth: 0, backgroundColor: palette.paper, borderRadius: 999 },
  progressMeta: { color: palette.sky, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 11 },
  empty: { backgroundColor: palette.paper, borderRadius: 28, alignItems: 'center', paddingHorizontal: 28, paddingVertical: 48, marginTop: 24 },
  emptyMark: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sky, marginBottom: 16 },
  emptyMarkText: { color: palette.ink, fontSize: 24, lineHeight: 28, fontWeight: '500' },
  emptyTitle: { color: palette.ink, fontSize: 20, lineHeight: 26, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: palette.slate, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7 },
  groups: { gap: 22, marginTop: 28 },
  group: { gap: 9 },
  groupHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  groupTitle: { color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  groupCount: { color: palette.smoke, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  list: { backgroundColor: palette.paper, borderRadius: 24, paddingHorizontal: 18 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.ash },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: palette.ocean, borderColor: palette.ocean },
  checkText: { color: palette.paper, fontSize: 16, lineHeight: 18, fontWeight: '900' },
  checkTextDone: { color: palette.paper },
  rowCopy: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { flexShrink: 1, color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  itemDone: { color: palette.smoke, textDecorationLine: 'line-through' },
  quantity: { color: palette.smoke, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  editMark: { color: palette.smoke, fontSize: 13, lineHeight: 20, fontWeight: '900', letterSpacing: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(24,42,54,0.48)', justifyContent: 'flex-end', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 680, maxHeight: '88%', backgroundColor: palette.paper, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  form: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 34 },
  dialogHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  dialogTitle: { color: palette.ink, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -1 },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.mist, alignItems: 'center', justifyContent: 'center' },
  close: { color: palette.ink, fontSize: 26, lineHeight: 28 },
  label: { color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: '800', marginBottom: 8, marginTop: 17 },
  input: { minHeight: 52, backgroundColor: palette.mist, borderRadius: 14, color: palette.ink, fontSize: 16, lineHeight: 22, paddingHorizontal: 16, paddingVertical: 14 },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryButton: { backgroundColor: palette.mist, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  categorySelected: { backgroundColor: palette.ocean },
  categoryText: { color: palette.slate, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  categoryTextSelected: { color: palette.paper },
  stepper: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: palette.mist, borderRadius: 14, padding: 4 },
  stepButton: { width: 44, height: 44, borderRadius: 11, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: palette.ink, fontSize: 24, lineHeight: 26, fontWeight: '600' },
  stepValue: { minWidth: 54, color: palette.ink, fontSize: 19, lineHeight: 24, fontWeight: '900', textAlign: 'center' },
  error: { color: palette.danger, fontSize: 13, lineHeight: 19, marginTop: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30 },
  deleteButton: { paddingHorizontal: 8, paddingVertical: 13 },
  deleteText: { color: palette.danger, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  saveButton: { minWidth: 112, backgroundColor: palette.ink, borderRadius: 8, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 15 },
  saveText: { color: palette.paper, fontSize: 15, lineHeight: 19, fontWeight: '800' },
  pressed: { opacity: 0.62 },
});
