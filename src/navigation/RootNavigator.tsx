import { useEffect } from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';

import { LoadingView } from '../components/common/LoadingView';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';
import { SetupRequiredScreen } from '../screens/main/SetupRequiredScreen';
import { refreshPushTokenIfAlreadyAllowed } from '../services/supabase/notificationService';
import { colors } from '../theme/colors';
import { AuthNavigator } from './AuthNavigator';
import { HouseholdNavigator } from './HouseholdNavigator';
import { MainTabs } from './MainTabs';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
  },
};

export function RootNavigator() {
  const { user, loading: authLoading, configured } = useAuth();
  const { householdId, loading: householdLoading } = useHousehold();

  useEffect(() => {
    if (!user || !configured) {
      return;
    }
    void refreshPushTokenIfAlreadyAllowed(user.uid).catch(() => undefined);
  }, [configured, user]);

  if (!configured) {
    return <SetupRequiredScreen />;
  }

  if (authLoading || (user && householdLoading)) {
    return <LoadingView label="Preparing HomeStock…" />;
  }

  return (
    <NavigationContainer theme={theme}>
      {!user ? <AuthNavigator /> : householdId ? <MainTabs /> : <HouseholdNavigator />}
    </NavigationContainer>
  );
}
