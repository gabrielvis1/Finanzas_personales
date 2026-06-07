import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user?.id) {
      loadProfile();
    }
  }, [session]);

  const loadProfile = async () => {
    const { data } = await supabase.from('profiles').select('finiax_coins').eq('id', session!.user.id).single();
    if (data) setCoins(data.finiax_coins || 0);
    setLoading(false);
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error', error.message);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.email}>{session?.user?.email}</Text>

      <View style={styles.coinsBadge}>
        <FontAwesome name="star" size={20} color="#FFD700" />
        <Text style={styles.coinsText}>
          {loading ? '...' : coins} Finiax Coins
        </Text>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuButton} onPress={() => router.push('/liabilities')}>
          <FontAwesome name="credit-card" size={24} color="#FFF" style={styles.menuIcon} />
          <Text style={styles.menuButtonText}>Gestión de Deudas</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={() => router.push('/leaderboard')}>
          <FontAwesome name="trophy" size={24} color="#FFD700" style={styles.menuIcon} />
          <Text style={styles.menuButtonText}>Ranking Social</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 8 },
  email: { fontSize: 16, color: '#A0A0A0', marginBottom: 24 },
  coinsBadge: { flexDirection: 'row', backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', marginBottom: 40 },
  coinsText: { color: '#FFD700', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  menuContainer: { width: '100%', marginBottom: 40, gap: 16 },
  menuButton: { flexDirection: 'row', backgroundColor: '#1A1A1A', padding: 20, borderRadius: 12, alignItems: 'center' },
  menuIcon: { marginRight: 16, width: 30, textAlign: 'center' },
  menuButtonText: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  button: { backgroundColor: '#FF4C4C', padding: 16, borderRadius: 12, alignItems: 'center', width: '100%' },
  buttonText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 }
});
