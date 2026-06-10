import React, { useState, useEffect, createElement, useCallback } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { analyzeReceipt, processVoiceAssistant } from '@/lib/gemini';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatCurrency } from '@/lib/utils';

export default function CashFlowScreen() {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'debit' | 'credit_card'>('cash');
  const [budgetCategories, setBudgetCategories] = useState<{name: string, icon: string | null}[]>([]);
  
  // Credits & Installments
  const [creditLines, setCreditLines] = useState<{id: string, name: string, type: string}[]>([]);
  const [selectedCreditLineId, setSelectedCreditLineId] = useState<string | null>(null);
  
  const [showInstallmentsModal, setShowInstallmentsModal] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState('1');
  const [interestRate, setInterestRate] = useState('0'); // % total
  const [installmentsEnabled, setInstallmentsEnabled] = useState(false);
  const [startMonth, setStartMonth] = useState(new Date().getMonth() + 1);
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // History
  const [transactionsHistory, setTransactionsHistory] = useState<any[]>([]);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase.from('transactions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
      .limit(30);
    if (data) setTransactionsHistory(data);
  }, [session]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Voice State
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState('');

  useEffect(() => {
    if (session?.user?.id) {
       const fetchCategories = async () => {
         const today = new Date();
         const { data } = await supabase.from('budgets')
            .select('category, icon')
            .eq('user_id', session.user.id)
            .eq('month', today.getMonth() + 1)
            .eq('year', today.getFullYear());
         
         if (data) {
           const catMap = new Map<string, string | null>();
           data.forEach(b => {
             if (!catMap.has(b.category) || b.icon) catMap.set(b.category, b.icon);
           });
           const uniqueCats = Array.from(catMap.entries()).map(([name, icon]) => ({ name, icon }));
           setBudgetCategories(uniqueCats);
         }
       };
       
       const fetchCreditLines = async () => {
         const { data } = await supabase.from('credit_lines').select('id, name, type').eq('user_id', session.user.id);
         if (data) {
           setCreditLines(data);
           if (data.length > 0) setSelectedCreditLineId(data[0].id);
         }
       };

       fetchCategories();
       fetchCreditLines();
    }
  }, [session]);

  const handleScanReceipt = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setAiLoading(true);
      try {
        const base64Data = result.assets[0].base64;
        const mimeType = result.assets[0].mimeType || 'image/jpeg';
        
        const aiData = await analyzeReceipt(base64Data, mimeType);
        
        if (!aiData.is_valid) {
          setErrorMsg('La IA determinó que la imagen no parece ser una factura o recibo real.');
        } else {
          setName(aiData.description ? aiData.description.substring(0, 30) : 'Compra');
          setAmount(aiData.amount.toString());
          setCategory(aiData.category);
          setDescription(aiData.description || '');
          setType(aiData.type as 'income' | 'expense');
          setIsValidated(true);
          setSuccessMsg('¡Escaneo Exitoso! Datos autocompletados.');
        }
      } catch (error: any) {
        setErrorMsg(error.message || 'No se pudo analizar el recibo. Verifica tu API Key.');
      }
      setAiLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setIsRecording(true);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg('No se pudo acceder al micrófono');
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    setAiLoading(true);
    try {
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        let base64data = '';
        let mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';

        if (Platform.OS === 'web') {
          const res = await fetch(uri);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          await new Promise((resolve) => {
            reader.onloadend = () => {
              base64data = (reader.result as string).split(',')[1];
              resolve(null);
            };
          });
        } else {
          base64data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        }

        const response = await processVoiceAssistant(base64data, mimeType, chatHistory);
        
        if (response.complete) {
          setAiMessage(response.message);
          setName(response.transaction.name);
          setAmount(response.transaction.amount.toString());
          setCategory(response.transaction.category);
          setType(response.transaction.type);
          setPaymentMethod(response.transaction.payment_method);
          setChatHistory(''); // Reiniciar charla
          setIsValidated(true);
        } else {
          setAiMessage(response.message);
          setChatHistory(chatHistory + " " + response.message);
        }
      }
    } catch (err: any) {
       setErrorMsg(err.message || 'Error procesando voz');
    }
    setAiLoading(false);
  };

  const clearForm = () => {
    setAmount('');
    setName('');
    setDescription('');
    setCategory('General');
    setDate(new Date());
    setAiMessage('');
    setIsValidated(false);
    setEditingTransactionId(null);
    setPaymentMethod('cash');
    setInstallmentsEnabled(false);
  };

  const handleSaveTransaction = async () => {
    if (!amount || isNaN(Number(amount)) || !name) {
      setErrorMsg('Ingrese un nombre y un monto válido');
      return;
    }
    if (!session?.user?.id) return;

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const transactionData = {
      name,
      amount: Number(amount),
      type,
      category,
      payment_method: paymentMethod,
      description,
      is_ai_validated: isValidated,
      date: date.toISOString()
    };

    let isSuccess = false;
    let msg = '';

    if (editingTransactionId) {
      const { error } = await supabase.from('transactions').update(transactionData).eq('id', editingTransactionId);
      if (error) {
        setErrorMsg(error.message);
      } else {
        msg = 'Transacción actualizada correctamente.';
        isSuccess = true;
        // Limpiar cuotas antiguas pendientes asociadas a este nombre si es crédito
        if (paymentMethod === 'credit_card') {
           await supabase.from('debt_installments')
             .delete()
             .eq('user_id', session.user.id)
             .eq('description', name)
             .eq('status', 'pending');
        }
      }
    } else {
      const { error } = await supabase.from('transactions').insert({
        user_id: session.user.id,
        ...transactionData
      });
      if (error) {
        setErrorMsg(error.message);
      } else {
        msg = 'Transacción guardada correctamente.';
        isSuccess = true;
      }
    }

    if (isSuccess) {
      // Manejar Cuotas si está activado
      if (paymentMethod === 'credit_card' && selectedCreditLineId && installmentsEnabled) {
        const principal = Number(amount);
        const count = Number(installmentsCount) || 1;
        const rate = Number(interestRate) || 0;
        const totalAmount = principal * (1 + (rate / 100));
        const installmentAmount = totalAmount / count;
        
        const installments = [];
        let currentMonth = startMonth;
        let currentYear = startYear;

        for (let i = 1; i <= count; i++) {
          installments.push({
            user_id: session.user.id,
            credit_line_id: selectedCreditLineId,
            description: name,
            amount: installmentAmount,
            interest_amount: (totalAmount - principal) / count,
            installment_number: i,
            total_installments: count,
            month: currentMonth,
            year: currentYear,
            status: 'pending',
            icon: category ? budgetCategories.find(c => c.name === category)?.icon : 'credit-card',
          });
          
          currentMonth++;
          if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
          }
        }

        const { error: instErr } = await supabase.from('debt_installments').insert(installments);
        if (instErr) {
          setErrorMsg('Guardado, pero hubo error al generar cuotas: ' + instErr.message);
          setLoading(false);
          return;
        } else {
          msg += `\n¡Se generaron ${count} cuotas exitosamente!`;
        }
      }

      // Procesar Pagos de Deuda
      const catLower = category.toLowerCase().trim();
      const isPagoDeudaCategory = catLower === 'pago de deuda' || catLower.startsWith('pago:') || catLower.startsWith('pago ');
      if (type === 'expense' && isPagoDeudaCategory) {
        let creditLineName = '';
        if (catLower.startsWith('pago:')) {
          creditLineName = category.substring(5).trim();
        } else if (catLower.startsWith('pago de ')) {
          creditLineName = category.substring(8).trim();
        } else if (catLower.startsWith('pago ')) {
          creditLineName = category.substring(5).trim();
        }

        console.log("=== PROCESAR PAGO DE DEUDA ===");
        console.log("Categoría:", category);
        console.log("Credit Line Name inferred:", creditLineName);
        let cl = creditLines.find(c => c.name.toLowerCase().trim() === creditLineName.toLowerCase().trim());
        if (!cl) {
          const searchStr = `${name} ${description}`.toLowerCase();
          cl = creditLines.find(c => searchStr.includes(c.name.toLowerCase().trim()));
        }
        console.log("Credit Line found:", cl);
        if (cl) {
          const { data: pendingInst, error: fetchErr } = await supabase.from('debt_installments')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('credit_line_id', cl.id)
            .eq('status', 'pending')
            .order('year', {ascending: true})
            .order('month', {ascending: true})
            .order('installment_number', {ascending: true});
            
          if (fetchErr) {
            console.error("Error fetching installments:", fetchErr);
          }
          console.log("Pending installments in DB:", pendingInst);
          if (pendingInst && pendingInst.length > 0) {
             const txDate = new Date(transactionData.date);
             const txMonth = txDate.getMonth() + 1;
             const txYear = txDate.getFullYear();
             console.log("txMonth:", txMonth, "txYear:", txYear);
 
             // Filtrar para imputar el pago únicamente a cuotas del mes de la transacción o anteriores
             const eligibleInst = pendingInst.filter(inst => 
               inst.year < txYear || (inst.year === txYear && inst.month <= txMonth)
             );
             console.log("Eligible installments for month:", eligibleInst);
 
             if (eligibleInst.length > 0) {
                let paymentLeft = Number(amount);
                let paidCount = 0;
                for (const inst of eligibleInst) {
                   console.log(`Checking inst amount: ${inst.amount}, paymentLeft: ${paymentLeft}`);
                   if (paymentLeft >= Number(inst.amount) - 1) { // -1 para margen de redondeo
                      const { error: updErr } = await supabase.from('debt_installments').update({ status: 'paid' }).eq('id', inst.id);
                      if (updErr) {
                        console.error("Error updating installment status to paid:", updErr);
                      } else {
                        console.log(`Updated installment ${inst.id} to paid`);
                        paymentLeft -= Number(inst.amount);
                        paidCount++;
                      }
                   }
                }
                if (paidCount > 0) {
                  msg += `\n¡Se marcaron ${paidCount} cuota(s) como pagada(s)!`;
                }
             } else {
               console.log("No eligible installments found for this month or earlier");
             }
          }
        } else {
          console.log("No matching credit line found in creditLines state array:", creditLines);
        }
      }
      
      if (isValidated && !editingTransactionId) {
        msg += '\n¡Has ganado 10 Finiax Coins por usar la IA!';
        const { data: profile } = await supabase.from('profiles').select('finiax_coins').eq('id', session.user.id).single();
        if (profile) {
          await supabase.from('profiles').update({ finiax_coins: Number(profile.finiax_coins) + 10 }).eq('id', session.user.id);
        }
      }
      
      setSuccessMsg(msg);
      clearForm();
      fetchHistory();
    }
    
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Nuevo Movimiento</Text>
      
      <View style={styles.aiRow}>
        <TouchableOpacity style={[styles.aiButton, { flex: 1, marginRight: 8 }]} onPress={handleScanReceipt} disabled={aiLoading || isRecording}>
          <FontAwesome name="camera" size={20} color="#000" style={{ marginRight: 8 }} />
          <Text style={styles.aiButtonText}>Factura</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.aiButton, { flex: 1, marginLeft: 8, backgroundColor: isRecording ? '#FF4C4C' : '#00D09E' }]} 
          onPress={isRecording ? stopRecording : startRecording} 
          disabled={aiLoading}
        >
          {aiLoading ? <ActivityIndicator color="#000" /> : (
            <>
              <FontAwesome name="microphone" size={20} color="#000" style={{ marginRight: 8 }} />
              <Text style={styles.aiButtonText}>{isRecording ? "Grabando..." : "Hablar con IA"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {aiMessage ? (
        <View style={styles.chatBubble}>
          <Text style={styles.chatText}><FontAwesome name="android" size={16} /> Gemini: {aiMessage}</Text>
        </View>
      ) : null}

      <View style={styles.typeSelector}>
        <TouchableOpacity 
          style={[styles.typeButton, type === 'expense' && styles.typeButtonActiveExpense]}
          onPress={() => setType('expense')}
        >
          <Text style={styles.typeButtonText}>Gasto</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.typeButton, type === 'income' && styles.typeButtonActiveIncome]}
          onPress={() => setType('income')}
        >
          <Text style={styles.typeButtonText}>Ingreso</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Detalles</Text>
      <TextInput
        style={styles.input}
        placeholder="Título (ej. Supermercado)"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Monto ($)"
        placeholderTextColor="#888"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
      />
      
      <Text style={styles.label}>Fecha y Hora</Text>
      <View style={{flexDirection: 'row', gap: 10, marginBottom: 16}}>
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#333', overflow: 'hidden' }}>
            {createElement('input', {
              type: 'date',
              value: date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'),
              max: new Date().toISOString().split('T')[0],
              style: { width: '100%', height: '100%', padding: '16px', backgroundColor: 'transparent', color: '#FFF', border: 'none', fontSize: '16px', outline: 'none', boxSizing: 'border-box' },
              onChange: (e: any) => {
                const parsed = new Date(e.target.value + 'T12:00:00');
                if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
                  const newDate = new Date(date);
                  newDate.setFullYear(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
                  setDate(newDate);
                }
              }
            })}
          </View>
        ) : (
          <TouchableOpacity style={[styles.input, {flex: 1, marginBottom: 0, justifyContent: 'center'}]} onPress={() => setShowDatePicker(true)}>
            <Text style={{color: '#FFF'}}>{date.toLocaleDateString()}</Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'web' ? (
          <View style={{ flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: '#333', overflow: 'hidden' }}>
            {createElement('input', {
              type: 'time',
              value: String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'),
              style: { width: '100%', height: '100%', padding: '16px', backgroundColor: 'transparent', color: '#FFF', border: 'none', fontSize: '16px', outline: 'none', boxSizing: 'border-box' },
              onChange: (e: any) => {
                const [h, m] = e.target.value.split(':');
                const newDate = new Date(date);
                newDate.setHours(Number(h), Number(m));
                setDate(newDate);
              }
            })}
          </View>
        ) : (
          <TouchableOpacity style={[styles.input, {flex: 1, marginBottom: 0, justifyContent: 'center'}]} onPress={() => setShowTimePicker(true)}>
            <Text style={{color: '#FFF'}}>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>
        )}
      </View>

      {Platform.OS !== 'web' && showDatePicker && (
        <DateTimePicker value={date} mode="date" display="default" maximumDate={new Date()} onChange={(event, selectedDate) => { setShowDatePicker(Platform.OS === 'ios'); if (selectedDate) setDate(selectedDate); }} />
      )}

      {Platform.OS !== 'web' && showTimePicker && (
        <DateTimePicker value={date} mode="time" display="default" onChange={(event, selectedDate) => { setShowTimePicker(Platform.OS === 'ios'); if (selectedDate) setDate(selectedDate); }} />
      )}
      
      <Text style={styles.label}>Método de Pago</Text>
      <View style={styles.typeSelector}>
        <TouchableOpacity style={[styles.pmButton, paymentMethod === 'cash' && styles.pmActive]} onPress={() => setPaymentMethod('cash')}>
          <Text style={styles.pmText}>Efectivo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pmButton, paymentMethod === 'debit' && styles.pmActive]} onPress={() => setPaymentMethod('debit')}>
          <Text style={styles.pmText}>Débito</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pmButton, paymentMethod === 'credit_card' && styles.pmActive]} onPress={() => setPaymentMethod('credit_card')}>
          <Text style={styles.pmText}>Crédito/Deuda</Text>
        </TouchableOpacity>
      </View>

      {paymentMethod === 'credit_card' && (
        <View style={styles.creditSection}>
          <Text style={styles.label}>Seleccionar Línea de Crédito / Tarjeta</Text>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
            {creditLines.length === 0 ? (
              <Text style={{color: '#888', fontStyle: 'italic', marginBottom: 16}}>No tienes líneas de crédito configuradas.</Text>
            ) : (
              creditLines.map(cl => (
                <TouchableOpacity 
                  key={cl.id} 
                  style={[styles.pillButton, selectedCreditLineId === cl.id && styles.pmActive]}
                  onPress={() => setSelectedCreditLineId(cl.id)}
                >
                  <FontAwesome name={cl.type === 'loan' ? 'money' : 'credit-card'} size={12} color="#FFF" style={{marginRight: 6}} />
                  <Text style={styles.pmText}>{cl.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {selectedCreditLineId && (
            <TouchableOpacity 
              style={[styles.installmentsBtn, installmentsEnabled && { borderColor: '#00D09E' }]} 
              onPress={() => { if (!installmentsEnabled) setShowInstallmentsModal(true); else setInstallmentsEnabled(false); }}
            >
              <FontAwesome name={installmentsEnabled ? "check-circle" : "calendar"} size={20} color={installmentsEnabled ? "#00D09E" : "#888"} />
              <Text style={{color: '#FFF', fontWeight: 'bold', marginLeft: 10}}>
                {installmentsEnabled ? `Configurado: ${installmentsCount} cuotas (+${interestRate}% int.)` : 'Generar Cuotas (Calculadora)'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.label}>Categoría</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
        {[ 
          {name: 'General', icon: null}, 
          {name: 'Pago de Deuda', icon: 'credit-card'}, 
          ...creditLines.map(cl => ({name: `Pago: ${cl.name}`, icon: cl.type === 'loan' ? 'money' : 'credit-card'})),
          ...budgetCategories.filter(c => c.name !== 'General' && c.name !== 'Pago de Deuda') 
        ].map(cat => (
          <TouchableOpacity 
            key={cat.name} 
            style={[styles.pillButton, category === cat.name && styles.pmActive]}
            onPress={() => setCategory(cat.name)}
          >
            {cat.icon && <FontAwesome name={cat.icon as any} size={12} color="#FFF" style={{marginRight: 6}} />}
            <Text style={styles.pmText}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="O escribe una categoría nueva"
        placeholderTextColor="#888"
        value={category}
        onChangeText={setCategory}
      />

      <View style={{flexDirection: 'row', gap: 10, marginTop: 8}}>
        {editingTransactionId && (
          <TouchableOpacity style={[styles.button, {flex: 1, backgroundColor: '#333'}]} onPress={clearForm} disabled={loading}>
            <Text style={[styles.buttonText, {color: '#FFF'}]}>Cancelar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, {flex: 2}]} onPress={handleSaveTransaction} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>{editingTransactionId ? 'Actualizar Movimiento' : 'Guardar Transacción'}</Text>}
        </TouchableOpacity>
      </View>

      {errorMsg ? <Text style={[styles.errorText, {marginTop: 16}]}>{errorMsg}</Text> : null}
      {successMsg ? <Text style={[styles.successText, {marginTop: 16}]}>{successMsg}</Text> : null}

      <View style={{marginTop: 32}}>
        <Text style={[styles.title, {fontSize: 20}]}>Historial de Movimientos</Text>
        {transactionsHistory.length === 0 ? (
          <Text style={{color: '#888', fontStyle: 'italic'}}>No hay movimientos recientes.</Text>
        ) : (
          transactionsHistory.map(t => {
            const colors = t.type === 'income' 
              ? { bg: '#0A2A1A', border: '#00D09E' }
              : t.payment_method === 'credit_card'
                ? { bg: '#2A1A00', border: '#FF8C00' }
                : t.payment_method === 'debit'
                  ? { bg: '#3A1010', border: '#FF4C4C' }
                  : { bg: '#200505', border: '#8A0505' };

            return (
              <TouchableOpacity 
                key={t.id} 
                style={[styles.historyCard, { backgroundColor: colors.bg, borderLeftColor: colors.border }]}
                onPress={() => {
                  setEditingTransactionId(t.id);
                  setName(t.name);
                  setAmount(t.amount.toString());
                  setDescription(t.description || '');
                  setCategory(t.category);
                  setType(t.type);
                  setPaymentMethod(t.payment_method);
                  setDate(new Date(t.date));
                }}
              >
                <View style={{flex: 1}}>
                  <Text style={styles.historyName}>{t.name}</Text>
                  <Text style={styles.historyDetail}>{t.category} • {new Date(t.date).toLocaleDateString()}</Text>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={[styles.historyAmount, { color: colors.border }]}>
                    {t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                  </Text>
                  <Text style={{color: '#888', fontSize: 10, marginTop: 4, textTransform: 'uppercase'}}>{t.payment_method.replace('_', ' ')}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
      
      <View style={{height: 100}} />

      <Modal visible={showInstallmentsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Text style={styles.modalTitle}>Calculadora de Cuotas</Text>
            
            <Text style={styles.modalLabel}>Monto Base (Capital)</Text>
            <Text style={{color: '#FFF', fontSize: 24, fontWeight: 'bold', marginBottom: 20}}>${amount || '0.00'}</Text>

            <Text style={styles.modalLabel}>Cantidad de Cuotas (Meses)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={installmentsCount} onChangeText={setInstallmentsCount} />

            <Text style={styles.modalLabel}>Interés Total (%)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={interestRate} onChangeText={setInterestRate} placeholder="Ej. 13.5" placeholderTextColor="#555" />

            <Text style={styles.modalLabel}>Primer Vencimiento (Mes/Año)</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 12, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: '#333'}}>
              <TouchableOpacity onPress={() => {
                let m = startMonth - 1;
                let y = startYear;
                if (m < 1) { m = 12; y--; }
                setStartMonth(m); setStartYear(y);
              }} style={{padding: 15}}>
                <FontAwesome name="chevron-left" size={16} color="#00D09E" />
              </TouchableOpacity>
              
              <View style={{flex: 1, alignItems: 'center'}}>
                <Text style={{color: '#FFF', fontSize: 16, fontWeight: 'bold'}}>
                  {new Date(startYear, startMonth - 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}
                </Text>
              </View>

              <TouchableOpacity onPress={() => {
                let m = startMonth + 1;
                let y = startYear;
                if (m > 12) { m = 1; y++; }
                setStartMonth(m); setStartYear(y);
              }} style={{padding: 15}}>
                <FontAwesome name="chevron-right" size={16} color="#00D09E" />
              </TouchableOpacity>
            </View>

            <View style={{backgroundColor: '#222', padding: 16, borderRadius: 12, marginBottom: 20}}>
               <Text style={{color: '#AAA', fontSize: 12, marginBottom: 4}}>Total a pagar:</Text>
               <Text style={{color: '#00D09E', fontSize: 18, fontWeight: 'bold'}}>${formatCurrency(Number(amount) * (1 + (Number(interestRate) / 100)))}</Text>
               
               <Text style={{color: '#AAA', fontSize: 12, marginTop: 10, marginBottom: 4}}>Valor de cada cuota:</Text>
               <Text style={{color: '#FFF', fontSize: 16}}>${formatCurrency((Number(amount) * (1 + (Number(interestRate) / 100))) / (Number(installmentsCount) || 1))}</Text>
            </View>

            <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity style={[styles.typeButton, {flex: 1}]} onPress={() => setShowInstallmentsModal(false)}>
                <Text style={styles.typeButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeButton, {flex: 1, backgroundColor: '#00D09E'}]} onPress={() => { setInstallmentsEnabled(true); setShowInstallmentsModal(false); }}>
                <Text style={[styles.typeButtonText, {color: '#000'}]}>Confirmar Cuotas</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 24 },
  aiRow: { flexDirection: 'row', marginBottom: 16 },
  aiButton: { flexDirection: 'row', backgroundColor: '#FFD700', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  aiButtonText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  chatBubble: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#00D09E' },
  chatText: { color: '#FFF', fontSize: 16, fontStyle: 'italic' },
  typeSelector: { flexDirection: 'row', marginBottom: 24, gap: 8 },
  typeButton: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#1A1A1A', alignItems: 'center' },
  typeButtonActiveExpense: { backgroundColor: '#FF4C4C' },
  typeButtonActiveIncome: { backgroundColor: '#00D09E' },
  typeButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  label: { color: '#AAA', fontSize: 14, marginBottom: 8, fontWeight: 'bold' },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16, borderWidth: 1, borderColor: '#333' },
  pmButton: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#2A2A2A', alignItems: 'center' },
  pillButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2A2A2A', alignItems: 'center', flexDirection: 'row', alignSelf: 'flex-start' },
  pmActive: { backgroundColor: '#00D09E' },
  pmText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  button: { backgroundColor: '#00D09E', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#000', fontWeight: 'bold', fontSize: 18 },
  errorText: { color: '#FF4C4C', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  successText: { color: '#00D09E', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  creditSection: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#333' },
  installmentsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#444' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#111', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalLabel: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  historyCard: { padding: 16, borderRadius: 12, marginBottom: 12, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center' },
  historyName: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  historyDetail: { color: '#AAA', fontSize: 12 },
  historyAmount: { fontSize: 16, fontWeight: 'bold' }
});
