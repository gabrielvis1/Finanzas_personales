import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Estados del CAPTCHA
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  // Estados de recuperación de contraseña
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySuccessMsg, setRecoverySuccessMsg] = useState('');

  useEffect(() => {
    generateCaptcha();
  }, []);

  function generateCaptcha() {
    setNum1(Math.floor(Math.random() * 9) + 2); // Entre 2 y 10
    setNum2(Math.floor(Math.random() * 9) + 2); // Entre 2 y 10
    setCaptchaAnswer('');
  }

  async function signInWithEmail() {
    setErrorMsg('');
    
    // Validar CAPTCHA
    const parsedAnswer = parseInt(captchaAnswer.trim());
    if (isNaN(parsedAnswer) || parsedAnswer !== num1 + num2) {
      setErrorMsg('El CAPTCHA es incorrecto. Resuelve la suma para continuar.');
      generateCaptcha();
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    if (error) {
      setErrorMsg(error.message);
      generateCaptcha();
    }
    setLoading(false);
  }

  async function signInWithSocial(provider: 'google' | 'facebook') {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: 'myapp://home' // Redirección deep link
        }
      });
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('Error de Autenticación', e.message);
    }
  }

  async function handleSendRecoveryEmail() {
    if (!recoveryEmail.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu correo electrónico.');
      return;
    }
    setRecoveryLoading(true);
    setRecoverySuccessMsg('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
        redirectTo: 'myapp://reset-password',
      });
      if (error) throw error;
      setRecoverySuccessMsg('Enlace enviado. Revisa tu bandeja de entrada o spam.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Finiax</Text>
          <Text style={styles.subtitle}>Tu gestor financiero inteligente</Text>
        </View>

        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Correo electrónico"
            placeholderTextColor="#888"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor="#888"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* CAPTCHA Matemático */}
          <View style={styles.captchaContainer}>
            <View style={styles.captchaBox}>
              <FontAwesome name="shield" size={16} color="#00D09E" style={{ marginRight: 8 }} />
              <Text style={styles.captchaText}>Seguridad: ¿Cuánto es {num1} + {num2}?</Text>
            </View>
            <TextInput
              style={styles.captchaInput}
              placeholder="Resultado"
              placeholderTextColor="#666"
              value={captchaAnswer}
              onChangeText={setCaptchaAnswer}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <TouchableOpacity 
            style={styles.button} 
            onPress={signInWithEmail} 
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>Iniciar Sesión</Text>
            )}
          </TouchableOpacity>

          {/* Recuperación de contraseña */}
          <TouchableOpacity 
            onPress={() => {
              setRecoverySuccessMsg('');
              setRecoveryEmail('');
              setShowRecoveryModal(true);
            }} 
            style={styles.forgotBtn}
          >
            <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>

          {/* Separador */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>O continúa con</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Botones Sociales */}
          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialBtn} onPress={() => signInWithSocial('google')}>
              <FontAwesome name="google" size={20} color="#EA4335" />
              <Text style={styles.socialBtnText}>Google</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.socialBtn} onPress={() => signInWithSocial('facebook')}>
              <FontAwesome name="facebook" size={20} color="#1877F2" />
              <Text style={styles.socialBtnText}>Facebook</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>¿No tienes una cuenta? </Text>
            <Link href="/register" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Regístrate aquí</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </View>

      {/* Modal de Recuperación */}
      <Modal
        visible={showRecoveryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRecoveryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recuperar Cuenta</Text>
              <TouchableOpacity onPress={() => setShowRecoveryModal(false)} style={styles.closeBtn}>
                <FontAwesome name="close" size={20} color="#888" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Ingresa tu correo electrónico y te enviaremos las instrucciones para restablecer tu contraseña.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Correo electrónico"
              placeholderTextColor="#666"
              value={recoveryEmail}
              onChangeText={setRecoveryEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {recoverySuccessMsg ? <Text style={styles.successText}>{recoverySuccessMsg}</Text> : null}

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleSendRecoveryEmail}
              disabled={recoveryLoading}
            >
              {recoveryLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.modalSubmitText}>Enviar Correo</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  headerContainer: {
    marginBottom: 36,
    alignItems: 'center',
  },
  title: {
    fontSize: 44,
    fontWeight: 'bold',
    color: '#00D09E',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#A0A0A0',
  },
  formContainer: {
    width: '100%',
  },
  input: {
    backgroundColor: '#1A1A1A',
    color: '#FFF',
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#262626',
  },
  captchaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  captchaBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#262626',
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  captchaText: {
    color: '#DDD',
    fontSize: 12,
    fontWeight: '600',
  },
  captchaInput: {
    width: 90,
    backgroundColor: '#1A1A1A',
    color: '#00D09E',
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#00D09E',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  forgotBtn: {
    alignSelf: 'center',
    marginTop: 18,
    padding: 6,
  },
  forgotText: {
    color: '#888',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#262626',
  },
  dividerText: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#262626',
    height: 52,
    borderRadius: 12,
  },
  socialBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  footerText: {
    color: '#A0A0A0',
    fontSize: 13,
  },
  linkText: {
    color: '#00D09E',
    fontSize: 13,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#FF4C4C',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  successText: {
    color: '#00D09E',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 6,
  },
  modalDesc: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#1A1A1A',
    color: '#FFF',
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#262626',
  },
  modalSubmitBtn: {
    backgroundColor: '#00D09E',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#000',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
