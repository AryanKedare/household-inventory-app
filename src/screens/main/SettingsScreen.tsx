import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/common/AppButton';
import { AppCard } from '../../components/common/AppCard';
import { LoadingView } from '../../components/common/LoadingView';
import { Screen } from '../../components/common/Screen';
import { useAuth } from '../../context/AuthContext';
import { useHousehold } from '../../context/HouseholdContext';
import { useHouseholdDetails } from '../../hooks/useHouseholdDetails';
import * as accountService from '../../services/firebase/accountService';
import * as householdService from '../../services/firebase/householdService';
import * as notificationService from '../../services/firebase/notificationService';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { HouseholdMember } from '../../types/domain';
import { toUserMessage } from '../../utils/firebaseError';

export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { householdId } = useHousehold();
  const householdDetails = useHouseholdDetails(householdId, user?.uid);
  const [notificationStatus, setNotificationStatus] =
    useState<notificationService.NotificationRegistrationStatus>('unavailable');
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [adminBusyId, setAdminBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    void notificationService
      .getNotificationRegistrationStatus(user.uid)
      .then(setNotificationStatus)
      .catch(() => setNotificationStatus('unavailable'));
  }, [user]);

  if (householdDetails.loading) {
    return <LoadingView label="Loading settings…" />;
  }

  async function enableNotifications() {
    if (!user) {
      return;
    }
    try {
      setNotificationBusy(true);
      const status = await notificationService.registerForPushNotifications(user.uid);
      setNotificationStatus(status);
      if (status === 'denied') {
        Alert.alert(
          'Notifications are disabled',
          'Allow notifications in your device settings if you want household updates.',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enable notifications.';
      Alert.alert('Notifications not ready', message);
    } finally {
      setNotificationBusy(false);
    }
  }

  async function disableNotifications() {
    if (!user) {
      return;
    }
    try {
      setNotificationBusy(true);
      await notificationService.disablePushNotifications(user.uid);
      setNotificationStatus('unavailable');
    } catch {
      Alert.alert('Could not update notifications', 'Please try again.');
    } finally {
      setNotificationBusy(false);
    }
  }

  async function regenerateInvite() {
    if (!householdId) {
      return;
    }
    try {
      setAdminBusyId('invite');
      const result = await householdService.regenerateInviteCode(householdId);
      Alert.alert('New invite code created', result.inviteCode);
    } catch (error) {
      Alert.alert('Could not regenerate invite', toUserMessage(error));
    } finally {
      setAdminBusyId(null);
    }
  }

  function confirmRemoveMember(member: HouseholdMember) {
    if (!householdId) {
      return;
    }
    Alert.alert(
      'Remove household member?',
      `${member.displayName || member.email} will lose access to this household.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setAdminBusyId(member.userId);
            void householdService
              .removeHouseholdMember(householdId, member.userId)
              .catch((error) => Alert.alert('Could not remove member', toUserMessage(error)))
              .finally(() => setAdminBusyId(null));
          },
        },
      ],
    );
  }

  async function toggleRole(member: HouseholdMember) {
    if (!householdId || member.role === 'owner') {
      return;
    }
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    try {
      setAdminBusyId(member.userId);
      await householdService.changeHouseholdMemberRole(householdId, member.userId, nextRole);
    } catch (error) {
      Alert.alert('Could not change role', toUserMessage(error));
    } finally {
      setAdminBusyId(null);
    }
  }

  function confirmTransferOwnership(member: HouseholdMember) {
    if (!householdId || member.role === 'owner') {
      return;
    }
    Alert.alert(
      'Transfer household ownership?',
      `${member.displayName || member.email} will become the owner and you will become an admin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer ownership',
          onPress: () => {
            setAdminBusyId(`transfer-${member.userId}`);
            void householdService
              .transferHouseholdOwnership(householdId, member.userId)
              .catch((error) => Alert.alert('Could not transfer ownership', toUserMessage(error)))
              .finally(() => setAdminBusyId(null));
          },
        },
      ],
    );
  }

  function confirmLeaveHousehold() {
    if (!householdId) {
      return;
    }
    if (householdDetails.currentRole === 'owner') {
      Alert.alert(
        'Transfer ownership first',
        'A household must always have an owner. Transfer ownership to another member before leaving.',
      );
      return;
    }
    Alert.alert(
      'Leave household?',
      'You will lose access to this household. You can join again later with a valid invite code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave household',
          style: 'destructive',
          onPress: () => {
            setAdminBusyId('leave');
            void householdService
              .leaveHousehold(householdId)
              .catch((error) => Alert.alert('Could not leave household', toUserMessage(error)))
              .finally(() => setAdminBusyId(null));
          },
        },
      ],
    );
  }

  function confirmDeleteHousehold() {
    if (!householdId || !householdDetails.household) {
      return;
    }
    if (householdDetails.currentRole !== 'owner' || householdDetails.members.length !== 1) {
      Alert.alert(
        'Household cannot be deleted yet',
        'Transfer ownership or remove every other member before deleting the household.',
      );
      return;
    }

    const householdName = householdDetails.household.name;
    Alert.alert(
      'Delete household permanently?',
      `This permanently deletes ${householdName}, including inventory, shopping history, purchases, expenses, budgets, Go Dutch settlements, and AI insights. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => {
            setAdminBusyId('delete-household');
            void householdService
              .deleteHousehold(householdId)
              .catch((error) => Alert.alert('Could not delete household', toUserMessage(error)))
              .finally(() => setAdminBusyId(null));
          },
        },
      ],
    );
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your HomeStock account permanently?',
      'Your account, profile, notification devices, household memberships, and personal AI quota data will be deleted. Shared household financial history may remain for other household members. If you own a household, transfer ownership or delete that household first. You may be asked to sign in again before deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: () => {
            setAdminBusyId('delete-account');
            void accountService
              .deleteAccount()
              .then(() => signOut())
              .catch((error) => Alert.alert('Could not delete account', toUserMessage(error)))
              .finally(() => setAdminBusyId(null));
          },
        },
      ],
    );
  }

  const canAdminister =
    householdDetails.currentRole === 'owner' || householdDetails.currentRole === 'admin';
  const isOwner = householdDetails.currentRole === 'owner';

  return (
    <Screen scroll>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Account and household preferences.</Text>

      {householdDetails.error ? <Text style={styles.error}>{householdDetails.error}</Text> : null}

      <AppCard style={styles.card}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <Text style={styles.name}>{user?.displayName || 'HomeStock user'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </AppCard>

      {householdDetails.household ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionLabel}>HOUSEHOLD</Text>
          <Text style={styles.name}>{householdDetails.household.name}</Text>
          <View style={styles.inviteRow}>
            <View>
              <Text style={styles.mutedLabel}>Invite code</Text>
              <Text selectable style={styles.inviteCode}>
                {householdDetails.household.inviteCode}
              </Text>
            </View>
            {canAdminister ? (
              <AppButton
                title="Regenerate"
                variant="secondary"
                loading={adminBusyId === 'invite'}
                onPress={() => void regenerateInvite()}
                style={styles.smallButton}
              />
            ) : null}
          </View>
          <Text style={styles.helpText}>
            Share the invite code only with people you want to join this household.
          </Text>
        </AppCard>
      ) : null}

      <AppCard style={styles.card}>
        <Text style={styles.sectionLabel}>MEMBERS · {householdDetails.members.length}</Text>
        {householdDetails.members.map((member, index) => {
          const isSelf = member.userId === user?.uid;
          const canRemove =
            !isSelf &&
            member.role !== 'owner' &&
            (householdDetails.currentRole === 'owner' ||
              (householdDetails.currentRole === 'admin' && member.role === 'member'));
          const canChangeRole = isOwner && !isSelf && member.role !== 'owner';
          const canTransferOwnership = isOwner && !isSelf && member.role !== 'owner';

          return (
            <View
              key={member.userId}
              style={[styles.memberRow, index > 0 ? styles.memberDivider : undefined]}
            >
              <View style={styles.memberCopy}>
                <Text style={styles.memberName}>
                  {member.displayName || member.email}
                  {isSelf ? ' (you)' : ''}
                </Text>
                <Text style={styles.memberEmail}>{member.email}</Text>
                <Text style={styles.role}>{member.role.toUpperCase()}</Text>
              </View>
              <View style={styles.memberActions}>
                {canChangeRole ? (
                  <AppButton
                    title={member.role === 'admin' ? 'Make member' : 'Make admin'}
                    variant="secondary"
                    disabled={adminBusyId !== null}
                    onPress={() => void toggleRole(member)}
                    style={styles.memberButton}
                  />
                ) : null}
                {canTransferOwnership ? (
                  <AppButton
                    title="Make owner"
                    variant="secondary"
                    disabled={adminBusyId !== null}
                    loading={adminBusyId === `transfer-${member.userId}`}
                    onPress={() => confirmTransferOwnership(member)}
                    style={styles.memberButton}
                  />
                ) : null}
                {canRemove ? (
                  <AppButton
                    title="Remove"
                    variant="danger"
                    disabled={adminBusyId !== null}
                    onPress={() => confirmRemoveMember(member)}
                    style={styles.memberButton}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </AppCard>

      <AppCard style={styles.card}>
        <View style={styles.settingHeader}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>Push notifications</Text>
            <Text style={styles.settingDescription}>
              Get household updates when shopping items are added, finished, or purchased.
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              notificationStatus === 'enabled' ? styles.statusOn : styles.statusOff,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                notificationStatus === 'enabled' ? styles.statusTextOn : styles.statusTextOff,
              ]}
            >
              {notificationStatus === 'enabled'
                ? 'On'
                : notificationStatus === 'denied'
                  ? 'Blocked'
                  : 'Off'}
            </Text>
          </View>
        </View>

        {notificationStatus === 'enabled' ? (
          <AppButton
            title="Turn off notifications"
            variant="secondary"
            loading={notificationBusy}
            onPress={() => void disableNotifications()}
          />
        ) : (
          <AppButton
            title="Enable notifications"
            loading={notificationBusy}
            onPress={() => void enableNotifications()}
          />
        )}
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionLabel}>HOUSEHOLD ACCESS</Text>
        <Text style={styles.settingTitle}>Leave household</Text>
        <Text style={styles.settingDescription}>
          {isOwner
            ? householdDetails.members.length > 1
              ? 'Transfer ownership to another member before leaving the household.'
              : 'You are the only member. Delete the household if you no longer need it.'
            : 'Leaving removes your access but does not delete household data for the remaining members.'}
        </Text>
        {!isOwner ? (
          <AppButton
            title="Leave household"
            variant="danger"
            loading={adminBusyId === 'leave'}
            disabled={adminBusyId !== null && adminBusyId !== 'leave'}
            onPress={confirmLeaveHousehold}
          />
        ) : null}
      </AppCard>

      {isOwner ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionLabel}>HOUSEHOLD DANGER ZONE</Text>
          <Text style={styles.settingTitle}>Delete household</Text>
          <Text style={styles.settingDescription}>
            {householdDetails.members.length === 1
              ? 'Permanently delete this household and all inventory, shopping, finance, settlement, and AI data.'
              : 'Remove every other member or transfer ownership before this household can be deleted.'}
          </Text>
          <AppButton
            title="Delete household permanently"
            variant="danger"
            loading={adminBusyId === 'delete-household'}
            disabled={
              householdDetails.members.length !== 1 ||
              (adminBusyId !== null && adminBusyId !== 'delete-household')
            }
            onPress={confirmDeleteHousehold}
          />
        </AppCard>
      ) : null}

      <AppCard style={styles.card}>
        <Text style={styles.sectionLabel}>ACCOUNT DANGER ZONE</Text>
        <Text style={styles.settingTitle}>Delete account</Text>
        <Text style={styles.settingDescription}>
          Permanently delete your HomeStock login and personal account data. Shared household accounting records may remain for other household members. Household owners must transfer ownership or delete their household first.
        </Text>
        <AppButton
          title="Delete my account permanently"
          variant="danger"
          loading={adminBusyId === 'delete-account'}
          disabled={adminBusyId !== null && adminBusyId !== 'delete-account'}
          onPress={confirmDeleteAccount}
        />
      </AppCard>

      <AppButton title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.lg },
  error: { color: colors.danger, marginBottom: spacing.md },
  card: { marginBottom: spacing.lg, gap: spacing.md },
  sectionLabel: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  name: { color: colors.text, fontSize: 18, fontWeight: '700' },
  email: { color: colors.textMuted, fontSize: 14 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  mutedLabel: { color: colors.textMuted, fontSize: 12 },
  inviteCode: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: 2, marginTop: spacing.xs },
  smallButton: { minHeight: 42, paddingHorizontal: spacing.md },
  helpText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  memberRow: { paddingVertical: spacing.sm, gap: spacing.sm },
  memberDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  memberCopy: { gap: spacing.xs },
  memberName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  memberEmail: { color: colors.textMuted, fontSize: 13 },
  role: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  memberActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  memberButton: { minHeight: 40, paddingHorizontal: spacing.md },
  settingHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  settingCopy: { flex: 1 },
  settingTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  settingDescription: { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 20 },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999 },
  statusOn: { backgroundColor: '#E7F6ED' },
  statusOff: { backgroundColor: colors.surfaceMuted },
  statusText: { fontSize: 12, fontWeight: '800' },
  statusTextOn: { color: colors.success },
  statusTextOff: { color: colors.textMuted },
});
