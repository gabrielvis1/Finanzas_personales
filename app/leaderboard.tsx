import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator, TouchableOpacity, Share } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { FontAwesome } from '@expo/vector-icons';

type Profile = {
  id: string;
  full_name: string;
  email: string;
  finiax_coins: number;
};

export default function LeaderboardScreen() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('finiax_coins', { ascending: false })
      .limit(50);
    
    if (data) {
      setProfiles(data);
    }
    setLoading(false);
  };

  const handleShare = async () => {
    const myProfile = profiles.find(p => p.id === session?.user?.id);
    const coins = myProfile?.finiax_coins || 0;
    
    try {
      await Share.share({
        message: `¡Tengo ${coins} Finiax Coins en la app Finiax! ¿Puedes superar mi puntaje financiero? 🚀💰`,
      });
    } catch (error: any) {
      console.log(error.message);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#FFD700" size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ranking Social</Text>
      <Text style={styles.subtitle}>Compite amistosamente acumulando Finiax Coins al usar IA y cumplir tus metas.</Text>

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isMe = item.id === session?.user?.id;
          let medalColor = 'transparent';
          if (index === 0) medalColor = '#FFD700'; // Oro
          else if (index === 1) medalColor = '#C0C0C0'; // Plata
          else if (index === 2) medalColor = '#CD7F32'; // Bronce

          return (
            <View style={[styles.userCard, isMe && styles.myCard]}>
              <View style={styles.rankContainer}>
                <Text style={styles.rankText}>{index + 1}</Text>
                {index < 3 && <FontAwesome name="trophy" size={20} color={medalColor} style={{ marginLeft: 8 }} />}
              </View>
              
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.full_name || item.email?.split('@')[0]}</Text>
                {isMe && <Text style={styles.meText}>(Tú)</Text>}
              </View>
              
              <View style={styles.coinsContainer}>
                <Text style={styles.coinsText}>{item.finiax_coins}</Text>
                <FontAwesome name="star" size={16} color="#FFD700" style={{ marginLeft: 4 }} />
              </View>
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
        <FontAwesome name="share-alt" size={20} color="#000" style={{ marginRight: 8 }} />
        <Text style={styles.shareButtonText}>Compartir mi puntaje</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24 },
  centered: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#AAA', textAlign: 'center', marginBottom: 24 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, marginBottom: 12 },
  myCard: { borderColor: '#00D09E', borderWidth: 1, backgroundColor: '#11221A' },
  rankContainer: { flexDirection: 'row', alignItems: 'center', width: 60 },
  rankText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  userName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  meText: { color: '#00D09E', fontSize: 14, marginLeft: 8, fontWeight: 'bold' },
  coinsContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  coinsText: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
  shareButton: { position: 'absolute', bottom: 40, left: 24, right: 24, flexDirection: 'row', backgroundColor: '#FFD700', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  shareButtonText: { color: '#000', fontWeight: 'bold', fontSize: 16 }
});
