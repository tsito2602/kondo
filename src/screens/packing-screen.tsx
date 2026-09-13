import { PageHeading } from '@/components/page-heading';
import { useToast } from '@/components/toast';
import { useTripHeaderHeight } from '@/components/trip-header-context';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormSheet } from '@/components/form-sheet';
import { localDate } from '@/utils/dates';
import { DateRangePicker } from '@/components/date-range-picker';
import { FloatingAddButton } from '@/components/floating-add-button';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';
import { PackingItem, TravelTask } from '@/data/types';
import { confirmDeletion } from '@/utils/confirm-deletion';

const CATEGORIES = ['衣類', '洗面・衛生', '電子機器', '書類', '薬', 'その他'];
const today = localDate();

type Mode = 'tasks' | 'packing';
type PackingDraft = Pick<PackingItem, 'name' | 'category' | 'quantity' | 'packed'>;
type TaskDraft = Pick<TravelTask, 'title' | 'dueOn' | 'assignee' | 'done'>;

const blankPackingDraft = (): PackingDraft => ({ name: '', category: CATEGORIES[0], quantity: 1, packed: false });
const blankTaskDraft = (): TaskDraft => ({ title: '', dueOn: '', assignee: '', done: false });

export default function PackingScreen() {
  const toast = useToast();
  const headerHeight = useTripHeaderHeight();
  const {
    canEdit,
    createPackingItem,
    createTask,
    deletePackingItem,
    deleteTask,
    packingItems,
    selectedTrip,
    tasks,
    updatePackingItem,
    updateTask,
  } = useTravel();
  const [initialDraft, setInitialDraft] = useState('');
  const [mode, setMode] = useState<Mode>('tasks');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [packingDraft, setPackingDraft] = useState<PackingDraft>(blankPackingDraft);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(blankTaskDraft);
  const [hasDueDate, setHasDueDate] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const isTasks = mode === 'tasks';
  const packedCount = packingItems.filter((item) => item.packed).length;
  const doneCount = tasks.filter((task) => task.done).length;
  const activeTotal = isTasks ? tasks.length : packingItems.length;
  const activeDone = isTasks ? doneCount : packedCount;
  const progress = activeTotal ? activeDone / activeTotal : 0;
  const taskGroups = useMemo(() => [
    { label: '未完了', items: tasks.filter((task) => !task.done) },
    { label: '完了済み', items: tasks.filter((task) => task.done) },
  ].filter((group) => group.items.length), [tasks]);
  const packingGroups = useMemo(() => CATEGORIES.map((category) => ({
    category,
    items: packingItems.filter((item) => item.category === category),
  })).filter((group) => group.items.length), [packingItems]);

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setFormOpen(false);
    setEditingId(null);
    setFormError('');
  };

  const openCreate = () => {
    setInitialDraft(JSON.stringify(isTasks ? [blankTaskDraft(), false] : blankPackingDraft()));
    setEditingId(null);
    setPackingDraft(blankPackingDraft());
    setTaskDraft(blankTaskDraft());
    setHasDueDate(false);
    setFormError('');
    setFormOpen(true);
  };

  const openPackingEdit = (item: PackingItem) => {
    setEditingId(item.id);
    const draft = { name: item.name, category: item.category, quantity: item.quantity, packed: item.packed };
    setInitialDraft(JSON.stringify(draft));
    setPackingDraft(draft);
    setFormError('');
    setFormOpen(true);
  };

  const openTaskEdit = (task: TravelTask) => {
    setEditingId(task.id);
    const draft = { title: task.title, dueOn: task.dueOn, assignee: task.assignee, done: task.done };
    setInitialDraft(JSON.stringify([draft, Boolean(task.dueOn)]));
    setTaskDraft(draft);
    setHasDueDate(Boolean(task.dueOn));
    setFormError('');
    setFormOpen(true);
  };

  const save = () => {
    if (isTasks) {
      if (!taskDraft.title.trim()) {
        setFormError('やることを入力してください。');
        return;
      }
      const input = {
        ...taskDraft,
        title: taskDraft.title.trim(),
        dueOn: hasDueDate ? (taskDraft.dueOn || today) : '',
        assignee: taskDraft.assignee.trim(),
      };
      if (editingId) updateTask(editingId, input);
      else createTask(input);
    } else {
      if (!packingDraft.name.trim()) {
        setFormError('持ち物の名前を入力してください。');
        return;
      }
      const input = { ...packingDraft, name: packingDraft.name.trim() };
      if (editingId) updatePackingItem(editingId, input);
      else createPackingItem(input);
    }
    setFormOpen(false); toast(isTasks ? 'やることを保存しました' : '持ち物を保存しました');
  };

  const remove = () => {
    if (!editingId) return;
    const target = isTasks ? 'やること' : '持ち物';
    confirmDeletion(`${target}を削除しますか？`, 'この操作は取り消せません。', () => {
      if (isTasks) deleteTask(editingId);
      else deletePackingItem(editingId);
      setFormOpen(false);
    });
  };

  const togglePacking = (item: PackingItem) => updatePackingItem(item.id, {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    packed: !item.packed,
  });

  const toggleTask = (task: TravelTask) => updateTask(task.id, {
    title: task.title,
    dueOn: task.dueOn,
    assignee: task.assignee,
    done: !task.done,
  });

  const renderTask = (task: TravelTask, index: number) => {
    const metadata = [task.dueOn ? `期限 ${task.dueOn.replaceAll('-', '/')}` : '', task.assignee]
      .filter(Boolean)
      .join(' ・ ');
    return (
      <View key={task.id} style={[styles.row, index > 0 && styles.rowBorder]}>
        <Pressable
          accessibilityLabel={`${task.title}を${task.done ? '未完了' : '完了'}にする`}
          accessibilityRole="checkbox"
          aria-checked={task.done}
          hitSlop={8}
          disabled={!canEdit} onPress={() => toggleTask(task)}
          style={[styles.check, task.done && styles.checkDone]}>
          <Text style={[styles.checkText, task.done && styles.checkTextDone]}>{task.done ? '✓' : ''}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${task.title}を編集`} disabled={!canEdit} onPress={() => openTaskEdit(task)} style={({ pressed }) => [styles.rowCopy, pressed && styles.pressed]}>
          <View style={styles.itemCopy}>
            <Text style={[styles.itemName, task.done && styles.itemDone]}>{task.title}</Text>
            {metadata ? <Text style={styles.itemMeta}>{metadata}</Text> : null}
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${task.title}を編集`} hitSlop={8} disabled={!canEdit} onPress={() => openTaskEdit(task)}><Text style={styles.editMark}>•••</Text></Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView edges={[]} style={styles.safeArea}>
      <ScrollView testID="packing-scroll" contentContainerStyle={[styles.content, { paddingTop: headerHeight + 20 }]} showsVerticalScrollIndicator={false}>
      <PageHeading title="準備" />
        <View testID="preparation-tabs" accessibilityRole="tablist" style={styles.segmented}>
          <Pressable
            accessibilityRole="tab"
            aria-selected={isTasks}
            onPress={() => changeMode('tasks')}
            style={[styles.segment, isTasks && styles.segmentSelected]}>
            <Text style={[styles.segmentText, isTasks && styles.segmentTextSelected]}>やること {tasks.filter((task) => !task.done).length}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            aria-selected={!isTasks}
            onPress={() => changeMode('packing')}
            style={[styles.segment, !isTasks && styles.segmentSelected]}>
            <Text style={[styles.segmentText, !isTasks && styles.segmentTextSelected]}>持ち物 {packingItems.filter((item) => !item.packed).length}</Text>
          </Pressable>
        </View>

        {selectedTrip && activeTotal ? (
          <View testID="preparation-progress" style={styles.progressCard}>
            <View style={styles.progressCopy}>
              <Text style={styles.progressLabel}>{isTasks ? '完了したこと' : 'バッグに入れたもの'}</Text>
              <Text style={styles.progressValue}>{Math.round(progress * 100)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressMeta}>{activeDone}件完了・残り{activeTotal - activeDone}件</Text>
          </View>
        ) : null}

        {!selectedTrip ? (
          <View style={styles.empty}><Text style={styles.emptyTitle}>旅行を作成してください</Text><Text style={styles.emptyBody}>準備は選択中の旅行ごとに保存されます。</Text></View>
        ) : isTasks && tasks.length === 0 ? (
          <Pressable accessibilityRole="button" disabled={!canEdit} onPress={openCreate} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
            <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
            <Text style={styles.emptyTitle}>やることはまだありません</Text>
            <Text style={styles.emptyBody}>＋ やることを追加</Text>
          </Pressable>
        ) : !isTasks && packingItems.length === 0 ? (
          <Pressable accessibilityRole="button" disabled={!canEdit} onPress={openCreate} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
            <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>＋</Text></View>
            <Text style={styles.emptyTitle}>最初の持ち物を追加</Text>
            <Text style={styles.emptyBody}>＋ 持ち物を追加</Text>
          </Pressable>
        ) : isTasks ? (
          <View testID="preparation-groups" style={styles.groups}>
            {taskGroups.map((group) => (
              <View key={group.label} style={styles.group}>
                <View style={styles.groupHeading}>
                  <Text style={styles.groupTitle}>{group.label}</Text>
                  <Text style={styles.groupCount}>{group.items.length}</Text>
                </View>
                <View style={styles.list}>{group.items.map(renderTask)}</View>
              </View>
            ))}
          </View>
        ) : (
          <View testID="preparation-groups" style={styles.groups}>
            {packingGroups.map((group) => (
              <View key={group.category} style={styles.group}>
                <View style={styles.groupHeading}>
                  <Text style={styles.groupTitle}>{group.category}</Text>
                  <Text style={styles.groupCount}>{group.items.filter((item) => item.packed).length}/{group.items.length}</Text>
                </View>
                <View style={styles.list}>
                  {group.items.map((item, index) => (
                    <View key={item.id} style={[styles.row, index > 0 && styles.rowBorder]}>
                      <Pressable accessibilityLabel={`${item.name}を${item.packed ? '未準備' : '準備済み'}にする`} accessibilityRole="checkbox" aria-checked={item.packed} hitSlop={8} disabled={!canEdit} onPress={() => togglePacking(item)} style={[styles.check, item.packed && styles.checkDone]}>
                        <Text style={[styles.checkText, item.packed && styles.checkTextDone]}>{item.packed ? '✓' : ''}</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}を編集`} disabled={!canEdit} onPress={() => openPackingEdit(item)} style={({ pressed }) => [styles.rowCopy, pressed && styles.pressed]}>
                        <Text style={[styles.itemName, item.packed && styles.itemDone]}>{item.name}</Text>
                        {item.quantity > 1 ? <Text style={styles.quantity}>× {item.quantity}</Text> : null}
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}を編集`} hitSlop={8} disabled={!canEdit} onPress={() => openPackingEdit(item)}><Text style={styles.editMark}>•••</Text></Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {selectedTrip && canEdit ? <FloatingAddButton label={isTasks ? 'やることを追加する' : '持ち物を追加する'} onPress={openCreate} /> : null}

      <FormSheet visible={formOpen} title={editingId ? (isTasks ? 'やることを編集' : '持ち物を編集') : (isTasks ? 'やることを追加' : '持ち物を追加')} onClose={() => setFormOpen(false)} onSave={canEdit ? save : undefined} canSave={Boolean(isTasks ? taskDraft.title.trim() : packingDraft.name.trim())} dirty={JSON.stringify(isTasks ? [taskDraft, hasDueDate] : packingDraft) !== initialDraft} error={formError}>
              {isTasks ? (
                <>
                  <Text style={styles.label}>やること</Text>
                  <TextInput accessibilityLabel="やること" autoFocus maxLength={160} onChangeText={(title) => setTaskDraft((current) => ({ ...current, title }))} placeholder="例：eSIMを用意する" placeholderTextColor={palette.placeholder} style={styles.input} value={taskDraft.title} />
                  <Pressable accessibilityRole="checkbox" aria-checked={hasDueDate} onPress={() => setHasDueDate((current) => !current)} style={styles.optionalToggle}>
                    <View style={[styles.miniCheck, hasDueDate && styles.miniCheckSelected]}>{hasDueDate ? <Text style={styles.miniCheckText}>✓</Text> : null}</View>
                    <Text style={styles.optionalToggleText}>期限を設定する</Text>
                  </Pressable>
                  {hasDueDate ? (
                    <DateRangePicker
                      endDate={taskDraft.dueOn || today}
                      label="期限"
                      mode="single"
                      onChange={(range) => setTaskDraft((current) => ({ ...current, dueOn: range.startDate }))}
                      startDate={taskDraft.dueOn || today}
                    />
                  ) : null}
                  <Text style={styles.label}>担当（任意）</Text>
                  <TextInput accessibilityLabel="担当" maxLength={80} onChangeText={(assignee) => setTaskDraft((current) => ({ ...current, assignee }))} placeholder="名前を入力" placeholderTextColor={palette.placeholder} style={styles.input} value={taskDraft.assignee} />
                </>
              ) : (
                <>
                  <Text style={styles.label}>持ち物</Text>
                  <TextInput accessibilityLabel="持ち物" autoFocus maxLength={120} onChangeText={(name) => setPackingDraft((current) => ({ ...current, name }))} placeholder="例：モバイルバッテリー" placeholderTextColor={palette.placeholder} style={styles.input} value={packingDraft.name} />
                  <Text style={styles.label}>カテゴリー</Text>
                  <View style={styles.categoryList}>
                    {CATEGORIES.map((category) => <Pressable accessibilityRole="button" key={category} onPress={() => setPackingDraft((current) => ({ ...current, category }))} style={[styles.categoryButton, packingDraft.category === category && styles.categorySelected]}><Text style={[styles.categoryText, packingDraft.category === category && styles.categoryTextSelected]}>{category}</Text></Pressable>)}
                  </View>
                  <Text style={styles.label}>個数</Text>
                  <View style={styles.stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel="個数を減らす" disabled={packingDraft.quantity <= 1} onPress={() => setPackingDraft((current) => ({ ...current, quantity: Math.max(1, current.quantity - 1) }))} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}><Text style={styles.stepText}>−</Text></Pressable>
                    <Text accessibilityLiveRegion="polite" style={styles.stepValue}>{packingDraft.quantity}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="個数を増やす" disabled={packingDraft.quantity >= 99} onPress={() => setPackingDraft((current) => ({ ...current, quantity: Math.min(99, current.quantity + 1) }))} style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}><Text style={styles.stepText}>＋</Text></Pressable>
                  </View>
                </>
              )}

        {editingId && canEdit ? <Pressable accessibilityRole="button" onPress={remove} style={styles.deleteButton}><Text style={styles.deleteText}>削除</Text></Pressable> : null}
      </FormSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 112 },
  segmented: { flexDirection: 'row', backgroundColor: palette.sky, borderRadius: 14, padding: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: palette.paper },
  segmentText: { color: palette.slate, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  segmentTextSelected: { color: palette.ink, fontWeight: '900' },
  progressCard: { backgroundColor: palette.sky, borderRadius: 28, padding: 24, marginTop: 18 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressLabel: { color: palette.ink, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  progressValue: { color: palette.ink, fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -1.5 },
  progressTrack: { height: 10, backgroundColor: palette.paper, borderRadius: 999, overflow: 'hidden', marginTop: 18 },
  progressFill: { height: '100%', minWidth: 0, backgroundColor: palette.accent, borderRadius: 999 },
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
  itemCopy: { flex: 1, paddingVertical: 10 },
  itemName: { flexShrink: 1, color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  itemDone: { color: palette.smoke, textDecorationLine: 'line-through' },
  itemMeta: { color: palette.smoke, fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 2 },
  quantity: { color: palette.smoke, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  editMark: { color: palette.smoke, fontSize: 13, lineHeight: 20, fontWeight: '900', letterSpacing: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(24,42,54,0.48)', justifyContent: 'flex-end', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 680, maxHeight: '88%', backgroundColor: palette.paper, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  form: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 34 },
  dialogHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  dialogTitle: { color: palette.ink, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -1 },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.mist, alignItems: 'center', justifyContent: 'center' },
  close: { color: palette.ink, fontSize: 26, lineHeight: 28 },
  label: { color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: '800', marginBottom: 8, marginTop: 17 },
  input: { minHeight: 52, backgroundColor: palette.mist, borderRadius: 14, color: palette.ink, fontSize: 16, lineHeight: 22, paddingHorizontal: 16, paddingVertical: 14 },
  optionalToggle: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18 },
  miniCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  miniCheckSelected: { backgroundColor: palette.ocean, borderColor: palette.ocean },
  miniCheckText: { color: palette.paper, fontSize: 12, lineHeight: 14, fontWeight: '900' },
  optionalToggleText: { color: palette.slate, fontSize: 14, lineHeight: 19, fontWeight: '700' },
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
