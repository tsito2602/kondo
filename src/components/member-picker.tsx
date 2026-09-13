import { Pressable, Text, View } from 'react-native';
import { palette } from '@/constants/design';
import type { TripMember } from '@/data/types';
import { assigneeName, memberAssignee } from '@/data/assignee';
import { MemberAvatar } from './member-avatar';

export function MemberPicker({ value, members, onChange }: { value: string; members: TripMember[]; onChange: (value: string) => void }) {
  const options = [{ value: '', name: '未指定', avatarUrl: null }, ...members.map((member) => ({ value: memberAssignee(member.id), name: member.name || member.email, avatarUrl: member.avatarUrl }))];
  if (value && !options.some((option) => option.value === value)) options.push({ value, name: assigneeName(value, members), avatarUrl: null });
  return <View accessibilityRole="radiogroup" accessibilityLabel="担当" style={{ gap: 6 }}>
    {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.name} aria-checked={value === option.value} onPress={() => onChange(option.value)} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, backgroundColor: value === option.value ? palette.sky : palette.paper }}>
      {option.value ? <MemberAvatar name={option.name} avatarUrl={option.avatarUrl} size={32} /> : <View style={{ width: 32, alignItems: 'center' }}><Text style={{ color: palette.smoke }}>—</Text></View>}
      <Text style={{ flex: 1, color: palette.ink, fontSize: 14 }}>{option.name}</Text>
      {value === option.value ? <Text style={{ color: palette.ocean, fontWeight: '700' }}>✓</Text> : null}
    </Pressable>)}
    {!members.length ? <Text style={{ color: palette.slate, fontSize: 12 }}>オンラインでメンバーを読み込むと担当を選べます。</Text> : null}
  </View>;
}
