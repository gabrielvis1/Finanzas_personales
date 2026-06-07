import { Tabs } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#00D09E',
        tabBarStyle: { backgroundColor: '#0A0A0A', borderTopColor: '#333' },
        headerStyle: { backgroundColor: '#0A0A0A' },
        headerTintColor: '#FFF',
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <FontAwesome name="pie-chart" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cashflow"
        options={{
          title: 'Transacciones',
          tabBarIcon: ({ color }) => <FontAwesome name="exchange" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Presupuestos',
          tabBarIcon: ({ color }) => <FontAwesome name="pie-chart" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Metas',
          tabBarIcon: ({ color }) => <FontAwesome name="star" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="credits"
        options={{
          title: 'Deudas',
          tabBarIcon: ({ color }) => <FontAwesome name="credit-card" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: 'Activos',
          tabBarIcon: ({ color }) => <FontAwesome name="line-chart" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <FontAwesome name="user" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
