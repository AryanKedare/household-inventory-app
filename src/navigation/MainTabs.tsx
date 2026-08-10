import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { ActivityScreen } from '../screens/main/ActivityScreen';
import { DashboardScreen } from '../screens/main/DashboardScreen';
import { FinanceScreen } from '../screens/main/FinanceScreen';
import { InventoryScreen } from '../screens/main/InventoryScreen';
import { SettingsScreen } from '../screens/main/SettingsScreen';
import { ShoppingListScreen } from '../screens/main/ShoppingListScreen';
import { colors } from '../theme/colors';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface },
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Shopping" component={ShoppingListScreen} />
      <Tab.Screen name="Finance" component={FinanceScreen} />
      <Tab.Screen name="Activity" component={ActivityScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
