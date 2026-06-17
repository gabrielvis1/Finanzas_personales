import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, ActivityIndicator, TextInput, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

export default function ProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [coins, setCoins] = useState(0);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      loadProfile();
    }
  }, [session]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('finiax_coins, full_name, avatar_url, username')
        .eq('id', session!.user.id)
        .single();
      
      if (error) throw error;
      if (data) {
        setCoins(data.finiax_coins || 0);
        setFullName(data.full_name || '');
        setAvatarUrl(data.avatar_url || '');
        setUsername(data.username ? `@${data.username}` : '');
      }
    } catch (e: any) {
      console.warn('Error al cargar perfil:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setAvatarUrl(`data:${asset.mimeType || 'image/jpeg'};base64,${base64}`);
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  const handleSaveProfile = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      const cleanUsername = username.trim().replace(/^@/, '');
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          avatar_url: avatarUrl,
          username: cleanUsername || null
        })
        .eq('id', session!.user.id);

      if (error) throw error;
      setUsername(cleanUsername ? `@${cleanUsername}` : '');
      Alert.alert('Éxito', 'Perfil actualizado correctamente');
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo guardar el perfil: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error', error.message);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#00D09E" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Mi Perfil</Text>
        <Text style={styles.email}>{session?.user?.email}</Text>

        {/* Avatar Section */}
        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickImage}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <FontAwesome name="user" size={48} color="#888" />
            </View>
          )}
          <View style={styles.cameraIconBadge}>
            <FontAwesome name="camera" size={12} color="#121212" />
          </View>
        </TouchableOpacity>

        {/* Coins Badge */}
        <View style={styles.coinsBadge}>
          <FontAwesome name="star" size={18} color="#FFD700" />
          <Text style={styles.coinsText}>{coins} Finiax Coins</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          <Text style={styles.inputLabel}>Nombre Completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre y Apellido..."
            placeholderTextColor="#666"
            value={fullName}
            onChangeText={setFullName}
          />

          <Text style={styles.inputLabel}>Usuario / Handle (ej: @gabriel)</Text>
          <TextInput
            style={styles.input}
            placeholder="@usuario..."
            placeholderTextColor="#666"
            value={username}
            onChangeText={(text) => {
              if (text && !text.startsWith('@')) {
                setUsername(`@${text}`);
              } else {
                setUsername(text);
              }
            }}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.saveButton, updating && { opacity: 0.7 }]}
            onPress={handleSaveProfile}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#121212" />
            ) : (
              <Text style={styles.saveButtonText}>Guardar Perfil</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Menu Buttons (Removed Gestión de deudas) */}
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuButton} onPress={() => router.push('/leaderboard')}>
            <FontAwesome name="trophy" size={20} color="#FFD700" style={styles.menuIcon} />
            <Text style={styles.menuButtonText}>Ranking Social</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  contentContainer: { padding: 24, alignItems: 'center', paddingTop: 40 },
  centered: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 4 },
  email: { fontSize: 14, color: '#888', marginBottom: 24 },
  
  avatarContainer: {
    position: 'relative',
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 20,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#00D09E',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 4,
    backgroundColor: '#00D09E',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#050505',
  },

  coinsBadge: { flexDirection: 'row', backgroundColor: '#181818', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', marginBottom: 30, borderWidth: 1, borderColor: '#2E2E2E' },
  coinsText: { color: '#FFD700', fontWeight: 'bold', fontSize: 14, marginLeft: 8 },
  
  form: { width: '100%', marginBottom: 30 },
  inputLabel: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  input: { backgroundColor: '#1E1E1E', color: '#FFF', padding: 14, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#333' },
  saveButton: { backgroundColor: '#00D09E', padding: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#121212', fontWeight: 'bold', fontSize: 16 },

  menuContainer: { width: '100%', marginBottom: 30 },
  menuButton: { flexDirection: 'row', backgroundColor: '#1E1E1E', padding: 16, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  menuIcon: { marginRight: 16, width: 24, textAlign: 'center' },
  menuButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  
  signOutButton: { backgroundColor: '#FF4C4C', padding: 16, borderRadius: 10, alignItems: 'center', width: '100%', marginTop: 10 },
  signOutButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});
