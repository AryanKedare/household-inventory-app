import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HouseholdSetupScreen } from '../screens/household/HouseholdSetupScreen';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function HouseholdNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HouseholdSetup" component={HouseholdSetupScreen} />
    </Stack.Navigator>
  );
}
