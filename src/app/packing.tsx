import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>出発前の準備</Text>
        <Text style={styles.title}>持ち物</Text>
        <View style={styles.progressCard}>
          <View style={styles.progressCopy}>
            <Text style={styles.progressValue}>{completed} / {items.length}</Text>
            <Text style={styles.progressLabel}>準備できたもの</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(completed / items.length) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              key={item.id}
              onPress={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
                {item.done && <Text style={styles.check}>✓</Text>}
              </View>
              <View style={styles.itemCopy}>
                <Text style={[styles.itemLabel, item.done && styles.itemDone]}>{item.label}</Text>
                <Text style={styles.owner}>{item.owner}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <View style={styles.addRow}>
          <TextInput
            accessibilityLabel="新しい持ち物"
            onChangeText={setNewItem}
            onSubmitEditing={() => {
              if (!newItem.trim()) return;
              setItems((current) => [...current, { id: Date.now(), label: newItem.trim(), owner: 'ふたり', done: false }]);
              setNewItem('');
            }}
            placeholder="持ち物を追加"
            placeholderTextColor="#929892"
            returnKeyType="done"
            style={styles.input}
            value={newItem}
          />
          <Pressable
            accessibilityLabel="持ち物を追加する"
            onPress={() => {
              if (!newItem.trim()) return;
              setItems((current) => [...current, { id: Date.now(), label: newItem.trim(), owner: 'ふたり', done: false }]);
              setNewItem('');
            }}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Text style={styles.addButtonText}>＋</Text>
          </Pressable>
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
  progressCard: { backgroundColor: '#2F5A4E', borderRadius: 22, padding: 20, marginTop: 22, marginBottom: 16 },
  progressCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  progressLabel: { color: '#C8DAD3', fontSize: 13 },
  progressTrack: { height: 8, backgroundColor: '#496E64', borderRadius: 4, overflow: 'hidden', marginTop: 16 },
  progressFill: { height: '100%', backgroundColor: '#F2D095', borderRadius: 4 },
  list: { backgroundColor: '#FFFFFF', borderRadius: 22, paddingHorizontal: 17 },
  row: { minHeight: 74, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ECE9E2' },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#B7BDB8', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: '#D56B4B', borderColor: '#D56B4B' },
  check: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  itemCopy: { marginLeft: 13, flex: 1 },
  itemLabel: { color: '#20332C', fontSize: 15, fontWeight: '700' },
  itemDone: { color: '#9AA09B', textDecorationLine: 'line-through' },
  owner: { color: '#8A908B', fontSize: 12, marginTop: 4 },
  addRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  input: { flex: 1, minHeight: 52, borderRadius: 17, backgroundColor: '#FFFFFF', color: '#20332C', fontSize: 15, paddingHorizontal: 16 },
  addButton: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#D56B4B', alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#FFFFFF', fontSize: 24, fontWeight: '500' },
  pressed: { opacity: 0.65 },
});
