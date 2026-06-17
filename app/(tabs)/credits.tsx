import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { FontAwesome } from '@expo/vector-icons';
import { CreditLineService, CreditLine } from '@/lib/services/CreditLineService';

const ICONS = [
  'credit-card', 'credit-card-alt', 'bank', 'money', 'building', 'car', 'motorcycle',
  'shopping-cart', 'gift', 'plane', 'laptop', 'mobile'
];

export default function CreditsScreen() {
  const { session } = useAuth();
  const [creditLines, setCreditLines] = useState<CreditLine[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'credit_card' | 'loan'>('credit_card');
  const [formLimit, setFormLimit] = useState('');
  const [formCutOff, setFormCutOff] = useState('');
  const [formDue, setFormDue] = useState('');
  const [formIcon, setFormIcon] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.id) {
      loadCreditLines();
    }
  }, [session]);

  const loadCreditLines = async () => {
    setLoading(true);
    try {
      const data = await CreditLineService.getCreditLines(session!.user.id);
      setCreditLines(data);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
    setLoading(false);
  };

  const openModal = (c?: CreditLine) => {
    if (c) {
      setEditingId(c.id);
      setFormName(c.name);
      setFormType(c.type);
      setFormLimit(c.limit_amount ? c.limit_amount.toString() : '');
      setFormCutOff(c.cut_off_day ? c.cut_off_day.toString() : '');
      setFormDue(c.payment_due_day ? c.payment_due_day.toString() : '');
      setFormIcon(c.icon);
    } else {
      setEditingId(null);
      setFormName('');
      setFormType('credit_card');
      setFormLimit('');
      setFormCutOff('');
      setFormDue('');
      setFormIcon('credit-card');
    }
    setModalVisible(true);
  };

  const saveCreditLine = async () => {
    if (!formName.trim()) {
      Alert.alert('Aviso', 'Debe ingresar un nombre');
      return;
    }

    try {
      await CreditLineService.saveCreditLine(session!.user.id, {
        id: editingId,
        name: formName,
        type: formType,
        limit_amount: formLimit ? Number(formLimit) : null,
        cut_off_day: formCutOff ? Number(formCutOff) : null,
        payment_due_day: formDue ? Number(formDue) : null,
        icon: formIcon
      });
      setModalVisible(false);
      loadCreditLines();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const deleteCreditLine = async (id: string) => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Seguro que deseas eliminar esta línea de crédito?')) {
        try {
          await CreditLineService.deleteCreditLine(id);
          setModalVisible(false);
          loadCreditLines();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
      }
      return;
    }
    Alert.alert('Eliminar', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await CreditLineService.deleteCreditLine(id);
            setModalVisible(false);
            loadCreditLines();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
      }}
    ]);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#00D09E" size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Mis Líneas de Crédito</Text>
      <Text style={styles.headerSubtitle}>Tarjetas, Préstamos y Deudas activas</Text>

      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16}}>
        {creditLines.length === 0 && (
           <View style={styles.emptyBox}>
             <FontAwesome name="credit-card" size={40} color="#333" style={{marginBottom: 10}} />
             <Text style={styles.emptyText}>No tienes tarjetas ni préstamos configurados.</Text>
           </View>
        )}

        {creditLines.map(c => (
          <TouchableOpacity key={c.id} style={styles.card} onPress={() => openModal(c)}>
            <View style={styles.cardHeader}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <View style={styles.iconBox}>
                  <FontAwesome name={(c.icon as any) || 'credit-card'} size={16} color="#00D09E" />
                </View>
                <Text style={styles.cardName}>{c.name}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: c.type === 'credit_card' ? '#1E3A8A' : '#78350F' }]}>
                <Text style={styles.badgeText}>{c.type === 'credit_card' ? 'Tarjeta' : 'Préstamo'}</Text>
              </View>
            </View>
            
            <View style={styles.cardDetails}>
              {c.limit_amount ? <Text style={styles.detailText}>Límite: ${c.limit_amount}</Text> : null}
              {c.cut_off_day ? <Text style={styles.detailText}>Cierre: día {c.cut_off_day}</Text> : null}
              {c.payment_due_day ? <Text style={styles.detailText}>Vto: día {c.payment_due_day}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => openModal()}>
        <FontAwesome name="plus" size={20} color="#000" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Text style={styles.modalTitle}>{editingId ? 'Editar Crédito' : 'Nueva Línea de Crédito'}</Text>

            <View style={styles.typeSelector}>
               <TouchableOpacity style={[styles.typeBtn, formType === 'credit_card' && styles.typeBtnActive]} onPress={() => setFormType('credit_card')}>
                 <FontAwesome name="credit-card" size={16} color={formType === 'credit_card' ? '#000' : '#888'} />
                 <Text style={[styles.typeText, formType === 'credit_card' && {color: '#000'}]}>Tarjeta</Text>
               </TouchableOpacity>
               <TouchableOpacity style={[styles.typeBtn, formType === 'loan' && styles.typeBtnActive]} onPress={() => setFormType('loan')}>
                 <FontAwesome name="money" size={16} color={formType === 'loan' ? '#000' : '#888'} />
                 <Text style={[styles.typeText, formType === 'loan' && {color: '#000'}]}>Préstamo</Text>
               </TouchableOpacity>
            </View>

            <TextInput style={styles.input} placeholder="Nombre (ej. Visa Macro, Auto)" placeholderTextColor="#888" value={formName} onChangeText={setFormName} />
            <TextInput style={styles.input} placeholder="Límite o Monto Total (Opcional)" placeholderTextColor="#888" keyboardType="numeric" value={formLimit} onChangeText={setFormLimit} />
            
            <View style={{flexDirection: 'row', gap: 10}}>
              {formType === 'credit_card' && (
                 <TextInput style={[styles.input, {flex: 1}]} placeholder="Día de Cierre" placeholderTextColor="#888" keyboardType="numeric" value={formCutOff} onChangeText={setFormCutOff} />
              )}
              <TextInput style={[styles.input, {flex: 1}]} placeholder="Día de Vencimiento" placeholderTextColor="#888" keyboardType="numeric" value={formDue} onChangeText={setFormDue} />
            </View>

            <Text style={styles.modalLabel}>Ícono</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 20}}>
              {ICONS.map((ic) => (
                <TouchableOpacity key={ic} style={[styles.iconCircle, formIcon === ic && styles.iconCircleActive]} onPress={() => setFormIcon(ic)}>
                  <FontAwesome name={ic as any} size={16} color={formIcon === ic ? '#00D09E' : '#888'} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{flexDirection: 'row', gap: 8}}>
              {editingId && (
                <TouchableOpacity style={[styles.btn, {backgroundColor: '#FF4C4C', flex: 1}]} onPress={() => deleteCreditLine(editingId)}>
                  <FontAwesome name="trash" size={16} color="#FFF" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.btn, {backgroundColor: '#333', flex: 1.5}]} onPress={() => setModalVisible(false)}>
                <Text style={{color: '#FFF', fontWeight: 'bold'}}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, {backgroundColor: '#00D09E', flex: 2}]} onPress={saveCreditLine}>
                <Text style={{color: '#000', fontWeight: 'bold'}}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  centered: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginHorizontal: 16, marginTop: 20 },
  headerSubtitle: { color: '#888', fontSize: 12, marginHorizontal: 16, marginBottom: 10 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { color: '#555', fontSize: 14 },
  card: { backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  iconBox: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  cardDetails: { flexDirection: 'row', gap: 16 },
  detailText: { color: '#AAA', fontSize: 12 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#00D09E', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#111', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  typeSelector: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, flexDirection: 'row', padding: 12, borderRadius: 8, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#333' },
  typeBtnActive: { backgroundColor: '#00D09E', borderColor: '#00D09E' },
  typeText: { color: '#888', fontWeight: 'bold' },
  input: { backgroundColor: '#222', color: '#FFF', padding: 14, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  modalLabel: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', marginRight: 8, borderWidth: 1, borderColor: '#333' },
  iconCircleActive: { borderColor: '#00D09E', backgroundColor: '#333' },
  btn: { padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }
});
