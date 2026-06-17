import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

interface Profile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  is_following?: boolean;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export default function SocialScreen() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<'search' | 'chats'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [chats, setChats] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados de Chat
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (session?.user?.id) {
      if (activeTab === 'search') {
        searchUsers('');
      } else {
        loadChats();
      }
    }
  }, [activeTab, session]);

  // Real-time subscription for chat messages
  useEffect(() => {
    if (!selectedUser || !session?.user?.id) return;

    // Cargar mensajes iniciales
    loadMessages(selectedUser.id);

    const channel = supabase
      .channel(`chat_${selectedUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${selectedUser.id},receiver_id=eq.${session.user.id}`
        },
        (payload) => {
          setChatMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${session.user.id},receiver_id=eq.${selectedUser.id}`
        },
        (payload) => {
          // Si enviamos nosotros, ya lo pusimos en el estado localmente, pero por si acaso
          setChatMessages((prev) => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as Message];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUser]);

  const searchUsers = async (query: string) => {
    setLoading(true);
    try {
      const q = query.trim().replace(/^@/, '');
      let dbQuery = supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .neq('id', session!.user.id);

      if (q) {
        dbQuery = dbQuery.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
      } else {
        dbQuery = dbQuery.limit(20);
      }

      const { data: profiles, error } = await dbQuery;
      if (error) throw error;

      // Obtener personas que ya sigue
      const { data: followsData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', session!.user.id);

      const followingIds = new Set(followsData?.map(f => f.following_id) || []);

      const mapped = (profiles || []).map(p => ({
        ...p,
        is_following: followingIds.has(p.id)
      }));

      setUsers(mapped);
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadChats = async () => {
    setLoading(true);
    try {
      // Obtener perfiles de usuarios a los que sigue o sigue de vuelta
      const { data: followsData, error } = await supabase
        .from('follows')
        .select('following_id, profiles!follows_following_id_fkey(id, username, full_name, avatar_url)')
        .eq('follower_id', session!.user.id);

      if (error) throw error;

      const chatUsers = followsData?.map((f: any) => {
        const profile = Array.isArray(f.profiles) ? f.profiles[0] : f.profiles;
        return {
          ...profile,
          is_following: true
        };
      }) || [];

      setChats(chatUsers);
    } catch (e: any) {
      console.warn(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async (user: Profile) => {
    try {
      if (user.is_following) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', session!.user.id)
          .eq('following_id', user.id);
        if (error) throw error;
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: session!.user.id,
            following_id: user.id
          });
        if (error) throw error;
      }

      // Actualizar lista en UI
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_following: !u.is_following } : u));
      setChats(prev => {
        if (user.is_following) {
          return prev.filter(c => c.id !== user.id);
        } else {
          return [...prev, { ...user, is_following: true }];
        }
      });
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo realizar la acción social.');
    }
  };

  const loadMessages = async (receiverId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${session!.user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${session!.user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setChatMessages(data || []);
    } catch (e: any) {
      console.warn(e.message);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || sending || !selectedUser) return;
    setSending(true);
    const content = messageInput.trim();
    setMessageInput('');

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: session!.user.id,
          receiver_id: selectedUser.id,
          content
        })
        .select('*')
        .single();

      if (error) throw error;
      if (data) {
        setChatMessages(prev => [...prev, data as Message]);
      }
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabsHeader}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'search' && styles.tabButtonActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'search' && styles.tabButtonTextActive]}>Buscar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'chats' && styles.tabButtonActive]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'chats' && styles.tabButtonTextActive]}>Mis Chats</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'search' ? (
        <View style={{ flex: 1, padding: 16 }}>
          <View style={styles.searchContainer}>
            <FontAwesome name="search" size={16} color="#888" style={{ marginRight: 10 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por handle o nombre..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                searchUsers(text);
              }}
            />
          </View>

          {loading ? (
            <ActivityIndicator color="#00D09E" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={users}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 12, paddingTop: 10 }}
              renderItem={({ item }) => (
                <View style={styles.userCard}>
                  <TouchableOpacity style={styles.userCardLeft} onPress={() => setSelectedUser(item)}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <FontAwesome name="user" size={16} color="#888" />
                      </View>
                    )}
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={styles.fullName}>{item.full_name || 'Usuario Finiax'}</Text>
                      <Text style={styles.username}>@{item.username || 'sin_handle'}</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.followBtn, item.is_following && styles.followBtnActive]}
                    onPress={() => handleFollowToggle(item)}
                  >
                    <Text style={[styles.followBtnText, item.is_following && { color: '#00D09E' }]}>
                      {item.is_following ? 'Siguiendo' : 'Seguir'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      ) : (
        <View style={{ flex: 1, padding: 16 }}>
          {loading ? (
            <ActivityIndicator color="#00D09E" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={chats}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.chatRow} onPress={() => setSelectedUser(item)}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <FontAwesome name="user" size={16} color="#888" />
                    </View>
                  )}
                  <View style={{ marginLeft: 16, flex: 1 }}>
                    <Text style={styles.fullName}>{item.full_name || 'Usuario Finiax'}</Text>
                    <Text style={styles.username}>@{item.username || 'sin_handle'}</Text>
                  </View>
                  <FontAwesome name="chevron-right" size={14} color="#333" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* direct chat modal */}
      <Modal
        visible={!!selectedUser}
        animationType="slide"
        onRequestClose={() => setSelectedUser(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.closeBtn}>
              <FontAwesome name="chevron-left" size={16} color="#FFF" />
            </TouchableOpacity>
            {selectedUser?.avatar_url ? (
              <Image source={{ uri: selectedUser.avatar_url }} style={styles.chatAvatar} />
            ) : (
              <View style={styles.chatAvatarPlaceholder}>
                <FontAwesome name="user" size={12} color="#888" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.chatName}>{selectedUser?.full_name || 'Chat'}</Text>
              <Text style={styles.chatHandle}>@{selectedUser?.username || 'sin_handle'}</Text>
            </View>
          </View>

          {/* Messages List */}
          <FlatList
            ref={chatListRef}
            data={chatMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isMe = item.sender_id === session!.user.id;
              return (
                <View style={[styles.bubbleContainer, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
                  <View style={[styles.msgBubble, isMe ? styles.msgMe : styles.msgOther]}>
                    <Text style={[styles.msgText, isMe && { color: '#000' }]}>{item.content}</Text>
                  </View>
                </View>
              );
            }}
          />

          {/* Input Box */}
          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#666"
              value={messageInput}
              onChangeText={setMessageInput}
              onSubmitEditing={handleSendMessage}
            />
            <TouchableOpacity
              onPress={handleSendMessage}
              style={[styles.sendBtn, { backgroundColor: messageInput.trim() ? '#00D09E' : '#1A2F2C' }]}
              disabled={!messageInput.trim() || sending}
            >
              <FontAwesome name="send" size={16} color={messageInput.trim() ? '#121212' : '#00D09E'} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  tabsHeader: { flexDirection: 'row', backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222' },
  tabButton: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabButtonActive: { borderBottomColor: '#00D09E' },
  tabButtonText: { color: '#888', fontSize: 14, fontWeight: 'bold' },
  tabButtonTextActive: { color: '#00D09E' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#222', marginBottom: 16 },
  searchInput: { flex: 1, color: '#FFF', fontSize: 14 },
  
  userCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#222' },
  userCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  fullName: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  username: { color: '#00D09E', fontSize: 12, marginTop: 2 },
  
  followBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: '#1A2F2C', borderWidth: 1, borderColor: '#00D09E' },
  followBtnActive: { backgroundColor: '#222', borderColor: '#333' },
  followBtnText: { color: '#00D09E', fontSize: 12, fontWeight: 'bold' },
  
  chatRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#222' },

  // Chat Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#050505' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222', paddingTop: Platform.OS === 'ios' ? 50 : 16 },
  closeBtn: { padding: 8, marginRight: 8 },
  chatAvatar: { width: 32, height: 32, borderRadius: 16 },
  chatAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  chatName: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  chatHandle: { color: '#00D09E', fontSize: 11 },
  
  bubbleContainer: { flexDirection: 'row', width: '100%' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  msgBubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, maxWidth: '80%' },
  msgMe: { backgroundColor: '#00D09E', borderBottomRightRadius: 2 },
  msgOther: { backgroundColor: '#1E1E1E', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: '#2E2E2E' },
  msgText: { color: '#FFF', fontSize: 14, lineHeight: 20 },
  
  inputArea: { flexDirection: 'row', padding: 16, backgroundColor: '#111', borderTopWidth: 1, borderTopColor: '#222', gap: 12, alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#1F1F1F', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12, color: '#FFF', fontSize: 14, borderWidth: 1, borderColor: '#2E2E2E' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }
});
