import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { FontAwesome } from '@expo/vector-icons';
import { formatCurrency } from '@/lib/utils';

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
};

export default function GoalsScreen() {
  const { session } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Nueva Meta
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');

  // Transferencia a Meta
  const [fundAmount, setFundAmount] = useState('');
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.id) {
      loadGoals();
    }
  }, [session]);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', session!.user.id);

      if (error) throw error;
      setGoals(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGoal = async () => {
    if (!newGoalName || !newGoalTarget || isNaN(Number(newGoalTarget))) {
      Alert.alert('Error', 'Ingrese un nombre y un monto válido.');
      return;
    }

    const { error } = await supabase.from('goals').insert({
      user_id: session!.user.id,
      name: newGoalName,
      target_amount: Number(newGoalTarget),
      current_amount: 0,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewGoalName('');
      setNewGoalTarget('');
      loadGoals();
    }
  };

  const handleFundGoal = async () => {
    if (!selectedGoal || !fundAmount || isNaN(Number(fundAmount))) {
      Alert.alert('Error', 'Seleccione una meta y un monto válido.');
      return;
    }

    const goal = goals.find(g => g.id === selectedGoal);
    if (!goal) return;

    const newAmount = goal.current_amount + Number(fundAmount);

    const { error } = await supabase
      .from('goals')
      .update({ current_amount: newAmount })
      .eq('id', selectedGoal);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setFundAmount('');
      setSelectedGoal(null);
      
      // Registrar como un "gasto" para que reste del balance principal
      await supabase.from('transactions').insert({
        user_id: session!.user.id,
        amount: Number(fundAmount),
        type: 'expense',
        category: 'Ahorro / Metas',
        description: `Fondeo a meta: ${goal.name}`,
        is_ai_validated: false
      });

      Alert.alert('Éxito', 'Fondos transferidos a la meta y registrados como movimiento.');
      loadGoals();
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#FFD700" size="large" /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Mis Metas de Ahorro</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Crear Nueva Meta</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre (ej. Viaje a Japón)"
          placeholderTextColor="#888"
          value={newGoalName}
          onChangeText={setNewGoalName}
        />
        <TextInput
          style={styles.input}
          placeholder="Monto Objetivo ($)"
          placeholderTextColor="#888"
          value={newGoalTarget}
          onChangeText={setNewGoalTarget}
          keyboardType="numeric"
        />
        <TouchableOpacity style={styles.button} onPress={handleAddGoal}>
          <Text style={styles.buttonText}>Crear Meta</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Bóvedas Actuales</Text>
      {goals.map((goal) => {
        const progress = Math.min((goal.current_amount / goal.target_amount) * 100, 100);

        return (
          <TouchableOpacity 
            key={goal.id} 
            style={[styles.goalCard, selectedGoal === goal.id && styles.selectedCard]}
            onPress={() => setSelectedGoal(goal.id === selectedGoal ? null : goal.id)}
          >
            <View style={styles.goalHeader}>
              <Text style={styles.goalName}>
                {selectedGoal === goal.id ? <FontAwesome name="check-circle" size={16} color="#00D09E" /> : null} {goal.name}
              </Text>
              <Text style={styles.goalAmounts}>
                ${formatCurrency(goal.current_amount)} / ${formatCurrency(goal.target_amount)}
              </Text>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
          </TouchableOpacity>
        );
      })}

      {selectedGoal && (
        <View style={styles.fundCard}>
          <Text style={styles.cardTitle}>Fondear Meta Seleccionada</Text>
          <TextInput
            style={styles.input}
            placeholder="Monto a transferir ($)"
            placeholderTextColor="#888"
            value={fundAmount}
            onChangeText={setFundAmount}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.fundButton} onPress={handleFundGoal}>
            <Text style={styles.buttonText}>Transferir</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24 },
  centered: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 24 },
  card: { backgroundColor: '#1A1A1A', padding: 20, borderRadius: 16, marginBottom: 24 },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { backgroundColor: '#2A2A2A', color: '#FFF', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#FFD700', padding: 14, borderRadius: 8, alignItems: 'center' },
  fundButton: { backgroundColor: '#00D09E', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF', marginBottom: 16 },
  goalCard: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: 'transparent' },
  selectedCard: { borderColor: '#00D09E' },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  goalName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  goalAmounts: { color: '#AAA', fontSize: 14 },
  progressBarContainer: { height: 8, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4, backgroundColor: '#FFD700' },
  fundCard: { backgroundColor: '#1A1A1A', padding: 20, borderRadius: 16, marginTop: 8, marginBottom: 40, borderColor: '#00D09E', borderWidth: 1 },
});
