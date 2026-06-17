import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { chatWithAssistant } from '@/lib/gemini';
import { useAuth } from '@/providers/AuthProvider';

interface Message {
  role: 'user' | 'model';
  parts: any[];
  attachmentName?: string;
}

interface Attachment {
  name: string;
  uri: string;
  base64: string;
  mimeType: string;
}

interface AiChatModalProps {
  visible: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

const INITIAL_MESSAGES: Message[] = [
  {
    role: 'model',
    parts: [{ text: '¡Hola! Soy Finiax AI. ¿En qué puedo ayudarte hoy? Puedes preguntarme sobre tus finanzas o subir fotos de tickets, PDFs y planillas Excel para que los procese.' }]
  }
];

const screenHeight = Dimensions.get('window').height;

export default function AiChatModal({ visible, onClose, onRefreshData }: AiChatModalProps) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, loading]);

  useEffect(() => {
    if (visible && session?.user?.id) {
      loadSessions();
    }
  }, [visible, session?.user?.id]);

  const loadSessions = async () => {
    if (!session?.user?.id) return;
    try {
      const stored = await AsyncStorage.getItem(`finiax_ai_sessions_${session.user.id}`);
      if (stored) {
        const parsed: ChatSession[] = JSON.parse(stored);
        if (parsed.length > 0) {
          setSessions(parsed);
          const lastActiveId = await AsyncStorage.getItem(`finiax_ai_last_active_session_${session.user.id}`);
          const exists = parsed.some(s => s.id === lastActiveId);
          const activeId = exists ? lastActiveId! : parsed[0].id;
          setActiveSessionId(activeId);
          const activeSess = parsed.find(s => s.id === activeId);
          if (activeSess) {
            setMessages(activeSess.messages);
          }
          return;
        }
      }
      
      const defaultSession: ChatSession = {
        id: Date.now().toString(),
        title: 'Nueva Conversación',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: INITIAL_MESSAGES
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
      setMessages(defaultSession.messages);
      await AsyncStorage.setItem(`finiax_ai_sessions_${session.user.id}`, JSON.stringify([defaultSession]));
      await AsyncStorage.setItem(`finiax_ai_last_active_session_${session.user.id}`, defaultSession.id);
    } catch (e) {
      console.warn('Error cargando sesiones de chat:', e);
    }
  };

  const saveSessionsToStorage = async (updatedSessions: ChatSession[]) => {
    if (!session?.user?.id) return;
    try {
      await AsyncStorage.setItem(`finiax_ai_sessions_${session.user.id}`, JSON.stringify(updatedSessions));
    } catch (e) {
      console.warn('Error guardando sesiones de chat:', e);
    }
  };

  const updateSessionMessages = (updatedMsgs: Message[]) => {
    if (!activeSessionId) return;
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === activeSessionId) {
          let title = s.title;
          if (title === 'Nueva Conversación' || title.startsWith('Conversación ')) {
            const firstUserMsg = updatedMsgs.find(m => m.role === 'user');
            if (firstUserMsg) {
              const textPart = firstUserMsg.parts.find((p: any) => p.text);
              if (textPart && textPart.text) {
                title = textPart.text.substring(0, 25) + (textPart.text.length > 25 ? '...' : '');
              }
            }
          }
          return {
            ...s,
            title,
            messages: updatedMsgs,
            updatedAt: Date.now()
          };
        }
        return s;
      });
      saveSessionsToStorage(updated);
      return updated;
    });
  };

  const handleSelectSession = async (sessionId: string) => {
    const selected = sessions.find(s => s.id === sessionId);
    if (selected) {
      setActiveSessionId(sessionId);
      setMessages(selected.messages);
      setShowHistory(false);
      if (session?.user?.id) {
        await AsyncStorage.setItem(`finiax_ai_last_active_session_${session.user.id}`, sessionId);
      }
    }
  };

  const handleCreateSession = async () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'Conversación ' + new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: INITIAL_MESSAGES
    };
    
    const updated = [newSession, ...sessions];
    setSessions(updated);
    setActiveSessionId(newSession.id);
    setMessages(newSession.messages);
    setShowHistory(false);
    
    if (session?.user?.id) {
      await saveSessionsToStorage(updated);
      await AsyncStorage.setItem(`finiax_ai_last_active_session_${session.user.id}`, newSession.id);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const updated = sessions.filter(s => s.id !== sessionId);
    
    if (updated.length === 0) {
      const defaultSession: ChatSession = {
        id: Date.now().toString(),
        title: 'Nueva Conversación',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: INITIAL_MESSAGES
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
      setMessages(defaultSession.messages);
      if (session?.user?.id) {
        await saveSessionsToStorage([defaultSession]);
        await AsyncStorage.setItem(`finiax_ai_last_active_session_${session.user.id}`, defaultSession.id);
      }
    } else {
      setSessions(updated);
      await saveSessionsToStorage(updated);
      
      if (activeSessionId === sessionId) {
        const nextSession = updated[0];
        setActiveSessionId(nextSession.id);
        setMessages(nextSession.messages);
        if (session?.user?.id) {
          await AsyncStorage.setItem(`finiax_ai_last_active_session_${session.user.id}`, nextSession.id);
        }
      }
    }
  };

  const handleRenameSession = async (sessionId: string) => {
    if (!renameInput.trim()) return;
    const updated = sessions.map(s => {
      if (s.id === sessionId) {
        return { ...s, title: renameInput.trim(), updatedAt: Date.now() };
      }
      return s;
    });
    setSessions(updated);
    setRenamingSessionId(null);
    setRenameInput('');
    await saveSessionsToStorage(updated);
  };

  const handlePickImage = async () => {
    setShowOptions(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setAttachment({
          name: asset.fileName || 'imagen.jpg',
          uri: asset.uri,
          base64,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      }
    } catch (error) {
      console.warn('Error seleccionando imagen:', error);
    }
  };

  const handlePickDocument = async () => {
    setShowOptions(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(doc.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setAttachment({
          name: doc.name,
          uri: doc.uri,
          base64,
          mimeType: doc.mimeType || 'application/octet-stream',
        });
      }
    } catch (error) {
      console.warn('Error seleccionando documento:', error);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || loading || !session?.user?.id) return;

    const userText = input.trim();
    setInput('');
    setLoading(true);

    const parts: any[] = [];
    if (userText) {
      parts.push({ text: userText });
    } else {
      parts.push({ text: 'Procesa este archivo adjunto por favor.' });
    }

    if (attachment) {
      parts.push({
        inlineData: {
          data: attachment.base64,
          mimeType: attachment.mimeType
        }
      });
    }

    const currentAttachmentName = attachment?.name;
    setAttachment(null);

    const newMessages: Message[] = [
      ...messages,
      {
        role: 'user',
        parts,
        attachmentName: currentAttachmentName
      }
    ];
    setMessages(newMessages);
    updateSessionMessages(newMessages);

    try {
      const apiMessages = newMessages.map(m => ({
        role: m.role,
        parts: m.parts
      }));

      const response = await chatWithAssistant(session.user.id, apiMessages);

      if (response && response.text) {
        const finalMessages: Message[] = [
          ...newMessages,
          { role: 'model', parts: [{ text: response.text }] }
        ];
        setMessages(finalMessages);
        updateSessionMessages(finalMessages);

        if (onRefreshData) {
          onRefreshData();
        }
      }
    } catch (error) {
      console.error(error);
      const errMessages: Message[] = [
        ...newMessages,
        { role: 'model', parts: [{ text: 'Lo siento, ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo.' }] }
      ];
      setMessages(errMessages);
      updateSessionMessages(errMessages);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.chatContainer}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.historyToggleButton}>
                <FontAwesome name="history" size={16} color="#00D09E" />
              </TouchableOpacity>
              <View style={styles.aiIconContainer}>
                <FontAwesome name="magic" size={14} color="#00D09E" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Finiax AI</Text>
                <Text style={styles.headerSubtitle}>Asistente Financiero Inteligente</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <FontAwesome name="close" size={20} color="#888" />
            </TouchableOpacity>
          </View>

          {/* Messages List */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messageList}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          >
            {messages.map((m, idx) => {
              const isAi = m.role === 'model';
              const textPart = m.parts.find((p: any) => p.text);
              const textContent = textPart ? textPart.text : '';
              return (
                <View
                  key={idx}
                  style={[
                    styles.messageBubbleContainer,
                    isAi ? styles.messageLeft : styles.messageRight
                  ]}
                >
                  {isAi && (
                    <View style={styles.avatarBubble}>
                      <FontAwesome name="magic" size={12} color="#00D09E" />
                    </View>
                  )}
                  <View
                    style={[
                      styles.bubble,
                      isAi ? styles.bubbleAi : styles.bubbleUser
                    ]}
                  >
                    <Text style={isAi ? styles.textAi : styles.textUser}>
                      {textContent}
                    </Text>

                    {m.attachmentName && (
                      <View style={[styles.attachmentPill, { backgroundColor: isAi ? '#252525' : 'rgba(18, 18, 18, 0.2)' }]}>
                        <FontAwesome name="file" size={10} color={isAi ? '#00D09E' : '#121212'} />
                        <Text style={[styles.attachmentPillText, { color: isAi ? '#FFF' : '#121212' }]} numberOfLines={1}>
                          {m.attachmentName}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {loading && (
              <View style={[styles.messageBubbleContainer, styles.messageLeft]}>
                <View style={styles.avatarBubble}>
                  <FontAwesome name="magic" size={12} color="#00D09E" />
                </View>
                <View style={[styles.bubble, styles.bubbleAi, styles.loadingBubble]}>
                  <ActivityIndicator size="small" color="#00D09E" />
                  <Text style={[styles.textAi, { marginLeft: 8 }]}>Procesando...</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Attachment Preview */}
          {attachment && (
            <View style={styles.previewContainer}>
              <View style={styles.previewCard}>
                {attachment.mimeType.startsWith('image/') ? (
                  <Image source={{ uri: attachment.uri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewIconBox}>
                    <FontAwesome name="file-text" size={24} color="#00D09E" />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.previewName} numberOfLines={1}>{attachment.name}</Text>
                  <Text style={styles.previewSize}>Listo para procesar</Text>
                </View>
                <TouchableOpacity onPress={() => setAttachment(null)} style={styles.discardButton}>
                  <FontAwesome name="times-circle" size={20} color="#FF4C4C" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Options Drawer/Menu */}
          {showOptions && (
            <View style={styles.optionsDrawer}>
              <TouchableOpacity style={styles.optionItem} onPress={handlePickImage}>
                <View style={[styles.optionIcon, { backgroundColor: 'rgba(52, 152, 219, 0.15)' }]}>
                  <FontAwesome name="image" size={16} color="#3498DB" />
                </View>
                <Text style={styles.optionText}>Subir Foto / Comprobante</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionItem} onPress={handlePickDocument}>
                <View style={[styles.optionIcon, { backgroundColor: 'rgba(230, 126, 34, 0.15)' }]}>
                  <FontAwesome name="file-pdf-o" size={16} color="#E67E22" />
                </View>
                <Text style={styles.optionText}>Subir Documento (PDF, Excel, CSV)</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Input Box */}
          <View style={styles.inputArea}>
            <TouchableOpacity
              onPress={() => setShowOptions(!showOptions)}
              style={[styles.attachButton, showOptions && { backgroundColor: '#252525' }]}
            >
              <FontAwesome name="plus" size={16} color="#00D09E" />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Pregúntale a Finiax AI..."
              placeholderTextColor="#666"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity
              onPress={handleSend}
              style={[
                styles.sendButton,
                { backgroundColor: (input.trim() || attachment) ? '#00D09E' : '#1A2F2C' }
              ]}
              disabled={(!input.trim() && !attachment) || loading}
            >
              <FontAwesome name="send" size={16} color={(input.trim() || attachment) ? '#121212' : '#00D09E'} />
            </TouchableOpacity>
          </View>
          {/* Panel de Historial de Conversaciones (Drawer) */}
          {showHistory && (
            <View style={styles.historyDrawerOverlay}>
              <View style={styles.historyDrawer}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Historial de Chats</Text>
                  <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.historyCloseButton}>
                    <FontAwesome name="close" size={18} color="#888" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.newChatButton} onPress={handleCreateSession}>
                  <FontAwesome name="plus" size={12} color="#121212" style={{ marginRight: 8 }} />
                  <Text style={styles.newChatButtonText}>Nueva Conversación</Text>
                </TouchableOpacity>

                <ScrollView style={styles.sessionList}>
                  {sessions.map((item) => {
                    const isActive = item.id === activeSessionId;
                    const isRenaming = item.id === renamingSessionId;
                    return (
                      <View 
                        key={item.id} 
                        style={[
                          styles.sessionItemContainer,
                          isActive && styles.sessionItemActive
                        ]}
                      >
                        {isRenaming ? (
                          <View style={styles.renameContainer}>
                            <TextInput
                              style={styles.renameInput}
                              value={renameInput}
                              onChangeText={setRenameInput}
                              autoFocus
                              selectTextOnFocus
                              onSubmitEditing={() => handleRenameSession(item.id)}
                            />
                            <View style={styles.renameActions}>
                              <TouchableOpacity onPress={() => handleRenameSession(item.id)} style={styles.renameActionBtn}>
                                <FontAwesome name="check" size={12} color="#00D09E" />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setRenamingSessionId(null)} style={styles.renameActionBtn}>
                                <FontAwesome name="close" size={12} color="#FF4C4C" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity 
                            style={styles.sessionItemMain} 
                            onPress={() => handleSelectSession(item.id)}
                          >
                            <FontAwesome name="comments-o" size={16} color={isActive ? '#00D09E' : '#888'} style={{ marginRight: 10 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.sessionItemTitle, isActive && styles.sessionItemTitleActive]} numberOfLines={1}>
                                {item.title}
                              </Text>
                              <Text style={styles.sessionItemDate}>
                                {new Date(item.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        )}
                        
                        {!isRenaming && (
                          <View style={styles.sessionItemActions}>
                            <TouchableOpacity 
                              style={styles.sessionActionBtn} 
                              onPress={() => {
                                setRenamingSessionId(item.id);
                                setRenameInput(item.title);
                              }}
                            >
                              <FontAwesome name="pencil" size={12} color="#888" />
                            </TouchableOpacity>
                            <TouchableOpacity 
                              style={styles.sessionActionBtn} 
                              onPress={() => handleDeleteSession(item.id)}
                            >
                              <FontAwesome name="trash" size={12} color="#FF4C4C" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 5, 0.75)',
    justifyContent: 'flex-end',
  },
  chatContainer: {
    height: screenHeight * 0.82,
    backgroundColor: '#151515',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#252525',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
    backgroundColor: '#181818',
  },
  aiIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 208, 158, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 158, 0.25)',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 11,
  },
  closeButton: {
    padding: 8,
  },
  messageList: {
    flex: 1,
    backgroundColor: '#121212',
  },
  messageBubbleContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '85%',
  },
  messageLeft: {
    alignSelf: 'flex-start',
    alignItems: 'flex-end',
  },
  messageRight: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  avatarBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 208, 158, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 158, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleAi: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: '#00D09E',
    borderBottomRightRadius: 4,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textAi: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
  },
  textUser: {
    color: '#121212',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  attachmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  attachmentPillText: {
    fontSize: 11,
    maxWidth: 150,
  },
  previewContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#181818',
    borderTopWidth: 1,
    borderTopColor: '#252525',
  },
  previewCard: {
    flexDirection: 'row',
    backgroundColor: '#1F1F1F',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  previewImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  previewIconBox: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 208, 158, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  previewSize: {
    color: '#888',
    fontSize: 10,
  },
  discardButton: {
    padding: 6,
  },
  optionsDrawer: {
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#2E2E2E',
    padding: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionText: {
    color: '#FFF',
    fontSize: 14,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#181818',
    borderTopWidth: 1,
    borderTopColor: '#252525',
    alignItems: 'center',
    gap: 12,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F1F1F',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  input: {
    flex: 1,
    backgroundColor: '#1F1F1F',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  historyToggleButton: {
    padding: 8,
    backgroundColor: '#222',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyDrawerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 5, 0.75)',
    zIndex: 10,
    flexDirection: 'row',
  },
  historyDrawer: {
    width: '80%',
    height: '100%',
    backgroundColor: '#151515',
    borderRightWidth: 1,
    borderRightColor: '#252525',
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyCloseButton: {
    padding: 6,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00D09E',
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  newChatButtonText: {
    color: '#121212',
    fontSize: 13,
    fontWeight: 'bold',
  },
  sessionList: {
    flex: 1,
  },
  sessionItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252525',
  },
  sessionItemActive: {
    borderColor: '#00D09E',
    backgroundColor: '#1c2e28',
  },
  sessionItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionItemTitle: {
    color: '#DDD',
    fontSize: 13,
    fontWeight: '500',
  },
  sessionItemTitleActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  sessionItemDate: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
  sessionItemActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  sessionActionBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#252525',
  },
  renameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  renameInput: {
    flex: 1,
    backgroundColor: '#252525',
    color: '#FFF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  renameActions: {
    flexDirection: 'row',
    gap: 4,
  },
  renameActionBtn: {
    padding: 6,
    backgroundColor: '#252525',
    borderRadius: 6,
  },
});
