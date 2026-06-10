import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal, ScrollView } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { FontAwesome } from '@expo/vector-icons';
import DragList from 'react-native-draglist';

type Budget = {
  id: string;
  category: string;
  section: string;
  limit_amount: number;
  percentage: number | null;
  spent_amount: number;
  due_day: number | null;
  month: number;
  year: number;
  row_color: string | null;
  icon: string | null;
  order_index: number;
  is_debt?: boolean;
  debt_status?: string;
  credit_limit?: number;
  credit_used?: number;
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ROW_COLORS = [
  null,          
  '#1E3A8A',     
  '#064E3B',     
  '#701A75',     
  '#7F1D1D',     
  '#78350F',     
  '#B45309',
  '#0F766E',
  '#4338CA',
  '#BE185D',
  '#111827',
  '#4B5563'
];

const ICONS = [
  'circle-o', 'home', 'car', 'shopping-cart', 'bolt', 'heartbeat', 
  'graduation-cap', 'plane', 'money', 'gift', 'phone', 
  'coffee', 'gamepad', 'film', 'paw', 'music', 'bank', 'building', 'building-o', 
  'fire', 'ticket', 'wifi', 'globe', 'mobile', 'medkit', 'stethoscope', 'exclamation-triangle', 
  'gavel', 'motorcycle', 'wrench', 'cogs', 'road', 'spotify', 'volume-up', 'comments-o', 
  'television', 'play-circle', 'cutlery', 'shopping-basket', 'tint', 'scissors', 'female', 
  'heart', 'shopping-bag', 'tags', 'credit-card', 'credit-card-alt', 'users', 'video-camera', 
  'microphone', 'glass', 'beer', 'suitcase', 'sun-o', 'paint-brush', 'camera', 'desktop', 
  'laptop', 'book', 'bed', 'bus', 'subway', 'train', 'bicycle', 'leaf', 'tree', 'futbol-o', 
  'trophy', 'umbrella', 'magic', 'diamond', 'star', 'calendar', 'clock-o', 'map-marker', 'compass'
];

export default function BudgetsScreen() {
  const { session } = useAuth();
  
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loading, setLoading] = useState(true);

  const [addingSection, setAddingSection] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newIsPercent, setNewIsPercent] = useState(false);

  const [editingItem, setEditingItem] = useState<Budget | null>(null);
  const [editName, setEditName] = useState('');
  const [editIsPercent, setEditIsPercent] = useState(false);
  const [editLimitVal, setEditLimitVal] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (session?.user?.id) {
        loadMonthData();
      }
    }, [session, currentMonth, currentYear])
  );

  const loadMonthData = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();

      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', session!.user.id)
        .eq('month', currentMonth + 1)
        .eq('year', currentYear)
        .order('order_index', { ascending: true });

      if (budgetError) throw budgetError;

      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('type, category, amount')
        .eq('user_id', session!.user.id)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

      if (txError) throw txError;

      let income = 0;
      const spentByCategory: Record<string, number> = {};

      txData?.forEach((tx) => {
        if (tx.type === 'income') {
          income += Number(tx.amount);
        } else if (tx.type === 'expense') {
          const cat = tx.category.toLowerCase().trim();
          spentByCategory[cat] = (spentByCategory[cat] || 0) + Number(tx.amount);

          // Si es un pago de deuda/crédito, acumular bajo nombres comunes de presupuesto de deudas/créditos
          if (cat.startsWith('pago: ') || cat === 'pago de deuda' || cat === 'deudas / créditos' || cat === 'deudas / creditos' || cat === 'créditos' || cat === 'creditos') {
            const commonDebtCats = ['pago de deuda', 'pago de deudas', 'deudas', 'deuda', 'créditos', 'creditos', 'pago de deuda', 'pago de deudas', 'deudas / créditos', 'deudas / creditos', 'créditos', 'creditos'];
            commonDebtCats.forEach(c => {
              spentByCategory[c] = (spentByCategory[c] || 0) + Number(tx.amount);
            });
          }
        }
      });

      setTotalIncome(income);

      // Fix para reparar items que tengan order_index = 0
      let fixIndex = 10; 
      
      const mapped = budgetData?.map(b => {
        let calcLimit = Number(b.limit_amount);
        if (b.percentage) {
          calcLimit = (Number(b.percentage) / 100) * income;
        }

        return {
          id: b.id,
          category: b.category,
          section: b.section || 'General',
          limit_amount: calcLimit,
          percentage: b.percentage ? Number(b.percentage) : null,
          due_day: b.due_day,
          month: b.month,
          year: b.year,
          row_color: b.row_color,
          icon: b.icon,
          order_index: b.order_index === 0 ? (fixIndex++) : b.order_index,
          spent_amount: spentByCategory[b.category.toLowerCase().trim()] || 0
        };
      }) || [];

      const { data: debtData, error: debtError } = await supabase
        .from('debt_installments')
        .select('*, credit_lines(name, limit_amount)')
        .eq('user_id', session!.user.id)
        .eq('month', currentMonth + 1)
        .eq('year', currentYear);

      if (debtError) throw debtError;

      const { data: allPendingDebt } = await supabase
        .from('debt_installments')
        .select('credit_line_id, amount')
        .eq('user_id', session!.user.id)
        .eq('status', 'pending');

      const usedByCreditLine: Record<string, number> = {};
      allPendingDebt?.forEach(d => {
        if (d.credit_line_id) {
          usedByCreditLine[d.credit_line_id] = (usedByCreditLine[d.credit_line_id] || 0) + Number(d.amount);
        }
      });

      const debtMapped = debtData?.map((d: any) => {
        const clId = d.credit_line_id;
        const limit = d.credit_lines ? Number(d.credit_lines.limit_amount || 0) : 0;
        const used = clId ? (usedByCreditLine[clId] || 0) : 0;

        return {
          id: `debt_${d.id}`,
          category: `${d.credit_lines?.name || 'Crédito'}: ${d.description} (${d.installment_number}/${d.total_installments})`,
          section: 'CRÉDITOS',
          limit_amount: Number(d.amount),
          percentage: null,
          due_day: null,
          month: d.month,
          year: d.year,
          row_color: d.row_color || '#78350F',
          icon: d.icon || 'credit-card',
          order_index: 999, 
          spent_amount: d.status === 'paid' ? Number(d.amount) : 0,
          is_debt: true,
          debt_status: d.status,
          credit_limit: limit,
          credit_used: used
        };
      }) || [];

      setBudgets([...mapped, ...debtMapped]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = (offset: number) => {
    let newM = currentMonth + offset;
    let newY = currentYear;
    if (newM < 0) { newM = 11; newY--; }
    else if (newM > 11) { newM = 0; newY++; }
    setCurrentMonth(newM);
    setCurrentYear(newY);
  };

  const handleClonePreviousMonth = async () => {
    let prevM = currentMonth - 1;
    let prevY = currentYear;
    if (prevM < 0) { prevM = 11; prevY--; }

    const { data, error } = await supabase
      .from('budgets')
      .select('category, section, limit_amount, percentage, due_day, row_color, icon, order_index')
      .eq('user_id', session!.user.id)
      .eq('month', prevM + 1)
      .eq('year', prevY);

    if (error || !data || data.length === 0) {
      Alert.alert('Aviso', 'No hay datos en el mes anterior para clonar.');
      return;
    }

    const newBudgets = data.map(b => ({
      user_id: session!.user.id,
      category: b.category,
      section: b.section,
      limit_amount: b.limit_amount,
      percentage: b.percentage,
      due_day: b.due_day,
      row_color: b.row_color,
      icon: b.icon,
      order_index: b.order_index,
      month: currentMonth + 1,
      year: currentYear,
      start_date: new Date(currentYear, currentMonth, 1).toISOString(),
      end_date: new Date(currentYear, currentMonth + 1, 0).toISOString()
    }));

    const { error: insertError } = await supabase.from('budgets').insert(newBudgets);
    if (insertError) {
      Alert.alert('Error clonando', insertError.message);
    } else {
      loadMonthData();
    }
  };

  const saveNewItem = async (section: string) => {
    if (!newCat || !newLimit || isNaN(Number(newLimit))) {
      Alert.alert('Error', 'Ingrese una categoría y un monto válido.');
      return;
    }

    const maxOrder = budgets.reduce((max, b) => Math.max(max, b.order_index), 0);

    const { error } = await supabase.from('budgets').insert({
      user_id: session!.user.id,
      category: newCat,
      section: section,
      limit_amount: newIsPercent ? 0 : Number(newLimit),
      percentage: newIsPercent ? Number(newLimit) : null,
      due_day: newDue ? Number(newDue) : null,
      order_index: maxOrder + 1, 
      month: currentMonth + 1,
      year: currentYear,
      start_date: new Date(currentYear, currentMonth, 1).toISOString(),
      end_date: new Date(currentYear, currentMonth + 1, 0).toISOString()
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setAddingSection(null);
      setNewCat('');
      setNewLimit('');
      setNewDue('');
      setNewIsPercent(false);
      loadMonthData();
    }
  };

  const openEditModal = (b: Budget) => {
    setEditingItem(b);
    setEditName(b.category);
    setEditIsPercent(b.percentage !== null);
    setEditLimitVal(b.percentage !== null ? b.percentage.toString() : b.limit_amount.toString());
    setEditColor(b.row_color);
    setEditIcon(b.icon);
  };

  const saveFullEdit = async () => {
    if (!editingItem || isNaN(Number(editLimitVal))) return;
    
    const updatePayload = {
      category: editName,
      limit_amount: editIsPercent ? 0 : Number(editLimitVal),
      percentage: editIsPercent ? Number(editLimitVal) : null,
      row_color: editColor,
      icon: editIcon
    };

    const { error } = await supabase.from('budgets').update(updatePayload).eq('id', editingItem.id);
    if (!error) {
      setEditingItem(null);
      loadMonthData();
    } else {
      Alert.alert('Error', error.message);
    }
  };

  const deleteFromModal = async () => {
    if (!editingItem) return;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('¿Estás seguro de borrar este concepto?');
      if (confirmed) {
        await supabase.from('budgets').delete().eq('id', editingItem.id);
        setEditingItem(null);
        loadMonthData();
      }
      return;
    }

    Alert.alert('Eliminar', '¿Estás seguro de borrar este concepto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
          await supabase.from('budgets').delete().eq('id', editingItem.id);
          setEditingItem(null);
          loadMonthData();
        }
      }
    ]);
  };

  const markDebtPaid = async (b: Budget) => {
    if (b.debt_status === 'paid') return;
    
    Alert.alert('Pagar Cuota', `¿Deseas registrar el pago de ${b.category} por $${formatCurrency(b.limit_amount)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Registrar Pago', onPress: async () => {
          const actualId = b.id.replace('debt_', '');
          
          await supabase.from('debt_installments').update({ status: 'paid' }).eq('id', actualId);
          
          await supabase.from('transactions').insert({
            user_id: session!.user.id,
            name: b.category,
            amount: b.limit_amount,
            type: 'expense',
            category: 'CRÉDITOS',
            payment_method: 'debit',
            date: new Date().toISOString()
          });

          loadMonthData();
      }}
    ]);
  };

  const handleReorder = async (sectionBudgets: Budget[], fromIndex: number, toIndex: number, sectionName: string) => {
    const copy = [...sectionBudgets];
    const [removed] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, removed);

    // Reasignar indices localmente
    const newlyOrdered = copy.map((b, idx) => ({ ...b, order_index: idx + 1 }));

    // Actualizar estado general
    setBudgets(prev => {
      const others = prev.filter(b => b.section !== sectionName);
      return [...others, ...newlyOrdered];
    });

    // Guardar en DB en segundo plano
    newlyOrdered.forEach(async (b) => {
      await supabase.from('budgets').update({ order_index: b.order_index }).eq('id', b.id);
    });
  };

  const sectionsSet = new Set(budgets.map(b => b.section));
  sectionsSet.add('Gastos Fijos');
  sectionsSet.add('Gastos Variables');
  const sections = Array.from(sectionsSet);

  const totalBudget = budgets.reduce((acc, b) => acc + b.limit_amount, 0);
  const totalSpent = budgets.reduce((acc, b) => acc + b.spent_amount, 0);
  const remainingIncome = totalIncome - totalSpent; 
  const toPayAmount = Math.max(0, totalBudget - totalSpent);
  
  // Dinero real que falta para cubrir lo que falta pagar: (Falta pagar - Lo que nos queda de ingresos)
  const realMissingCash = Math.max(0, toPayAmount - remainingIncome);
  const budgetPaidProgress = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#00D09E" size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} scrollEnabled={!isDragging}>
        
        <View style={styles.dateSelector}>
          <TouchableOpacity onPress={() => changeMonth(-1)}><FontAwesome name="chevron-left" size={20} color="#FFF" /></TouchableOpacity>
          <Text style={styles.dateText}>{MONTHS[currentMonth]} {currentYear}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)}><FontAwesome name="chevron-right" size={20} color="#FFF" /></TouchableOpacity>
        </View>

        <View style={styles.summaryBox}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>INGRESOS</Text>
            <Text style={styles.summaryValue}>${formatCurrency(totalIncome)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>PRESUPUESTO</Text>
            <Text style={styles.summaryValue}>${formatCurrency(totalBudget)}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>RESTANTE</Text>
            <Text style={[styles.summaryValue, { color: remainingIncome < 0 ? '#FF4C4C' : '#00D09E' }]}>
              ${formatCurrency(remainingIncome)}
            </Text>
          </View>
        </View>

        <View style={styles.paymentProgressBox}>
          <View style={styles.paymentProgressHeader}>
            <Text style={styles.paymentProgressLabel}>FALTA PAGAR DE MI PRESUPUESTO</Text>
            <Text style={styles.paymentProgressValue}>${formatCurrency(toPayAmount)}</Text>
          </View>
          <View style={[styles.paymentProgressHeader, { borderTopWidth: 1, borderTopColor: '#2A2A2A', paddingTop: 8, marginTop: 8 }]}>
            <Text style={styles.paymentProgressLabel}>DINERO REAL QUE ME FALTA APORTAR</Text>
            <Text style={[styles.paymentProgressValue, { color: realMissingCash > 0 ? '#FF4C4C' : '#00D09E' }]}>
              ${formatCurrency(realMissingCash)}
            </Text>
          </View>
          <View style={[styles.paymentProgressBarContainer, { marginTop: 10 }]}>
            <View style={[styles.paymentProgressBarFill, { width: `${budgetPaidProgress}%` }]} />
          </View>
          <View style={styles.paymentProgressFooter}>
            <Text style={styles.paymentProgressSubtext}>Disponible / Restante: ${formatCurrency(remainingIncome)}</Text>
            <Text style={styles.paymentProgressSubtext}>{formatNumber(budgetPaidProgress, 0)}% pagado</Text>
          </View>
        </View>

        {budgets.length === 0 && (
          <TouchableOpacity style={styles.cloneBtn} onPress={handleClonePreviousMonth}>
            <FontAwesome name="copy" size={16} color="#000" style={{marginRight: 8}} />
            <Text style={styles.cloneBtnText}>Clonar del mes anterior</Text>
          </TouchableOpacity>
        )}

        {sections.map(section => {
          const sectionBudgets = budgets.filter(b => b.section === section).sort((a, b) => a.order_index - b.order_index);
          const secSpent = sectionBudgets.reduce((acc, b) => acc + b.spent_amount, 0);
          const secLimit = sectionBudgets.reduce((acc, b) => acc + b.limit_amount, 0);

          const bIsDebtSection = section === 'CRÉDITOS';
          return (
            <View key={section} style={styles.sectionContainer}>
              <View style={[styles.sectionHeader, bIsDebtSection && { borderBottomColor: '#FFD700' }]}>
                <Text style={[styles.sectionTitle, bIsDebtSection && { color: '#FFD700' }]}>{section.toUpperCase()}</Text>
              </View>
              
              <View style={styles.tableHeader}>
                <Text style={[styles.th, {flex: 2}]}>CONCEPTO</Text>
                <Text style={[styles.th, {flex: 1.5, textAlign: 'right'}]}>GASTADO</Text>
                <Text style={[styles.th, {flex: 1.5, textAlign: 'right'}]}>LÍMITE</Text>
                <Text style={[styles.th, {width: 40, textAlign: 'center'}]}>%</Text>
                <Text style={[styles.th, {width: 50}]}></Text>
              </View>

              <DragList
                data={sectionBudgets}
                keyExtractor={(item) => item.id}
                onReordered={(fromIndex, toIndex) => handleReorder(sectionBudgets, fromIndex, toIndex, section)}
                scrollEnabled={false}
                renderItem={({ item, onDragStart, onDragEnd, isActive }) => {
                  const b = item;
                  const isPaid = b.spent_amount >= b.limit_amount;
                  const isPartial = b.spent_amount > 0 && b.spent_amount < b.limit_amount;
                  const indicatorColor = isPaid ? '#00D09E' : (isPartial ? '#FFD700' : '#FF4C4C');
                  const pct = b.limit_amount > 0 ? formatNumber((b.spent_amount / b.limit_amount) * 100, 0) : '0';
                  const numericPct = b.limit_amount > 0 ? Math.min(100, Math.round((b.spent_amount / b.limit_amount) * 100)) : 0;

                  // Determine background color: manually chosen or automatic
                  let rowBgColor = b.row_color;
                  if (!rowBgColor) {
                    if (isPaid) {
                      rowBgColor = 'rgba(6, 78, 59, 0.45)'; // green
                    } else if (isPartial) {
                      rowBgColor = 'rgba(180, 83, 9, 0.45)'; // yellow
                    } else {
                      rowBgColor = 'rgba(127, 29, 29, 0.45)'; // red
                    }
                  }

                  const limitVal = b.credit_limit || 0;
                  const usedVal = b.credit_used || 0;
                  const creditPct = limitVal > 0 ? Math.min(100, Math.round((usedVal / limitVal) * 100)) : 0;

                  return (
                    <View
                      style={[styles.row, { backgroundColor: rowBgColor, opacity: isActive ? 0.7 : 1, transform: [{scale: isActive ? 1.02 : 1}], zIndex: isActive ? 99 : 1, elevation: isActive ? 5 : 0 }]}
                    >
                      <View style={[styles.colorIndicator, { backgroundColor: indicatorColor }]} />
                      <View style={[styles.rowContent, { flexDirection: 'column', alignItems: 'stretch' }]}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                          <View style={{flex: 2, flexDirection: 'row', alignItems: 'center'}}>
                            <FontAwesome name={(b.icon as any) || 'circle-o'} size={14} color="#00D09E" style={{marginRight: 8}} />
                            <Text style={[styles.td, {fontWeight: 'bold', flex: 1}]} numberOfLines={1}>{b.category}</Text>
                          </View>
                          
                          <Text style={[styles.td, {flex: 1.5, textAlign: 'right'}]}>${formatCurrency(b.spent_amount)}</Text>
                          <Text style={[styles.td, {flex: 1.5, textAlign: 'right', fontSize: 11}]}>
                              ${formatCurrency(b.limit_amount)}
                          </Text>
                          <Text style={[styles.td, {width: 40, textAlign: 'right', fontSize: 10}]}>{pct}%</Text>
                          
                          <View style={{width: 60, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center'}}>
                            {b.is_debt ? (
                              b.debt_status === 'paid' ? (
                                <FontAwesome name="check-circle" size={20} color="#00D09E" style={{marginRight: 8}} />
                              ) : (
                                <TouchableOpacity onPress={() => markDebtPaid(b)} style={{padding: 6}}>
                                  <FontAwesome name="money" size={16} color="#FFD700" />
                                </TouchableOpacity>
                              )
                            ) : (
                              <>
                                <TouchableOpacity 
                                  activeOpacity={0.5}
                                  onPressIn={() => { setIsDragging(true); onDragStart(); }}
                                  onPressOut={() => { setIsDragging(false); onDragEnd(); }}
                                  style={{padding: 10}}
                                >
                                  <FontAwesome name="bars" size={16} color={isActive ? '#00D09E' : '#888'} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => openEditModal(b)} style={{padding: 6}}>
                                  <FontAwesome name="cog" size={14} color="#AAA" />
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        </View>

                        {/* Progress Bar for regular Budgets */}
                        {!b.is_debt && b.limit_amount > 0 && (
                          <View style={{marginTop: 6, height: 4, backgroundColor: '#222', borderRadius: 2, overflow: 'hidden'}}>
                            <View style={{height: '100%', width: `${numericPct}%`, backgroundColor: indicatorColor, borderRadius: 2}} />
                          </View>
                        )}

                        {b.is_debt && limitVal > 0 && (
                          <View style={{marginTop: 6, borderTopWidth: 1, borderTopColor: '#333', paddingTop: 6}}>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2}}>
                              <Text style={{color: '#888', fontSize: 10}}>Límite de Crédito: ${formatCurrency(limitVal)}</Text>
                              <Text style={{color: '#888', fontSize: 10}}>Uso: ${formatCurrency(usedVal)} ({creditPct}%)</Text>
                            </View>
                            <View style={{height: 4, backgroundColor: '#222', borderRadius: 2, overflow: 'hidden'}}>
                              <View style={{height: '100%', width: `${creditPct}%`, backgroundColor: creditPct > 85 ? '#FF4C4C' : '#00D09E', borderRadius: 2}} />
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                }}
              />

              {!bIsDebtSection && addingSection === section ? (
                <View style={styles.addForm}>
                  <TextInput style={[styles.addInput, {flex: 2}]} placeholder="Cat." placeholderTextColor="#888" value={newCat} onChangeText={setNewCat} />
                  <TouchableOpacity style={styles.typeToggle} onPress={() => setNewIsPercent(!newIsPercent)}>
                    <Text style={{color:'#000', fontWeight:'bold', fontSize: 12}}>{newIsPercent ? '%' : '$'}</Text>
                  </TouchableOpacity>
                  <TextInput style={[styles.addInput, {flex: 1.5}]} placeholder={newIsPercent ? "%" : "$"} placeholderTextColor="#888" keyboardType="numeric" value={newLimit} onChangeText={setNewLimit} />
                  <TextInput style={[styles.addInput, {width: 40}]} placeholder="Día" placeholderTextColor="#888" keyboardType="numeric" value={newDue} onChangeText={setNewDue} />
                  <TouchableOpacity style={styles.saveBtn} onPress={() => saveNewItem(section)}>
                    <FontAwesome name="check" color="#000" size={16} />
                  </TouchableOpacity>
                </View>
              ) : (
                !bIsDebtSection && (
                  <TouchableOpacity style={styles.addRow} onPress={() => setAddingSection(section)}>
                    <Text style={styles.addText}>+ Agregar a {section}</Text>
                  </TouchableOpacity>
                )
              )}

              <View style={styles.sectionFooter}>
                <Text style={[styles.td, {flex: 2, fontWeight: 'bold'}]}>TOTAL {section}</Text>
                <Text style={[styles.td, {flex: 1.5, textAlign: 'right', fontWeight: 'bold'}]}>${formatCurrency(secSpent)}</Text>
                <Text style={[styles.td, {flex: 1.5, textAlign: 'right', fontWeight: 'bold'}]}>${formatCurrency(secLimit)}</Text>
                <View style={{width: 50}} />
              </View>

            </View>
          );
        })}

        <View style={{height: 100}} />
      </ScrollView>

      {/* EDIT MODAL */}
      <Modal visible={!!editingItem} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajustes del Concepto</Text>
            
            <Text style={styles.modalLabel}>Nombre del Gasto/Ahorro</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 16}}>
               <View style={{padding: 12}}>
                 <FontAwesome name={(editIcon as any) || 'circle-o'} size={20} color="#00D09E" />
               </View>
               <TextInput style={[styles.modalInput, {borderWidth: 0, marginBottom: 0, flex: 1, paddingLeft: 0}]} value={editName} onChangeText={setEditName} />
            </View>

            <Text style={styles.modalLabel}>Límite</Text>
            <View style={{flexDirection: 'row', gap: 8, marginBottom: 16}}>
              <TouchableOpacity style={[styles.typeToggle, {width: 40, height: 40, borderRadius: 8}]} onPress={() => setEditIsPercent(!editIsPercent)}>
                <Text style={{color:'#000', fontWeight:'bold', fontSize: 16}}>{editIsPercent ? '%' : '$'}</Text>
              </TouchableOpacity>
              <TextInput 
                style={[styles.modalInput, {flex: 1, marginBottom: 0}]} 
                value={editLimitVal} 
                onChangeText={setEditLimitVal} 
                keyboardType="numeric" 
                placeholder={editIsPercent ? 'Porcentaje...' : 'Monto...'} 
              />
            </View>

            <Text style={styles.modalLabel}>Icono</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 16}}>
              {ICONS.map((ic) => (
                <TouchableOpacity 
                  key={ic} 
                  style={[styles.iconCircle, editIcon === ic && styles.iconCircleActive]}
                  onPress={() => setEditIcon(ic)}
                >
                  <FontAwesome name={ic as any} size={16} color={editIcon === ic ? '#00D09E' : '#888'} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.modalLabel}>Color de Resalte (Crea el tuyo o elige uno)</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20}}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginRight: 12}}>
                {ROW_COLORS.map((c, i) => (
                  <TouchableOpacity 
                    key={i} 
                    style={[styles.colorCircle, {marginRight: 8, backgroundColor: c || '#1A1A1A', borderWidth: editColor === c ? 2 : 1, borderColor: editColor === c ? '#FFF' : '#333'}]}
                    onPress={() => setEditColor(c)}
                  >
                    {c === null && <FontAwesome name="times" color="#888" size={12} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', borderRadius: 8, borderWidth: 1, borderColor: '#333'}}>
                 <View style={[styles.colorCircle, {width: 24, height: 24, marginHorizontal: 8, backgroundColor: editColor || '#1A1A1A'}]} />
                 <TextInput 
                   style={{color: '#FFF', paddingVertical: 8, paddingRight: 8, width: 75, fontSize: 12}}
                   placeholder="#HEX"
                   placeholderTextColor="#888"
                   value={editColor || ''}
                   onChangeText={setEditColor}
                   maxLength={7}
                   autoCapitalize="characters"
                 />
              </View>
            </View>

            <View style={{flexDirection: 'row', gap: 8, marginTop: 16}}>
              <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#FF4C4C', flex: 1}]} onPress={deleteFromModal}>
                <FontAwesome name="trash" color="#FFF" size={16} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#333', flex: 1.5}]} onPress={() => setEditingItem(null)}>
                <Text style={{color: '#FFF', fontWeight: 'bold'}}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#00D09E', flex: 2}]} onPress={saveFullEdit}>
                <Text style={{color: '#000', fontWeight: 'bold'}}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  centered: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  dateSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#111' },
  dateText: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  summaryBox: { flexDirection: 'row', backgroundColor: '#1A1A1A', padding: 16, margin: 16, borderRadius: 12, justifyContent: 'space-between' },
  summaryCol: { alignItems: 'center', flex: 1 },
  summaryLabel: { color: '#888', fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  summaryValue: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  cloneBtn: { backgroundColor: '#FFD700', marginHorizontal: 16, padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  cloneBtnText: { color: '#000', fontWeight: 'bold' },
  sectionContainer: { marginHorizontal: 16, marginBottom: 24, backgroundColor: '#111', borderRadius: 8, overflow: 'hidden' },
  sectionHeader: { backgroundColor: '#222', padding: 10, borderBottomWidth: 2, borderBottomColor: '#00D09E' },
  sectionTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  tableHeader: { flexDirection: 'row', padding: 8, backgroundColor: '#181818', borderBottomWidth: 1, borderBottomColor: '#333' },
  th: { color: '#888', fontSize: 10, fontWeight: 'bold' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222', alignItems: 'center' },
  colorIndicator: { width: 6, height: '100%' },
  rowContent: { flex: 1, flexDirection: 'row', padding: 12, alignItems: 'center' },
  td: { color: '#FFF', fontSize: 12 },
  tdInput: { color: '#FFF', fontSize: 12, backgroundColor: '#333', padding: 2, borderRadius: 4, textAlign: 'right' },
  addRow: { padding: 12, backgroundColor: '#181818', alignItems: 'center' },
  addText: { color: '#00D09E', fontSize: 12, fontWeight: 'bold' },
  addForm: { flexDirection: 'row', padding: 8, backgroundColor: '#222', gap: 6, alignItems: 'center' },
  addInput: { backgroundColor: '#333', color: '#FFF', fontSize: 12, borderRadius: 4, paddingHorizontal: 6, height: 30 },
  typeToggle: { backgroundColor: '#FFD700', width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  saveBtn: { backgroundColor: '#00D09E', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  sectionFooter: { flexDirection: 'row', padding: 12, backgroundColor: '#1A1A1A', borderTopWidth: 1, borderTopColor: '#333' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#111', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  modalLabel: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  modalInput: { backgroundColor: '#222', color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginRight: 8, borderWidth: 1, borderColor: '#333' },
  iconCircleActive: { borderColor: '#00D09E', backgroundColor: '#222' },
  colorRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  colorCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  modalBtn: { padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  paymentProgressBox: { backgroundColor: '#1A1A1A', padding: 16, marginHorizontal: 16, marginBottom: 16, borderRadius: 12 },
  paymentProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  paymentProgressLabel: { color: '#888', fontSize: 10, fontWeight: 'bold' },
  paymentProgressValue: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
  paymentProgressBarContainer: { height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  paymentProgressBarFill: { height: '100%', backgroundColor: '#00D09E', borderRadius: 3 },
  paymentProgressFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentProgressSubtext: { color: '#888', fontSize: 10 }
});
