import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal, ScrollView, Image } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { FontAwesome } from '@expo/vector-icons';
import DragList from 'react-native-draglist';
import { BudgetService, Budget, SharedBudget, SharedBudgetMember } from '@/lib/services/BudgetService';
import { supabase } from '@/lib/supabase';

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
  const [expandedCreditLines, setExpandedCreditLines] = useState<Record<string, boolean>>({});

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

  // Estados de Presupuestos Compartidos
  const [sharedBudgets, setSharedBudgets] = useState<SharedBudget[]>([]);
  const [activeSharedBudget, setActiveSharedBudget] = useState<SharedBudget | null>(null);
  
  // Modals de Compartidos
  const [showCreateSharedModal, setShowCreateSharedModal] = useState(false);
  const [newSharedName, setNewSharedName] = useState('');
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [members, setMembers] = useState<SharedBudgetMember[]>([]);
  const [newMemberUsername, setNewMemberUsername] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (session?.user?.id) {
        loadMonthData();
      }
    }, [session, currentMonth, currentYear, activeSharedBudget])
  );

  const loadMonthData = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();

      // Cargar lista de presupuestos compartidos
      const sList = await BudgetService.getSharedBudgets(session!.user.id);
      setSharedBudgets(sList);

      // Consultar ingresos del mes activo para el presupuesto seleccionado
      let txQuery = supabase
        .from('transactions')
        .select('type, category, amount')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
        
      if (activeSharedBudget) {
        txQuery = txQuery.eq('shared_budget_id', activeSharedBudget.id);
      } else {
        txQuery = txQuery.eq('user_id', session!.user.id).is('shared_budget_id', null);
      }

      const { data: txData, error: txError } = await txQuery;

      if (txError) throw txError;

      let income = 0;
      txData?.forEach((tx) => {
        if (tx.type === 'income') {
          income += Number(tx.amount);
        }
      });
      setTotalIncome(income);

      const list = await BudgetService.getBudgets(
        session!.user.id, 
        currentMonth, 
        currentYear, 
        income,
        activeSharedBudget?.id
      );
      setBudgets(list);
      
      // Si hay un presupuesto compartido activo, cargar sus miembros
      if (activeSharedBudget) {
        const mList = await BudgetService.getSharedBudgetMembers(activeSharedBudget.id);
        setMembers(mList);
      }
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
    try {
      await BudgetService.clonePreviousMonth(session!.user.id, currentMonth, currentYear, activeSharedBudget?.id);
      loadMonthData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const saveNewItem = async (section: string) => {
    if (!newCat || !newLimit || isNaN(Number(newLimit))) {
      Alert.alert('Error', 'Ingrese una categoría y un monto válido.');
      return;
    }

    const maxOrder = budgets.reduce((max, b) => Math.max(max, b.order_index), 0);

    try {
      await BudgetService.saveBudget(session!.user.id, {
        category: newCat,
        section: section,
        limit_amount: newIsPercent ? 0 : Number(newLimit),
        percentage: newIsPercent ? Number(newLimit) : null,
        due_day: newDue ? Number(newDue) : null,
        order_index: maxOrder + 1,
        month: currentMonth + 1,
        year: currentYear,
        row_color: null,
        icon: null,
        shared_budget_id: activeSharedBudget?.id || null
      });

      setAddingSection(null);
      setNewCat('');
      setNewLimit('');
      setNewDue('');
      setNewIsPercent(false);
      loadMonthData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
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
    
    try {
      await BudgetService.saveBudget(session!.user.id, {
        id: editingItem.id,
        category: editName,
        section: editingItem.section,
        limit_amount: editIsPercent ? 0 : Number(editLimitVal),
        percentage: editIsPercent ? Number(editLimitVal) : null,
        due_day: editingItem.due_day,
        order_index: editingItem.order_index,
        month: editingItem.month,
        year: editingItem.year,
        row_color: editColor,
        icon: editIcon
      });

      setEditingItem(null);
      loadMonthData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const deleteFromModal = async () => {
    if (!editingItem) return;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('¿Estás seguro de borrar este concepto?');
      if (confirmed) {
        try {
          await BudgetService.deleteBudget(editingItem.id);
          setEditingItem(null);
          loadMonthData();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
      }
      return;
    }

    Alert.alert('Eliminar', '¿Estás seguro de borrar este concepto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await BudgetService.deleteBudget(editingItem.id);
            setEditingItem(null);
            loadMonthData();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        }
      }
    ]);
  };

  const markDebtPaid = async (b: Budget) => {
    if (b.debt_status === 'paid') return;
    
    Alert.alert('Pagar Cuota', `¿Deseas registrar el pago de todas las cuotas de ${b.category} por un total de $${formatCurrency(b.limit_amount)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Registrar Pago', onPress: async () => {
          try {
            if (b.installments && b.installments.length > 0) {
              for (const inst of b.installments) {
                if (inst.status !== 'paid') {
                  await BudgetService.markInstallmentPaid(session!.user.id, inst.id, `${b.category}: ${inst.description} (${inst.installment_number}/${inst.total_installments})`, inst.amount);
                }
              }
            } else {
              await BudgetService.markDebtPaid(session!.user.id, b);
            }
            loadMonthData();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
      }}
    ]);
  };

  const markSingleInstallmentPaid = async (instId: string, desc: string, amount: number) => {
    Alert.alert('Pagar Cuota', `¿Deseas registrar el pago de ${desc} por $${formatCurrency(amount)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Registrar Pago', onPress: async () => {
          try {
            await BudgetService.markInstallmentPaid(session!.user.id, instId, desc, amount);
            loadMonthData();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
      }}
    ]);
  };

  const toggleCreditLineExpand = (id: string) => {
    setExpandedCreditLines(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleCreateSharedBudget = async () => {
    if (!newSharedName.trim()) return;
    try {
      const group = await BudgetService.createSharedBudget(session!.user.id, newSharedName.trim());
      setNewSharedName('');
      setShowCreateSharedModal(false);
      setActiveSharedBudget(group);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo crear el presupuesto compartido: ' + e.message);
    }
  };

  const handleAddMember = async () => {
    if (!activeSharedBudget || !newMemberUsername.trim()) return;
    try {
      await BudgetService.addMemberToSharedBudget(activeSharedBudget.id, newMemberUsername.trim());
      setNewMemberUsername('');
      const mList = await BudgetService.getSharedBudgetMembers(activeSharedBudget.id);
      setMembers(mList);
      Alert.alert('Éxito', 'Miembro agregado exitosamente.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeSharedBudget) return;
    try {
      await BudgetService.removeMemberFromSharedBudget(activeSharedBudget.id, userId);
      const mList = await BudgetService.getSharedBudgetMembers(activeSharedBudget.id);
      setMembers(mList);
      
      if (userId === session!.user.id) {
        setActiveSharedBudget(null);
        setShowMembersModal(false);
      }
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo remover al miembro.');
    }
  };

  const handleReorder = async (sectionBudgets: Budget[], fromIndex: number, toIndex: number, sectionName: string) => {
    const copy = [...sectionBudgets];
    const [removed] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, removed);

    const newlyOrdered = copy.map((b, idx) => ({ ...b, order_index: idx + 1 }));

    setBudgets(prev => {
      const others = prev.filter(b => b.section !== sectionName);
      return [...others, ...newlyOrdered];
    });

    newlyOrdered.forEach(async (b) => {
      await BudgetService.updateOrderIndex(b.id, b.order_index);
    });
  };

  const sectionsSet = new Set(budgets.map(b => b.section));
  sectionsSet.add('Gastos Fijos');
  sectionsSet.add('Gastos Variables');
  if (activeSharedBudget) {
    sectionsSet.delete('CRÉDITOS');
  }
  const sections = Array.from(sectionsSet);

  const totalBudget = budgets.reduce((acc, b) => acc + b.limit_amount, 0);
  const totalSpent = budgets.reduce((acc, b) => acc + b.spent_amount, 0);
  const remainingIncome = totalIncome - totalSpent; 
  const toPayAmount = Math.max(0, totalBudget - totalSpent);
  
  const realMissingCash = Math.max(0, toPayAmount - remainingIncome);
  const budgetPaidProgress = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0;

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color="#00D09E" size="large" /></View>;
  }

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} scrollEnabled={!isDragging}>
        
        {/* Selector de Presupuesto (Personal / Compartidos) */}
        <View style={styles.workspaceHeader}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workspaceTabs}>
            <TouchableOpacity 
              style={[styles.workspaceTab, !activeSharedBudget && styles.workspaceTabActive]}
              onPress={() => setActiveSharedBudget(null)}
            >
              <FontAwesome name="user" size={12} color={!activeSharedBudget ? '#121212' : '#888'} style={{ marginRight: 6 }} />
              <Text style={[styles.workspaceTabText, !activeSharedBudget && styles.workspaceTabTextActive]}>Personal</Text>
            </TouchableOpacity>

            {sharedBudgets.map(sb => {
              const isActive = activeSharedBudget?.id === sb.id;
              return (
                <TouchableOpacity 
                  key={sb.id} 
                  style={[styles.workspaceTab, isActive && styles.workspaceTabActive]}
                  onPress={() => setActiveSharedBudget(sb)}
                >
                  <FontAwesome name="users" size={12} color={isActive ? '#121212' : '#888'} style={{ marginRight: 6 }} />
                  <Text style={[styles.workspaceTabText, isActive && styles.workspaceTabTextActive]}>{sb.name}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity 
              style={styles.addWorkspaceTab}
              onPress={() => setShowCreateSharedModal(true)}
            >
              <FontAwesome name="plus" size={12} color="#00D09E" />
            </TouchableOpacity>
          </ScrollView>

          {activeSharedBudget && (
            <TouchableOpacity 
              style={styles.manageMembersBtn}
              onPress={() => setShowMembersModal(true)}
            >
              <FontAwesome name="cog" size={14} color="#00D09E" style={{ marginRight: 6 }} />
              <Text style={styles.manageMembersBtnText}>Compartir</Text>
            </TouchableOpacity>
          )}
        </View>

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

        {budgets.filter(b => b.section === 'Gastos Fijos' || b.section === 'Gastos Variables').length === 0 && (
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

                  const isExpanded = b.is_debt && !!expandedCreditLines[b.id];

                  return (
                    <View style={{ flexDirection: 'column' }}>
                      <TouchableOpacity
                        activeOpacity={b.is_debt ? 0.8 : 1}
                        onPress={() => {
                          if (b.is_debt) {
                            toggleCreditLineExpand(b.id);
                          }
                        }}
                        style={[styles.row, { backgroundColor: rowBgColor, opacity: isActive ? 0.7 : 1, transform: [{scale: isActive ? 1.02 : 1}], zIndex: isActive ? 99 : 1, elevation: isActive ? 5 : 0 }]}
                      >
                        <View style={[styles.colorIndicator, { backgroundColor: indicatorColor }]} />
                        <View style={[styles.rowContent, { flexDirection: 'column', alignItems: 'stretch' }]}>
                          <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <View style={{flex: 2, flexDirection: 'row', alignItems: 'center'}}>
                              {b.is_debt ? (
                                <FontAwesome name={isExpanded ? 'chevron-down' : 'chevron-right'} size={12} color="#00D09E" style={{marginRight: 8, width: 14}} />
                              ) : (
                                <FontAwesome name={(b.icon as any) || 'circle-o'} size={14} color="#00D09E" style={{marginRight: 8}} />
                              )}
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
                      </TouchableOpacity>

                      {/* Renderizado de cuotas individuales en desglose */}
                      {isExpanded && b.installments && b.installments.map((inst: any) => {
                        const instPaid = inst.status === 'paid';
                        const instBg = 'rgba(255, 255, 255, 0.03)';
                        return (
                          <View 
                            key={inst.id} 
                            style={{ 
                              flexDirection: 'row', 
                              backgroundColor: instBg, 
                              paddingVertical: 10, 
                              paddingHorizontal: 16, 
                              borderBottomWidth: 1, 
                              borderBottomColor: '#222',
                              alignItems: 'center',
                              paddingLeft: 30
                            }}
                          >
                            <FontAwesome name="circle" size={6} color={instPaid ? '#00D09E' : '#FF4C4C'} style={{marginRight: 10}} />
                            <View style={{flex: 2}}>
                              <Text style={{color: '#FFF', fontSize: 11, fontWeight: 'bold'}} numberOfLines={1}>{inst.description}</Text>
                              <Text style={{color: '#888', fontSize: 9}}>Cuota {inst.installment_number}/{inst.total_installments}</Text>
                            </View>
                            <Text style={{color: '#FFF', fontSize: 11, flex: 1.5, textAlign: 'right'}}>${formatCurrency(inst.amount)}</Text>
                            <View style={{width: 60, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center'}}>
                              {instPaid ? (
                                <FontAwesome name="check-circle" size={18} color="#00D09E" style={{marginRight: 8}} />
                              ) : (
                                <TouchableOpacity 
                                  onPress={() => markSingleInstallmentPaid(inst.id, `${b.category}: ${inst.description} (${inst.installment_number}/${inst.total_installments})`, inst.amount)} 
                                  style={{padding: 6}}
                                >
                                  <FontAwesome name="money" size={14} color="#FFD700" />
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
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

      {/* Modal para Crear Presupuesto Compartido */}
      <Modal
        visible={showCreateSharedModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateSharedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Crear Presupuesto Compartido</Text>
            <Text style={styles.modalLabel}>Nombre del presupuesto (ej. Hogar, Empresa)</Text>
            <TextInput
              style={styles.modalInput}
              value={newSharedName}
              onChangeText={setNewSharedName}
              placeholder="Nombre del presupuesto..."
              placeholderTextColor="#666"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#333', flex: 1 }]} onPress={() => setShowCreateSharedModal(false)}>
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#00D09E', flex: 1 }]} onPress={handleCreateSharedBudget}>
                <Text style={{ color: '#000', fontWeight: 'bold' }}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para Gestionar Miembros */}
      <Modal
        visible={showMembersModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMembersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Miembros de {activeSharedBudget?.name}</Text>
              <TouchableOpacity onPress={() => setShowMembersModal(false)}>
                <FontAwesome name="close" size={20} color="#888" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Invitar nuevo miembro</Text>
            <View style={styles.inviteContainer}>
              <TextInput
                style={styles.inviteInput}
                value={newMemberUsername}
                onChangeText={setNewMemberUsername}
                placeholder="Nick con @ (ej: @gabriel)..."
                placeholderTextColor="#666"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.inviteBtn} onPress={handleAddMember}>
                <Text style={styles.inviteBtnText}>Agregar</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { marginTop: 16, marginBottom: 10 }]}>Miembros actuales</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {members.map((m) => (
                <View key={m.id} style={styles.memberRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    {m.profiles?.avatar_url ? (
                      <Image source={{ uri: m.profiles.avatar_url }} style={styles.memberAvatar} />
                    ) : (
                      <View style={styles.memberAvatarPlaceholder}>
                        <FontAwesome name="user" size={12} color="#888" />
                      </View>
                    )}
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{m.profiles?.full_name || 'Miembro Finiax'}</Text>
                      <Text style={styles.memberHandle}>@{m.profiles?.username || 'sin_handle'}</Text>
                    </View>
                  </View>
                  
                  {m.role === 'owner' ? (
                    <Text style={styles.memberRole}>Creador</Text>
                  ) : (
                    <TouchableOpacity style={styles.memberRemoveBtn} onPress={() => handleRemoveMember(m.user_id)}>
                      <FontAwesome name="trash" size={14} color="#FF4C4C" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
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
  paymentProgressSubtext: { color: '#888', fontSize: 10 },

  // Estilos Presupuesto Compartido
  workspaceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222'
  },
  workspaceTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workspaceTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333'
  },
  workspaceTabActive: {
    backgroundColor: '#00D09E',
    borderColor: '#00D09E'
  },
  workspaceTabText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600'
  },
  workspaceTabTextActive: {
    color: '#121212',
    fontWeight: 'bold'
  },
  addWorkspaceTab: {
    backgroundColor: '#1A1A1A',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4
  },
  manageMembersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    marginLeft: 12
  },
  manageMembersBtnText: {
    color: '#00D09E',
    fontSize: 12,
    fontWeight: 'bold'
  },
  inviteContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  inviteInput: {
    flex: 1,
    backgroundColor: '#222',
    color: '#FFF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333'
  },
  inviteBtn: {
    backgroundColor: '#00D09E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  inviteBtnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333'
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16
  },
  memberAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333'
  },
  memberInfo: {
    marginLeft: 10,
    flex: 1
  },
  memberName: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold'
  },
  memberHandle: {
    color: '#00D09E',
    fontSize: 10,
    marginTop: 1
  },
  memberRole: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold'
  },
  memberRemoveBtn: {
    padding: 6
  }
});
