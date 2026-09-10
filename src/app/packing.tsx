import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type PreparationTab = 'tasks' | 'packing';

type PreparationItem = {
  id: number;
  label: string;
  owner: string;
  done: boolean;
  due?: string;
};

const initialTasks: PreparationItem[] = [];

const initialPackingItems: PreparationItem[] = [
  { id: 11, label: 'パスポート', owner: 'ふたり', done: true },
  { id: 12, label: 'モバイルバッテリー', owner: 'つばさ', done: true },
  { id: 13, label: '折りたたみ傘', owner: 'みさき', done: false },
  { id: 14, label: '常備薬', owner: 'つばさ', done: false },
  { id: 15, label: '日焼け止め', owner: 'みさき', done: false },
  { id: 16, label: '免許証', owner: 'つばさ', done: true },
];

const taskHints = ['休暇を申請する', 'eSIMを用意する', '両替する', 'ペットの預け先を決める'];
const owners = ['未設定', 'つばさ', 'みさき', 'ふたり'];

export default function PackingScreen() {
  const [activeTab, setActiveTab] = useState<PreparationTab>('tasks');
  const [tasks, setTasks] = useState(initialTasks);
  const [packingItems, setPackingItems] = useState(initialPackingItems);
  const [newItem, setNewItem] = useState('');
  const [due, setDue] = useState('');
  const [owner, setOwner] = useState('未設定');
  const [showDetails, setShowDetails] = useState(false);

  const items = activeTab === 'tasks' ? tasks : packingItems;
  const completed = items.filter((item) => item.done).length;
  const incompleteItems = useMemo(() => items.filter((item) => !item.done), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.done), [items]);
  const progress = items.length === 0 ? 0 : (completed / items.length) * 100;
  const isTasks = activeTab === 'tasks';
  const availableTaskHints = taskHints.filter(
    (hint) => !tasks.some((task) => task.label === hint),
  );

  const updateItems = (updater: (current: PreparationItem[]) => PreparationItem[]) => {
    if (isTasks) {
      setTasks(updater);
    } else {
      setPackingItems(updater);
    }
  };

  const changeTab = (tab: PreparationTab) => {
    setActiveTab(tab);
    setNewItem('');
    setDue('');
    setOwner(tab === 'tasks' ? '未設定' : 'ふたり');
    setShowDetails(false);
  };

  const addItem = () => {
    const label = newItem.trim();
    if (!label) return;

    updateItems((current) => [
      ...current,
      {
        id: Date.now(),
        label,
        owner: isTasks ? owner : 'ふたり',
        due: isTasks && due.trim() ? due.trim() : undefined,
        done: false,
      },
    ]);
    setNewItem('');
    setDue('');
    setOwner(isTasks ? '未設定' : 'ふたり');
    setShowDetails(false);
  };

  const toggleItem = (id: number) => {
    updateItems((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, done: !entry.done } : entry)),
    );
  };

  const renderItem = (item: PreparationItem) => {
    const metadata = [item.due ? `期限 ${item.due}` : '', item.owner !== '未設定' ? item.owner : '']
      .filter(Boolean)
      .join(' ・ ');

    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}
        key={item.id}
        onPress={() => toggleItem(item.id)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
          {item.done && <Text style={styles.check}>✓</Text>}
        </View>
        <View style={styles.itemCopy}>
          <Text style={[styles.itemLabel, item.done && styles.itemDone]}>{item.label}</Text>
          {!!metadata && <Text style={styles.metadata}>{metadata}</Text>}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>出発前</Text>
        <Text style={styles.title}>旅の準備</Text>

        <View accessibilityRole="tablist" style={styles.segmentedControl}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isTasks }}
            onPress={() => changeTab('tasks')}
            style={[styles.segment, isTasks && styles.segmentActive]}>
            <Text style={[styles.segmentText, isTasks && styles.segmentTextActive]}>
              やること {tasks.filter((item) => !item.done).length}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: !isTasks }}
            onPress={() => changeTab('packing')}
            style={[styles.segment, !isTasks && styles.segmentActive]}>
            <Text style={[styles.segmentText, !isTasks && styles.segmentTextActive]}>
              持ち物 {packingItems.filter((item) => !item.done).length}
            </Text>
          </Pressable>
        </View>

        {items.length > 0 && (
          <View style={styles.progressCard}>
            <View style={styles.progressCopy}>
              <Text style={styles.progressValue}>{completed} / {items.length}</Text>
              <Text style={styles.progressLabel}>{isTasks ? '完了したこと' : 'バッグに入れたもの'}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          </View>
        )}

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{isTasks ? 'やることはありません' : '持ち物はありません'}</Text>
            <Text style={styles.emptyText}>
              {isTasks ? '必要になったときだけ追加できます。' : '持っていくものを追加してください。'}
            </Text>
          </View>
        ) : (
          <>
            {incompleteItems.length > 0 && <View style={styles.list}>{incompleteItems.map(renderItem)}</View>}
            {completedItems.length > 0 && (
              <View style={styles.completedSection}>
                <Text style={styles.sectionLabel}>完了済み</Text>
                <View style={styles.list}>{completedItems.map(renderItem)}</View>
              </View>
            )}
          </>
        )}

        <View style={styles.addSection}>
          <View style={styles.addRow}>
            <TextInput
              accessibilityLabel={isTasks ? '新しいやること' : '新しい持ち物'}
              onChangeText={setNewItem}
              onSubmitEditing={addItem}
              placeholder={isTasks ? 'やることを追加' : '持ち物を追加'}
              placeholderTextColor="#929892"
              returnKeyType="done"
              style={styles.input}
              value={newItem}
            />
            <Pressable
              accessibilityLabel={isTasks ? 'やることを追加する' : '持ち物を追加する'}
              disabled={!newItem.trim()}
              onPress={addItem}
              style={({ pressed }) => [
                styles.addButton,
                !newItem.trim() && styles.addButtonDisabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.addButtonText}>＋</Text>
            </Pressable>
          </View>

          {isTasks && (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowDetails((current) => !current)}
                style={styles.detailsToggle}>
                <Text style={styles.detailsToggleText}>{showDetails ? '詳細を閉じる' : '期限・担当を追加'}</Text>
              </Pressable>

              {showDetails && (
                <View style={styles.detailsPanel}>
                  <TextInput
                    accessibilityLabel="期限"
                    onChangeText={setDue}
                    placeholder="期限（任意） 例 11/20"
                    placeholderTextColor="#929892"
                    style={styles.detailInput}
                    value={due}
                  />
                  <Text style={styles.fieldLabel}>担当</Text>
                  <View style={styles.ownerChoices}>
                    {owners.map((entry) => (
                      <Pressable
                        key={entry}
                        onPress={() => setOwner(entry)}
                        style={[styles.ownerChoice, owner === entry && styles.ownerChoiceActive]}>
                        <Text style={[styles.ownerChoiceText, owner === entry && styles.ownerChoiceTextActive]}>
                          {entry}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {availableTaskHints.length > 0 && (
                <View style={styles.hintsSection}>
                  <Text style={styles.hintsLabel}>入力候補</Text>
                  <View style={styles.hints}>
                    {availableTaskHints.map((hint) => (
                    <Pressable
                      accessibilityLabel={`${hint}を入力する`}
                      key={hint}
                      onPress={() => setNewItem(hint)}
                      style={({ pressed }) => [styles.hint, pressed && styles.pressed]}>
                      <Text style={styles.hintText}>{hint}</Text>
                    </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F4EF' },
  content: { padding: 20, paddingBottom: 120 },
  eyebrow: { color: '#C65338', fontSize: 13, fontWeight: '800' },
  title: { color: '#20332C', fontSize: 31, fontWeight: '800', marginTop: 6, letterSpacing: -0.7 },
  segmentedControl: {
    backgroundColor: '#E9E5DC',
    borderRadius: 16,
    flexDirection: 'row',
    marginTop: 20,
    padding: 4,
  },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segmentActive: { backgroundColor: '#FFFFFF' },
  segmentText: { color: '#777E78', fontSize: 14, fontWeight: '700' },
  segmentTextActive: { color: '#20332C' },
  progressCard: { backgroundColor: '#2F5A4E', borderRadius: 22, padding: 20, marginTop: 14, marginBottom: 16 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  progressLabel: { color: '#C8DAD3', fontSize: 13 },
  progressTrack: { height: 8, backgroundColor: '#496E64', borderRadius: 4, overflow: 'hidden', marginTop: 16 },
  progressFill: { height: '100%', backgroundColor: '#F2D095', borderRadius: 4 },
  list: { backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 17, overflow: 'hidden' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ECE9E2' },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#B7BDB8', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: '#D56B4B', borderColor: '#D56B4B' },
  check: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  itemCopy: { marginLeft: 13, flex: 1, paddingVertical: 14 },
  itemLabel: { color: '#20332C', fontSize: 15, fontWeight: '700' },
  itemDone: { color: '#9AA09B', textDecorationLine: 'line-through' },
  metadata: { color: '#8A908B', fontSize: 12, marginTop: 4 },
  completedSection: { marginTop: 20 },
  sectionLabel: { color: '#858C86', fontSize: 12, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  emptyState: { backgroundColor: '#FFFFFF', borderRadius: 22, alignItems: 'center', paddingHorizontal: 28, paddingVertical: 42 },
  emptyTitle: { color: '#20332C', fontSize: 16, fontWeight: '800' },
  emptyText: { color: '#858C86', fontSize: 13, marginTop: 7, textAlign: 'center' },
  addSection: { marginTop: 16 },
  addRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, minHeight: 52, borderRadius: 17, backgroundColor: '#FFFFFF', color: '#20332C', fontSize: 15, paddingHorizontal: 16 },
  addButton: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#D56B4B', alignItems: 'center', justifyContent: 'center' },
  addButtonDisabled: { backgroundColor: '#C9C7C0' },
  addButtonText: { color: '#FFFFFF', fontSize: 24, fontWeight: '500' },
  detailsToggle: { alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 3 },
  detailsToggleText: { color: '#596D65', fontSize: 13, fontWeight: '700' },
  detailsPanel: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 16 },
  detailInput: { minHeight: 46, borderRadius: 13, backgroundColor: '#F4F2ED', color: '#20332C', fontSize: 14, paddingHorizontal: 14 },
  fieldLabel: { color: '#858C86', fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  ownerChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ownerChoice: { backgroundColor: '#F0EEE8', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  ownerChoiceActive: { backgroundColor: '#2F5A4E' },
  ownerChoiceText: { color: '#667069', fontSize: 12, fontWeight: '700' },
  ownerChoiceTextActive: { color: '#FFFFFF' },
  hintsSection: { marginTop: 4 },
  hintsLabel: { color: '#858C86', fontSize: 12, fontWeight: '700', marginBottom: 9, marginLeft: 3 },
  hints: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { backgroundColor: '#EDE9E0', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  hintText: { color: '#596760', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
