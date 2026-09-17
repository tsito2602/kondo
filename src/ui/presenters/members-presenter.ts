import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/auth/auth-provider';
import { useToast } from '@/components/toast';
import { useTravel } from '@/data/travel-provider';
import type { TripMember } from '@/data/types';
import { useUiPlatform } from '@/ui/platform';

export type MemberConfirmation = TripMember | 'invites' | null;

export function useMembersPresenter() {
  const { selectedTrip, members: sourceMembers, createInvite, sync, syncing, error: syncError } = useTravel();
  const { request, isDemo, user } = useAuth();
  const toast = useToast();
  const platform = useUiPlatform();
  const tripId = selectedTrip?.id;
  const owner = selectedTrip?.role === 'owner';
  const [members, setMembers] = useState(sourceMembers);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [invite, setInvite] = useState('');
  const [confirm, setConfirm] = useState<MemberConfirmation>(null);
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => setMembers(sourceMembers), [sourceMembers]);
  useEffect(() => { if (!isDemo) void sync(); }, [isDemo, sync]);

  const changeRole = async (member: TripMember, role: 'editor' | 'viewer') => {
    if (!tripId || busyRef.current || member.role === role) return;
    busyRef.current = true;
    setBusy(member.id);
    try {
      if (!isDemo) await request(`/v1/trips/${tripId}/members/${encodeURIComponent(member.id)}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setMembers((current) => current.map((entry) => entry.id === member.id ? { ...entry, role } : entry));
      toast(`${member.name || member.email}を${role === 'viewer' ? '閲覧のみ' : '編集可'}に変更しました`);
      if (!isDemo) void sync();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '権限を変更できませんでした');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const generateInvite = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('invite');
    try {
      setInvite(await createInvite());
      toast('招待リンクを作成しました');
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : '招待リンクを作れませんでした');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const requestRemove = (member: TripMember) => {
    setConfirmError('');
    setConfirm(member);
  };
  const requestRevokeInvites = () => {
    setConfirmError('');
    setConfirm('invites');
  };
  const cancelConfirmation = () => setConfirm(null);

  const confirmRemoval = async () => {
    if (!tripId || !confirm || busyRef.current) return;
    busyRef.current = true;
    setBusy('remove');
    setConfirmError('');
    try {
      if (!isDemo) await request(confirm === 'invites' ? `/v1/trips/${tripId}/invites` : `/v1/trips/${tripId}/members/${encodeURIComponent(confirm.id)}`, { method: 'DELETE' });
      if (confirm !== 'invites') {
        const id = confirm.id;
        setMembers((current) => current.filter((entry) => entry.id !== id));
      }
      setInvite('');
      setConfirm(null);
      toast(confirm === 'invites' ? '未使用の招待リンクを無効にしました' : 'メンバーを削除しました');
      if (!isDemo) void sync();
    } catch (cause) {
      setConfirmError(cause instanceof Error ? cause.message : '操作を完了できませんでした');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const shareInvite = async () => {
    try {
      await platform.share({ message: `tabiで旅行を一緒に計画しよう\n${invite}`, url: invite });
    } catch {
      toast('共有できませんでした。リンクをコピーしてください');
    }
  };

  return {
    user,
    isDemo,
    owner,
    members,
    loading: syncing && !members.length,
    error: !members.length ? syncError ?? '' : '',
    busy,
    invite,
    confirm,
    confirmError,
    reload: sync,
    changeRole,
    generateInvite,
    requestRemove,
    requestRevokeInvites,
    cancelConfirmation,
    confirmRemoval,
    shareInvite,
  };
}
