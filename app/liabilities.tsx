import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { formatCurrency, formatNumber } from '@/lib/utils';

type Liability = {
  id: string;
  name: string;
  type: string;
  total_amount: number;
  remaining_amount: number;
  monthly_payment: number | null;
  interest_rate: number | null;
};

export default function LiabilitiesScreen() {
  const { session } = useAuth();
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('credit_card');
  const [newTotal, setNewTotal] = useState('');
  const [newRemaining, setNewRemaining] = useState('');
  const [newMonthly, setNewMonthly] = useState('');

  useEffect(() => {
    if (session?.user?.id) {
      loadLiabilities();
    }
  }, [session]);

  const loadLiabilities = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('liabilities')
        .select('*')
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLiabilities(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLiability = async () => {
    if (!newName || !newTotal || !newRemaining) {
      Alert.alert('Error', 'Complete los campos obligatorios');
      return;
    }

    const { error } = await supabase.from('liabilities').insert({
      user_id: session!.user.id,
      name: newName,
      type: newType,
      total_amount: Number(newTotal),
      remaining_amount: Number(newRemaining),
      monthly_payment: newMonthly ? Number(newMonthly) : null,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewName('');
      setNewTotal('');
      setNewRemaining('');
      setNewMonthly('');
      loadLiabilities();
    }
  };

  const handlePay = async (liability: Liability) => {
    Alert.prompt(
      'Abonar a Deuda',
      `¿Cuánto deseas abonar a ${liability.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pagar',
          onPress: async (val) => {
            const amount = Number(val);
            if (isNaN(amount) || amount <= 0) {
              Alert.alert('Monto inválido');
              return;
            }
            if (amount > liability.remaining_amount) {
              Alert.alert('Error', 'El abono supera la deuda restante.');
              return;
            }

            const newRemaining = liability.remaining_amount - amount;

            // Actualizar deuda
            const { error } = await supabase
              .from('liabilities')
              .update({ remaining_amount: newRemaining })
              .eq('id', liability.id);

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              // Registrar gasto
              await supabase.from('transactions').insert({
                user_id: session!.user.id,
                name: `Pago de ${liability.name}`,
                amount: amount,
                type: 'expense',
                category: 'Deudas',
                payment_method: 'cash',
              });

              Alert.alert('Éxito', 'Pago registrado correctamente.');
              loadLiabilities();
            }
          }
        }
      ],
      'plain-text',
      liability.monthly_payment ? String(liability.monthly_payment) : ''
    );
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#00D09E" size="large" /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Mis Deudas</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nueva Deuda</Text>
        <TextInput style={styles.input} placeholder="Nombre (ej. Tarjeta Visa)" placeholderTextColor="#888" value={newName} onChangeText={setNewName} />
        
        <View style={styles.typeSelector}>
          <TouchableOpacity style={[styles.typeBtn, newType === 'credit_card' && styles.typeBtnActive]} onPress={() => setNewType('credit_card')}>
            <Text style={styles.typeText}>Tarjeta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.typeBtn, newType === 'loan' && styles.typeBtnActive]} onPress={() => setNewType('loan')}>
            <Text style={styles.typeText}>Préstamo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.typeBtn, newType === 'mortgage' && styles.typeBtnActive]} onPress={() => setNewType('mortgage')}>
            <Text style={styles.typeText}>Hipoteca</Text>
          </TouchableOpacity>
        </View>

        <TextInput style={styles.input} placeholder="Monto Total Original" placeholderTextColor="#888" value={newTotal} onChangeText={setNewTotal} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Monto Restante Actual" placeholderTextColor="#888" value={newRemaining} onChangeText={setNewRemaining} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Pago Mensual (Opcional)" placeholderTextColor="#888" value={newMonthly} onChangeText={setNewMonthly} keyboardType="numeric" />
        
        <TouchableOpacity style={styles.button} onPress={handleAddLiability}>
          <Text style={styles.buttonText}>Añadir Deuda</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Deudas Activas</Text>
      {liabilities.length === 0 && <Text style={{ color: '#888' }}>No tienes deudas registradas.</Text>}
      {liabilities.map((lib) => {
        const progress = Math.max(0, Math.min(100, ((lib.total_amount - lib.remaining_amount) / lib.total_amount) * 100));
        return (
          <View key={lib.id} style={styles.liabilityCard}>
            <View style={styles.liabilityHeader}>
              <Text style={styles.liabilityName}>{lib.name}</Text>
              <Text style={styles.liabilityAmount}>${formatCurrency(lib.remaining_amount)}</Text>
            </View>
            <Text style={styles.liabilityText}>Total: ${formatCurrency(lib.total_amount)}</Text>
            
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>{formatNumber(progress, 1)}% Pagado</Text>

            <TouchableOpacity style={styles.payButton} onPress={() => handlePay(lib)}>
              <Text style={styles.payButtonText}>Registrar Pago</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      
      <View style={{height: 50}}/>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24 },
  centered: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 16 },
  card: { backgroundColor: '#1A1A1A', padding: 20, borderRadius: 16, marginBottom: 24 },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { backgroundColor: '#2A2A2A', color: '#FFF', borderRadius: 8, padding: 12, marginBottom: 12 },
  typeSelector: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  typeBtn: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#2A2A2A', alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#FF4C4C' },
  typeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  button: { backgroundColor: '#00D09E', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF', marginBottom: 16 },
  liabilityCard: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#333' },
  liabilityHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  liabilityName: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  liabilityAmount: { color: '#FF4C4C', fontSize: 18, fontWeight: 'bold' },
  liabilityText: { color: '#AAA', fontSize: 14, marginBottom: 12 },
  progressBg: { height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: '#00D09E' },
  progressText: { color: '#AAA', fontSize: 12, textAlign: 'right', marginBottom: 12 },
  payButton: { backgroundColor: '#333', padding: 10, borderRadius: 8, alignItems: 'center' },
  payButtonText: { color: '#00D09E', fontWeight: 'bold' },
});
