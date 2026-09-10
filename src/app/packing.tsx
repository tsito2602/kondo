import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/design';

const initialItems = [
  { id: 1, label: '航空券・予約確認', owner: 'ふたり', done: true },
  { id: 2, label: 'モバイルバッテリー', owner: 'つばさ', done: true },
  { id: 3, label: '折りたたみ傘', owner: 'みさき', done: false },
  { id: 4, label: '常備薬', owner: 'つばさ', done: false },
  { id: 5, label: '日焼け止め', owner: 'みさき', done: false },
  { id: 6, label: 'レンタカー免許証', owner: 'つばさ', done: true },
];

export default function PackingScreen() {
  const [items, setItems] = useState(initialItems);
  const [newItem, setNewItem] = useState('');
  const completed = items.filter((item) => item.done).length;

  const addItem = () => {
    if (!newItem.trim()) return;
    setItems((current) => [...current, { id: Date.now(), label: newItem.trim(), owner: 'ふたり', done: false }]);
    setNewItem('');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headingRow}>
          <View style={styles.tag}><Text style={styles.tagText}>PACKING</Text></View>
          <Text style={styles.counter}>{String(items.length - completed).padStart(2, '0')} LEFT</Text>
        </View>
        <Text style={styles.title}>持ち物</Text>

        <View style={styles.progressCard}>
          <View style={styles.progressCopy}>
            <Text style={styles.progressValue}>{completed}/{items.length}</Text>
            <Text style={styles.progressLabel}>準備済み</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${items.length ? (completed / items.length) * 100 : 0}%` }]} />
          </View>
        </View>

        <View style={styles.list}>
          {items.map((item, index) => (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              key={item.id}
              onPress={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}
              style={({ pressed }) => [styles.row, index === items.length - 1 && styles.lastRow, pressed && styles.pressed]}>
              <View style={[styles.checkbox, item.done && styles.checkboxDone]}>{item.done && <Text style={styles.check}>✓</Text>}</View>
              <View style={styles.itemCopy}>
                <Text style={[styles.itemLabel, item.done && styles.itemDone]}>{item.label}</Text>
                <Text style={styles.owner}>{item.owner}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.addRow}>
          <TextInput accessibilityLabel="新しい持ち物" onChangeText={setNewItem} onSubmitEditing={addItem} placeholder="持ち物を追加" placeholderTextColor={palette.smoke} returnKeyType="done" style={styles.input} value={newItem} />
          <Pressable accessibilityLabel="持ち物を追加する" onPress={addItem} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><Text style={styles.addButtonText}>＋</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 20, paddingBottom: 120 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tag: { backgroundColor: palette.sky, borderRadius: 64, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { color: palette.ink, fontFamily: 'monospace', fontSize: 10 },
  counter: { color: palette.slate, fontFamily: 'monospace', fontSize: 11 },
  title: { color: palette.ink, fontSize: 42, lineHeight: 42, fontWeight: '900', letterSpacing: -1.5, marginTop: 8 },
  progressCard: { backgroundColor: palette.sky, borderRadius: 32, padding: 24, marginTop: 24, marginBottom: 16 },
  progressCopy: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  progressValue: { color: palette.ink, fontSize: 40, lineHeight: 40, fontWeight: '900', letterSpacing: -1.6 },
  progressLabel: { color: palette.slate, fontSize: 13 },
  progressTrack: { height: 8, backgroundColor: palette.paper, borderRadius: 4, overflow: 'hidden', marginTop: 20 },
  progressFill: { height: '100%', backgroundColor: palette.coral, borderRadius: 4 },
  list: { backgroundColor: palette.paper, borderRadius: 32, paddingHorizontal: 20 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.ash },
  lastRow: { borderBottomWidth: 0 },
  checkbox: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: palette.ocean, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: palette.sky, borderColor: palette.ocean },
  check: { color: palette.ink, fontSize: 16, fontWeight: '900' },
  itemCopy: { marginLeft: 14, flex: 1 },
  itemLabel: { color: palette.ink, fontSize: 16, fontWeight: '700' },
  itemDone: { color: palette.smoke, textDecorationLine: 'line-through' },
  owner: { color: palette.slate, fontFamily: 'monospace', fontSize: 10, marginTop: 4 },
  addRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  input: { flex: 1, minHeight: 52, borderRadius: 8, backgroundColor: palette.paper, color: palette.ink, fontSize: 15, paddingHorizontal: 16 },
  addButton: { width: 52, height: 52, borderRadius: 8, backgroundColor: palette.ocean, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: palette.paper, fontSize: 24, fontWeight: '700' },
  pressed: { opacity: 0.62 },
});
