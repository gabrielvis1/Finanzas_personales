import { Tabs } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import AiChatModal from '@/components/AiChatModal';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [chatVisible, setChatVisible] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
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
          name="credits"
          options={{
            title: 'Créditos',
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
          name="planner"
          options={{
            title: 'Planificador',
            tabBarIcon: ({ color }) => <FontAwesome name="sliders" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="social"
          options={{
            title: 'Social',
            tabBarIcon: ({ color }) => <FontAwesome name="users" size={24} color={color} />,
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

      {/* Botón flotante del Asistente de IA */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setChatVisible(true)}
        activeOpacity={0.8}
      >
        <FontAwesome name="magic" size={20} color="#121212" />
      </TouchableOpacity>

      <AiChatModal
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    backgroundColor: '#00D09E',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 9999,
  }
});
