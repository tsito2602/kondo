import { usePalette, useThemedStyles } from '@/theme/theme-provider';
import { MemberAvatar } from '@/components/member-avatar';
import { PageHeading } from '@/components/page-heading';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { CopyButton } from '@/components/copy-button';
import { ConfirmationDialog } from '@/components/delete-trip-dialog';
import { useTripHeaderHeight } from '@/components/trip-header-context';
import { type Palette } from '@/constants/design';
import { useMembersPresenter } from '@/ui/presenters/members-presenter';

export default function MembersScreen() {
  const palette = usePalette();
  const styles = useThemedStyles(createStyles);
  const headerHeight = useTripHeaderHeight();
  const {
    user,
    isDemo,
    owner,
    members,
    loading,
    error,
    busy,
    invite,
    confirm,
    confirmError,
    reload,
    changeRole,
    generateInvite,
    requestRemove,
    requestRevokeInvites,
    cancelConfirmation,
    confirmRemoval,
    shareInvite,
  } = useMembersPresenter();

  return <View style={styles.screen}>
    <ScrollView testID="members-scroll" contentContainerStyle={[styles.content, { paddingTop: headerHeight + 24 }]}>
      <PageHeading title="メンバー" />
      <View testID="members-grid" style={{ gap: 18 }}>{owner ? <View testID="invite-panel" style={styles.inviteCard}>
        <View style={styles.headingRow}><View style={styles.icon}><SymbolView name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }} size={24} tintColor={palette.ocean} /></View><Text style={styles.heading}>旅行に招待</Text></View>
        <Text style={styles.body}>{isDemo ? '招待リンクはログイン後の旅行で利用できます。' : 'リンクは7日間有効・1人用です。参加した人は予定を編集できます。'}</Text>
        {invite ? <><Text selectable style={styles.url}>{invite}</Text><View style={styles.inviteActions}><CopyButton key={invite} value={invite} /><Pressable accessibilityRole="button" onPress={() => void shareInvite()} style={styles.primary}><Text style={styles.primaryText}>リンクを共有</Text></Pressable></View></> : null}
        {!isDemo ? <><Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => void generateInvite()} style={[invite ? styles.secondary : styles.primary, Boolean(busy) && styles.disabled]}><Text style={invite ? styles.secondaryText : styles.primaryText}>{busy === 'invite' ? '作成中…' : invite ? '別の招待リンクを作成' : '招待リンクを作成'}</Text></Pressable><Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={requestRevokeInvites} style={styles.revoke}><Text style={styles.muted}>未使用の招待リンクを無効化</Text></Pressable></> : null}
      </View> : null}
      <View testID="member-list" style={{ gap: 14 }}><View style={styles.listHeading}><Text style={styles.heading}>参加メンバー</Text><Text style={styles.count}>{members.length}人</Text></View>
      {loading ? <ActivityIndicator color={palette.ocean} /> : error ? <View style={styles.inviteCard}><Text style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.secondary}><Text style={styles.secondaryText}>再読み込み</Text></Pressable></View> : members.map((member) => <View key={member.id} style={styles.member}>
        <View style={styles.memberTop}><MemberAvatar name={member.name || member.email} avatarUrl={member.avatarUrl} size={46} /><View style={styles.memberCopy}><Text style={styles.name}>{member.name || member.email}{member.id === user?.id || member.id === 'demo-self' ? '（あなた）' : ''}</Text>{member.name && member.email ? <Text style={styles.email}>{member.email}</Text> : null}<Text style={styles.role}>{member.role === 'owner' ? '管理者' : member.role === 'editor' ? '編集可' : '閲覧のみ'}</Text></View>
          {owner && member.role !== 'owner' ? <Pressable accessibilityRole="button" accessibilityLabel={`${member.name || member.email}を削除`} disabled={Boolean(busy)} onPress={() => requestRemove(member)} style={styles.remove}><SymbolView name={{ ios: 'person.badge.minus', android: 'person_remove', web: 'person_remove' }} size={20} tintColor={palette.smoke} /></Pressable> : null}
        </View>
        {owner && member.role !== 'owner' ? <View style={styles.roles}>{(['editor', 'viewer'] as const).map((role) => <Pressable accessibilityRole="button" accessibilityState={{ selected: member.role === role }} disabled={Boolean(busy)} key={role} onPress={() => void changeRole(member, role)} style={[styles.roleButton, member.role === role && styles.roleSelected]}><Text style={[styles.roleText, member.role === role && styles.roleTextSelected]}>{busy === member.id && member.role !== role ? '変更中…' : role === 'editor' ? '編集可' : '閲覧のみ'}</Text></Pressable>)}</View> : null}
      </View>)}
    </View></View></ScrollView>
    <ConfirmationDialog visible={Boolean(confirm)} title={confirm === 'invites' ? '招待リンクを無効にしますか？' : 'メンバーを削除しますか？'} name={confirm && confirm !== 'invites' ? confirm.name || confirm.email : ''} description={confirm === 'invites' ? '未使用の招待リンクがすべて使えなくなります。参加済みのメンバーには影響しません。' : 'この旅行を開けなくなります。再参加を防ぐため、未使用の招待リンクも無効になります。'} confirmLabel={confirm === 'invites' ? '無効にする' : '削除する'} busy={busy === 'remove'} error={confirmError} onCancel={cancelConfirmation} onConfirm={() => void confirmRemoval()} />
  </View>;
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 100, gap: 14 },
  inviteCard: { backgroundColor: palette.paper, borderRadius: 22, padding: 22, gap: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { backgroundColor: palette.sky, width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  heading: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  body: { color: palette.slate, fontSize: 13, lineHeight: 21 },
  url: { padding: 14, borderRadius: 12, backgroundColor: palette.canvas, color: palette.ocean, fontSize: 12, lineHeight: 20 },
  inviteActions: { flexDirection: 'row', gap: 10 },
  primary: { minHeight: 46, paddingHorizontal: 18, borderRadius: 12, backgroundColor: palette.ocean, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: palette.onOcean, fontSize: 13, fontWeight: '700' },
  secondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.sky },
  secondaryText: { color: palette.ocean, fontSize: 13, fontWeight: '600' },
  revoke: { paddingVertical: 6, alignItems: 'center' },
  muted: { color: palette.smoke, fontSize: 12 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingHorizontal: 4 },
  count: { color: palette.smoke, fontSize: 13 },
  member: { padding: 20, gap: 16, borderRadius: 20, backgroundColor: palette.paper },
  memberTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.sky, justifyContent: 'center', alignItems: 'center' },
  initial: { fontSize: 18, fontWeight: '700', color: palette.ocean },
  memberCopy: { flex: 1, gap: 4 },
  name: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  email: { color: palette.smoke, fontSize: 11 },
  role: { color: palette.ocean, fontSize: 11 },
  remove: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  roles: { padding: 4, borderRadius: 12, backgroundColor: palette.canvas, flexDirection: 'row', gap: 4 },
  roleButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  roleSelected: { backgroundColor: palette.paper },
  roleText: { color: palette.smoke, fontSize: 12 },
  roleTextSelected: { color: palette.ocean, fontWeight: '700' },
  error: { color: palette.danger, fontSize: 13, lineHeight: 21 },
  disabled: { opacity: 0.5 },
});
