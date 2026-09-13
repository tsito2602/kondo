import type { TripMember } from './types';
export const memberAssignee = (id: string) => `member:${id}`;
export const assignedMember = (value: string, members: TripMember[]) => value.startsWith('member:') ? members.find((member) => member.id === value.slice(7)) : undefined;
export const assigneeName = (value: string, members: TripMember[]) => {
  if (!value) return '未指定';
  if (!value.startsWith('member:')) return value;
  const member = assignedMember(value, members);
  return member ? member.name || member.email : 'メンバー（未取得・退出済み）';
};
