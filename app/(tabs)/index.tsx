import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View, Text, ScrollView, RefreshControl, Dimensions, TouchableOpacity, LogBox, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome } from '@expo/vector-icons';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { TransactionService } from '@/lib/services/TransactionService';
import { CreditLineService } from '@/lib/services/CreditLineService';
import { AssetService } from '@/lib/services/AssetService';

// Ignorar advertencias específicas de React Native Web y SVG de librerías de terceros
LogBox.ignoreLogs(['Unknown event handler property']);

// Auxiliar: Oscurece un color hexadecimal por un porcentaje dado para los bordes/lados de la extrusión 3D
const darkenColor = (hex: string, percent: number): string => {
  let color = hex.replace('#', '');
  let num = parseInt(color, 16);
  let r = (num >> 16);
  let g = ((num >> 8) & 0x00FF);
  let b = (num & 0x0000FF);

  r = Math.max(0, Math.floor(r * (1 - percent / 100)));
  g = Math.max(0, Math.floor(g * (1 - percent / 100)));
  b = Math.max(0, Math.floor(b * (1 - percent / 100)));

  const rHex = r.toString(16).padStart(2, '0');
  const gHex = g.toString(16).padStart(2, '0');
  const bHex = b.toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
};

// Auxiliar: Mapea categorías a iconos de FontAwesome
const getCategoryIcon = (category: string): string => {
  const cat = category.toLowerCase().trim();
  if (cat.includes('comida') || cat.includes('alimentac') || cat.includes('supermerc') || cat.includes('restauran') || cat.includes('almuerzo') || cat.includes('cena')) return 'cutlery';
  if (cat.includes('transporte') || cat.includes('auto') || cat.includes('nafta') || cat.includes('subte') || cat.includes('colectivo') || cat.includes('taxi') || cat.includes('combustible')) return 'car';
  if (cat.includes('servicio') || cat.includes('luz') || cat.includes('agua') || cat.includes('gas') || cat.includes('internet') || cat.includes('expensas') || cat.includes('cable') || cat.includes('teléfono') || cat.includes('telefono')) return 'bolt';
  if (cat.includes('salud') || cat.includes('med') || cat.includes('farmac') || cat.includes('doctor') || cat.includes('dentista') || cat.includes('obra social')) return 'heartbeat';
  if (cat.includes('entreten') || cat.includes('cine') || cat.includes('salid') || cat.includes('juego') || cat.includes('bar') || cat.includes('netflix') || cat.includes('spotify') || cat.includes('club')) return 'gamepad';
  if (cat.includes('educac') || cat.includes('curso') || cat.includes('universid') || cat.includes('colegio') || cat.includes('libro') || cat.includes('cuota')) return 'graduation-cap';
  if (cat.includes('ropa') || cat.includes('vestimenta') || cat.includes('shopping') || cat.includes('calzado')) return 'shopping-bag';
  if (cat.includes('hogar') || cat.includes('alquiler') || cat.includes('mueble') || cat.includes('reparac')) return 'home';
  if (cat.includes('deuda') || cat.includes('pago') || cat.includes('crédito') || cat.includes('credito') || cat.includes('prestamo') || cat.includes('préstamo') || cat.includes('autoprestamo') || cat.includes('financiación')) return 'credit-card';
  if (cat.includes('ingreso') || cat.includes('sueldo') || cat.includes('salario') || cat.includes('honorarios') || cat.includes('pago recib')) return 'money';
  return 'ellipsis-h';
};

export default function DashboardScreen() {
  const { session } = useAuth();
  const [balance, setBalance] = useState(0);
  const [incomes, setIncomes] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [debts, setDebts] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
  // Estados de activos y patrimonio en Dashboard
  const [totalAssetsValue, setTotalAssetsValue] = useState(0);
  const [netWealth, setNetWealth] = useState(0);
  const [goalPct, setGoalPct] = useState(0);
  const [hasGoal, setHasGoal] = useState(false);
  const [goalVal, setGoalVal] = useState(0);

  // Estados de Gráficos y Desglose
  const [chartData, setChartData] = useState<any[]>([]);
  const [expenseBreakdown, setExpenseBreakdown] = useState<any[]>([]);
  const [detailedDebts, setDetailedDebts] = useState<any[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [overdueAlerts, setOverdueAlerts] = useState<any[]>([]);
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  // Estados del Comparador de Temporadas (Periodo B)
  const [compareMonthB, setCompareMonthB] = useState(
    new Date().getMonth() - 1 < 0 ? 11 : new Date().getMonth() - 1
  );
  const [compareYearB, setCompareYearB] = useState(
    new Date().getMonth() - 1 < 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()
  );
  const [comparisonResult, setComparisonResult] = useState<{
    incomesA: number;
    expensesA: number;
    incomesB: number;
    expensesB: number;
    debtsA: number;
    debtsB: number;
    expensesAIntervals: number[];
    expensesBIntervals: number[];
  } | null>(null);
  const [compLoading, setCompLoading] = useState(false);

  // Funciones de validación temporal de deudas
  const isNew = useCallback((createdAtString: string) => {
    const createdDate = new Date(createdAtString);
    const diffTime = Math.abs(new Date().getTime() - createdDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  }, []);

  const isOverdue = useCallback((d: any) => {
    return d.year < currentYear || (d.year === currentYear && d.month < currentMonth + 1);
  }, [currentMonth, currentYear]);

  // Carga de transacciones y deudas principales
  const fetchTransactions = useCallback(async () => {
    if (!session?.user?.id) return;
    
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();

    // 1. Obtener transacciones del mes activo
    let data;
    try {
      data = await TransactionService.getTransactionsByDateRange(session.user.id, startOfMonth, endOfMonth);
    } catch (e) {
      console.warn('Error fetching transactions:', e);
    }
      
    if (data) {
      let inc = 0, exp = 0;
      const catMap: Record<string, number> = {};
      const transactionsByCat: Record<string, any[]> = {};

      data.forEach(t => {
        if (t.type === 'income') inc += Number(t.amount);
        // Sólo sumamos a gastos si NO es tarjeta de crédito
        if (t.type === 'expense' && t.payment_method !== 'credit_card') {
          const amt = Number(t.amount);
          exp += amt;
          const cat = t.category || 'Otros';
          catMap[cat] = (catMap[cat] || 0) + amt;

          if (!transactionsByCat[cat]) {
            transactionsByCat[cat] = [];
          }
          transactionsByCat[cat].push(t);
        }
      });

      setIncomes(inc);
      setExpenses(exp);
      setBalance(inc - exp);

      const chartColors = ['#FF4C4C', '#00D09E', '#FFD700', '#4BC0C0', '#9966FF', '#FF9F40', '#E53935', '#8E24AA', '#3949AB'];
      
      const mappedChartData = Object.keys(catMap).map((cat, index) => {
        const catAmount = catMap[cat];
        const pct = exp > 0 ? (catAmount / exp) * 100 : 0;
        return {
          name: `${cat} (${pct.toFixed(0)}%)`,
          amount: catAmount,
          color: chartColors[index % chartColors.length],
          legendFontColor: '#A0A0A0',
          legendFontSize: 11
        };
      }).sort((a, b) => b.amount - a.amount);
      
      setChartData(mappedChartData);

      // Calcular detalles de desglose
      const breakdown = Object.keys(catMap).map((cat, index) => {
        const catAmount = catMap[cat];
        const pct = exp > 0 ? (catAmount / exp) * 100 : 0;
        return {
          category: cat,
          amount: catAmount,
          percentage: pct,
          color: chartColors[index % chartColors.length],
          count: transactionsByCat[cat]?.length || 0,
          transactions: (transactionsByCat[cat] || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        };
      }).sort((a, b) => b.amount - a.amount);

      setExpenseBreakdown(breakdown);
    }


    // 2. Obtener Deudas Pendientes (vigentes y atrasadas) y calcular total de deudas vigentes
    let activeDebtsSum = 0;
    let allDebtData: any[] = [];
    try {
      allDebtData = await CreditLineService.getPendingInstallments(session.user.id);
    } catch (e) {
      console.warn('Error fetching pending installments:', e);
    }
      
    if (allDebtData && allDebtData.length > 0) {
      const currentAndOverdue = allDebtData.filter(d => {
        return d.year < currentYear || (d.year === currentYear && d.month <= currentMonth + 1);
      });
      
      const overdue = allDebtData.filter(d => {
        return d.year < currentYear || (d.year === currentYear && d.month < currentMonth + 1);
      });
      setOverdueAlerts(overdue);
      
      currentAndOverdue.forEach(d => activeDebtsSum += Number(d.amount));
      setDebts(activeDebtsSum);

      const sortedDebts = [...currentAndOverdue].sort((a, b) => {
        const aOverdue = a.year < currentYear || (a.year === currentYear && a.month < currentMonth + 1);
        const bOverdue = b.year < currentYear || (b.year === currentYear && b.month < currentMonth + 1);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setDetailedDebts(sortedDebts);
    } else {
      setDebts(0);
      setDetailedDebts([]);
      setOverdueAlerts([]);
    }

    // 3. Obtener deudas totales de la base de datos (todas las cuotas pendientes) para patrimonio neto
    let allPendingDebtsSum = 0;
    let totalAutoprestamos = 0;
    if (allDebtData && allDebtData.length > 0) {
      allDebtData.forEach(d => {
        const amt = Number(d.amount);
        allPendingDebtsSum += amt;
        const clName = (d.credit_lines?.name || '').toLowerCase();
        if (clName.includes('autoprestamo') || clName.includes('autopréstamo') || clName.includes('prestamos personales') || clName.includes('préstamos personales')) {
          totalAutoprestamos += amt;
        }
      });
    }

    // 4. Obtener Activos y calcular valorización en ARS (utilizando ccl rate y live prices aproximados)
    try {
      const assetsData = await AssetService.getAssets(session.user.id);

      // Obtener cotizaciones de dolarapi ccl
      let cclRate = 1350;
      try {
        const res = await fetch('https://dolarapi.com/v1/dolares/ccl');
        if (res.ok) {
          const data = await res.json();
          if (data?.venta) cclRate = Number(data.venta);
        }
      } catch (e) {}

      let assetsSumARS = 0;
      if (assetsData) {
        assetsData.forEach(asset => {
          const sym = asset.symbol.toUpperCase().trim();
          const n = asset.name.toLowerCase().trim();
          const isUSD = sym.startsWith('USD:') || sym.startsWith('EUR:') || sym.startsWith('BRL:') || sym === 'BTC' || sym === 'ETH' || sym === 'USDT' || sym.includes('USD') || n.includes('dolar') || n.includes('crypto');

          let valueARS = 0;
          if (sym === 'PRESTAMOS PERSONALES' || n.includes('autoprestamo') || n.includes('autopréstamo') || n.includes('prestamos personales')) {
            valueARS = totalAutoprestamos;
          } else if (sym === 'MERCADO PAGO' || n.includes('mercado pago')) {
            valueARS = Math.max(0, asset.quantity - totalAutoprestamos);
          } else {
            const price = asset.current_price || asset.average_buy_price || 0;
            if (isUSD) {
              valueARS = asset.quantity * price * cclRate;
            } else {
              valueARS = asset.quantity * price;
            }
          }
          assetsSumARS += valueARS;
        });
      }
      setTotalAssetsValue(assetsSumARS);
      const wealth = assetsSumARS - allPendingDebtsSum;
      setNetWealth(wealth);

      // Cargar meta de inversión del AsyncStorage
      const savedGoal = await AsyncStorage.getItem('finiax_investment_goal');
      const savedGoalCurrency = await AsyncStorage.getItem('finiax_goal_currency');
      if (savedGoal) {
        const goalNum = Number(savedGoal);
        setGoalVal(goalNum);
        setHasGoal(true);
        let goalARS = goalNum;
        if (savedGoalCurrency === 'USD') goalARS = goalNum * cclRate;
        const progress = goalARS > 0 ? Math.min(100, (wealth / goalARS) * 100) : 0;
        setGoalPct(progress);
      } else {
        setHasGoal(false);
      }
    } catch (e) {}

  }, [session, currentMonth, currentYear]);

  // Carga paralela del Comparador de Temporadas
  const fetchComparisonData = useCallback(async () => {
    if (!session?.user?.id) return;
    setCompLoading(true);

    try {
      // Periodo A límites (Mes activo de Dashboard)
      const startA = new Date(currentYear, currentMonth, 1).toISOString();
      const endA = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();

      // Periodo B límites (Mes de Comparación)
      const startB = new Date(compareYearB, compareMonthB, 1).toISOString();
      const endB = new Date(compareYearB, compareMonthB + 1, 0, 23, 59, 59).toISOString();

      const dataA = await TransactionService.getTransactionsByDateRange(session.user.id, startA, endA);
      const dataB = await TransactionService.getTransactionsByDateRange(session.user.id, startB, endB);

      // Obtener deudas del Periodo A
      const debtsDataA = await CreditLineService.getInstallmentsByMonth(session.user.id, currentMonth + 1, currentYear);

      // Obtener deudas del Periodo B
      const debtsDataB = await CreditLineService.getInstallmentsByMonth(session.user.id, compareMonthB + 1, compareYearB);

      let incA = 0, expA = 0;
      const expAIntervals = [0, 0, 0, 0, 0, 0];
      if (dataA) {
        dataA.forEach(t => {
          if (t.type === 'income') {
            incA += Number(t.amount);
          }
          if (t.type === 'expense' && t.payment_method !== 'credit_card') {
            const amt = Number(t.amount);
            expA += amt;

            const tDate = new Date(t.date);
            const day = tDate.getDate();
            let idx = 0;
            if (day <= 5) idx = 0;
            else if (day <= 10) idx = 1;
            else if (day <= 15) idx = 2;
            else if (day <= 20) idx = 3;
            else if (day <= 25) idx = 4;
            else idx = 5;
            expAIntervals[idx] += amt;
          }
        });
      }

      let incB = 0, expB = 0;
      const expBIntervals = [0, 0, 0, 0, 0, 0];
      if (dataB) {
        dataB.forEach(t => {
          if (t.type === 'income') {
            incB += Number(t.amount);
          }
          if (t.type === 'expense' && t.payment_method !== 'credit_card') {
            const amt = Number(t.amount);
            expB += amt;

            const tDate = new Date(t.date);
            const day = tDate.getDate();
            let idx = 0;
            if (day <= 5) idx = 0;
            else if (day <= 10) idx = 1;
            else if (day <= 15) idx = 2;
            else if (day <= 20) idx = 3;
            else if (day <= 25) idx = 4;
            else idx = 5;
            expBIntervals[idx] += amt;
          }
        });
      }

      let debtsA = 0;
      if (debtsDataA) {
        debtsDataA.forEach(d => debtsA += Number(d.amount));
      }

      let debtsB = 0;
      if (debtsDataB) {
        debtsDataB.forEach(d => debtsB += Number(d.amount));
      }

      setComparisonResult({
        incomesA: incA,
        expensesA: expA,
        incomesB: incB,
        expensesB: expB,
        debtsA: debtsA,
        debtsB: debtsB,
        expensesAIntervals: expAIntervals,
        expensesBIntervals: expBIntervals
      });
    } catch (e) {
      console.error('Error cargando datos comparativos:', e);
    } finally {
      setCompLoading(false);
    }
  }, [session, currentMonth, currentYear, compareMonthB, compareYearB]);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
      fetchComparisonData();
    }, [fetchTransactions, fetchComparisonData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchTransactions(), fetchComparisonData()]);
    setRefreshing(false);
  }, [fetchTransactions, fetchComparisonData]);

  const changeMonth = (offset: number) => {
    let newM = currentMonth + offset;
    let newY = currentYear;
    if (newM < 0) { newM = 11; newY--; }
    else if (newM > 11) { newM = 0; newY++; }
    setCurrentMonth(newM);
    setCurrentYear(newY);
    setExpandedCategory(null);

    // Auto-alinear B al mes previo de A
    let prevM = newM - 1;
    let prevY = newY;
    if (prevM < 0) { prevM = 11; prevY--; }
    setCompareMonthB(prevM);
    setCompareYearB(prevY);
  };

  const changeCompareMonthB = (offset: number) => {
    let newM = compareMonthB + offset;
    let newY = compareYearB;
    if (newM < 0) { newM = 11; newY--; }
    else if (newM > 11) { newM = 0; newY++; }
    setCompareMonthB(newM);
    setCompareYearB(newY);
  };

  const getMonthName = (monthIdx: number, year: number) => {
    return new Date(year, monthIdx).toLocaleString('es-ES', { month: 'short', year: 'numeric' }).toUpperCase();
  };

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - 48;
  const pieCenterShift = chartWidth / 4;

  // Recomendación del Comparador
  const getComparisonAdvice = () => {
    if (!comparisonResult) return '';
    const { incomesA, expensesA, incomesB, expensesB, debtsA, debtsB } = comparisonResult;
    const balanceA = incomesA - expensesA;
    const balanceB = incomesB - expensesB;

    const debtDiff = debtsA - debtsB;
    const debtChangePct = debtsB > 0 ? (debtDiff / debtsB) * 100 : (debtsA > 0 ? 100 : 0);

    if (debtsA > debtsB && debtChangePct > 15) {
      return `⚠️ Alerta de Deudas: Tus deudas de este período aumentaron un ${debtChangePct.toFixed(0)}% respecto al periodo de comparación. Intenta moderar el uso del crédito para evitar comprometer tus ingresos futuros.`;
    }
    if (expensesA < expensesB && incomesA >= incomesB && debtsA <= debtsB) {
      return "🎉 ¡Excelente gestión! Has reducido tus gastos y deudas, y mantenido o aumentado tus ingresos en comparación con el periodo de comparación. ¡Sigue así!";
    }
    if (expensesA > expensesB && incomesA < incomesB) {
      return "⚠️ Alerta financiera: Tus gastos aumentaron mientras que tus ingresos disminuyeron respecto al periodo de comparación. Te recomendamos revisar tu presupuesto de gastos variables.";
    }
    if (balanceA > balanceB) {
      return "📈 ¡Tu balance neto ha mejorado! Lograste retener una mayor cantidad de dinero ahorrado que en el periodo comparativo.";
    }
    if (balanceA < balanceB) {
      return "📉 Tu balance neto disminuyó en comparación con la otra temporada. Intenta reducir los gastos hormiga para estabilizar tus finanzas.";
    }
    return "⚖️ Tus finanzas se mantienen estables entre ambos periodos. Buen control de tu presupuesto general.";
  };

  // Renderizador de Barras Comparativas
  const renderComparisonBar = (
    title: string,
    valA: number,
    valB: number,
    colorA: string,
    colorB: string,
    isPositiveGood: boolean
  ) => {
    const max = Math.max(Math.abs(valA), Math.abs(valB), 1);
    const widthA = `${(Math.max(0, Math.abs(valA)) / max) * 100}%`;
    const widthB = `${(Math.max(0, Math.abs(valB)) / max) * 100}%`;
    
    let pctChange = 0;
    if (valB !== 0) {
      pctChange = ((valA - valB) / Math.abs(valB)) * 100;
    } else if (valA !== 0) {
      pctChange = 100;
    }

    const isIncrease = pctChange > 0;
    const isGood = isPositiveGood ? isIncrease : !isIncrease;
    const changeColor = pctChange === 0 ? '#888' : (isGood ? '#00D09E' : '#FF4C4C');
    const formattedA = `$${formatCurrency(valA)}`;
    const formattedB = `$${formatCurrency(valB)}`;

    return (
      <View style={styles.compItem}>
        <View style={styles.compHeaderRow}>
          <Text style={styles.compItemTitle}>{title}</Text>
          <View style={[styles.compChangeBadge, { backgroundColor: changeColor + '15' }]}>
            <FontAwesome 
              name={pctChange === 0 ? 'minus' : (isIncrease ? 'arrow-up' : 'arrow-down')} 
              size={10} 
              color={changeColor} 
            />
            <Text style={[styles.compChangeText, { color: changeColor }]}>
              {pctChange === 0 ? 'Sin cambios' : `${Math.abs(pctChange).toFixed(1)}%`}
            </Text>
          </View>
        </View>
        
        <View style={styles.compBarContainer}>
          <View style={styles.compBarRow}>
            <Text style={styles.compPeriodLabel}>Act (A):</Text>
            <View style={styles.compBarBg}>
              <View style={[styles.compBarFill, { width: widthA as any, backgroundColor: colorA }]} />
            </View>
            <Text style={styles.compValueText}>{formattedA}</Text>
          </View>
          
          <View style={styles.compBarRow}>
            <Text style={styles.compPeriodLabel}>Comp (B):</Text>
            <View style={styles.compBarBg}>
              <View style={[styles.compBarFill, { width: widthB as any, backgroundColor: colorB }]} />
            </View>
            <Text style={styles.compValueText}>{formattedB}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D09E" />}
    >
      {/* Selector de Mes */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={styles.title}>Hola, de nuevo 👋</Text>
          <TouchableOpacity 
            onPress={() => setShowAlertsModal(true)} 
            style={styles.notificationBell}
            activeOpacity={0.7}
          >
            <FontAwesome name="bell" size={18} color={overdueAlerts.length > 0 ? '#FF4C4C' : '#AAA'} />
            {overdueAlerts.length > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{overdueAlerts.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={{padding: 5}}>
            <FontAwesome name="chevron-left" size={14} color="#00D09E" />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {getMonthName(currentMonth, currentYear)}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={{padding: 5}}>
            <FontAwesome name="chevron-right" size={14} color="#00D09E" />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Balance y Estadísticas */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Balance Total</Text>
        <Text style={styles.balanceValue}>${formatCurrency(balance)}</Text>
      </View>

      {/* Resumen de Activos y Patrimonio Neto */}
      <View style={styles.assetsDashboardCard}>
        <Text style={styles.assetsDashboardTitle}>PATRIMONIO Y PORTAFOLIO</Text>
        <View style={styles.assetsDashboardGrid}>
          <View style={styles.assetsDashboardCol}>
            <Text style={styles.assetsDashboardLabel}>Patrimonio Neto</Text>
            <Text style={[styles.assetsDashboardValue, { color: netWealth < 0 ? '#FF4C4C' : '#00D09E' }]}>
              ${formatCurrency(netWealth)}
            </Text>
          </View>
          <View style={styles.assetsDashboardCol}>
            <Text style={styles.assetsDashboardLabel}>Valor de Activos</Text>
            <Text style={styles.assetsDashboardValue}>${formatCurrency(totalAssetsValue)}</Text>
          </View>
        </View>
        
        {hasGoal && (
          <View style={styles.assetsDashboardGoalSection}>
            <View style={styles.assetsDashboardGoalHeader}>
              <Text style={styles.assetsDashboardGoalText}>Progreso hacia Meta de Ahorro</Text>
              <Text style={styles.assetsDashboardGoalPct}>{formatNumber(goalPct, 1)}%</Text>
            </View>
            <View style={styles.assetsDashboardGoalBarBg}>
              <View style={[styles.assetsDashboardGoalBarFill, { width: `${goalPct}%` }]} />
            </View>
            <Text style={styles.assetsDashboardGoalSubtext}>Meta: ${formatCurrency(goalVal)}</Text>
          </View>
        )}
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { borderLeftColor: '#00D09E', borderLeftWidth: 4 }]}>
          <Text style={styles.statLabel}>Ingresos</Text>
          <Text style={styles.statValue}>+${formatCurrency(incomes)}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#FF4C4C', borderLeftWidth: 4 }]}>
          <Text style={styles.statLabel}>Gastos</Text>
          <Text style={styles.statValue}>-${formatCurrency(expenses)}</Text>
        </View>
      </View>

      <View style={[styles.statCard, { marginTop: 16, borderLeftColor: '#FFD700', borderLeftWidth: 4 }]}>
        <Text style={styles.statLabel}>Deudas del Periodo</Text>
        <Text style={[styles.statValue, { color: '#FFD700' }]}>${formatCurrency(debts)}</Text>
      </View>

      {/* Gráfico de Torta 3D (Distribución de Gastos Actuales) */}
      {chartData.length > 0 ? (
        <View style={styles.chartContainer}>
          <Text style={styles.sectionTitle}>Distribución de Gastos</Text>
          
          <View style={styles.pie3DWrapper}>
            <View style={styles.pie3DContainer}>
              {/* Sombra de la torta */}
              <View style={styles.pieShadow} />
              
              {/* Capas de Extrusión 3D */}
              {[6, 5, 4, 3, 2, 1].map((offset) => (
                <View
                  key={offset}
                  style={[
                    styles.pieLayer,
                    {
                      top: offset,
                    }
                  ]}
                >
                  <PieChart
                    data={chartData.map(d => ({
                      ...d,
                      color: darkenColor(d.color, 12 + offset * 4)
                    }))}
                    width={chartWidth}
                    height={200} // Aumentado
                    chartConfig={{
                      color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    }}
                    accessor={"amount"}
                    backgroundColor={"transparent"}
                    paddingLeft="0"
                    center={[pieCenterShift, 0]}
                    hasLegend={false}
                  />
                </View>
              ))}
              
              {/* Capa Principal Superior */}
              <View style={[styles.pieLayer, { top: 0 }]}>
                <PieChart
                  data={chartData}
                  width={chartWidth}
                  height={200} // Aumentado
                  chartConfig={{
                    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                  }}
                  accessor={"amount"}
                  backgroundColor={"transparent"}
                  paddingLeft="0"
                  center={[pieCenterShift, 0]}
                  hasLegend={false}
                />
              </View>
            </View>
          </View>
          
          {/* Resumen del total de porcentajes de gastos */}
          <View style={styles.chartTotalSumRow}>
            <Text style={styles.chartTotalSumLabel}>Suma de Gastos Registrados</Text>
            <View style={styles.chartTotalSumBadge}>
              <Text style={styles.chartTotalSumValue}>${formatCurrency(expenses)} (100%)</Text>
            </View>
          </View>

          {/* Desglose Detallado de Gastos por Categoría */}
          <View style={styles.breakdownList}>
            <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 12, marginBottom: 8 }]}>Detalle por Categoría</Text>
            {expenseBreakdown.map((item) => {
              const isExpanded = expandedCategory === item.category;
              return (
                <View key={item.category} style={styles.breakdownCard}>
                  <TouchableOpacity
                    style={styles.breakdownHeader}
                    onPress={() => setExpandedCategory(isExpanded ? null : item.category)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.breakdownLeft}>
                      <View style={[styles.iconCircle, { backgroundColor: item.color + '20' }]}>
                        <FontAwesome name={getCategoryIcon(item.category) as any} size={14} color={item.color} />
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={styles.categoryName} numberOfLines={1}>{item.category}</Text>
                        <Text style={styles.categorySubtext}>
                          {item.count} {item.count === 1 ? 'gasto' : 'gastos'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.breakdownRight}>
                      <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                        <Text style={styles.categoryAmount}>${formatCurrency(item.amount)}</Text>
                        <Text style={styles.categoryPercentage}>{formatCurrency(item.percentage)}%</Text>
                      </View>
                      <FontAwesome name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#888" />
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.expandedTransactions}>
                      <View style={styles.divider} />
                      {item.transactions.map((tx: any) => (
                        <View key={tx.id} style={styles.txRow}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={styles.txTitle} numberOfLines={1}>
                              {tx.name || tx.description || 'Gasto'}
                            </Text>
                            <Text style={styles.txSub}>
                              {new Date(tx.date).toLocaleDateString('es-AR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Text>
                          </View>
                          <Text style={styles.txPrice}>-${formatCurrency(Number(tx.amount))}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={[styles.chartContainer, { alignItems: 'center', justifyContent: 'center', height: 200 }]}>
          <FontAwesome name="pie-chart" size={40} color="#333" style={{ marginBottom: 12 }} />
          <Text style={{color: '#888', fontStyle: 'italic'}}>No hay gastos registrados en este mes.</Text>
        </View>
      )}

      {/* Visualización Gráfica de Deudas */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Deudas a Pagar</Text>
        {detailedDebts.length > 0 && (
          <Text style={styles.debtsSummaryCount}>
            {detailedDebts.length} {detailedDebts.length === 1 ? 'pendiente' : 'pendientes'}
          </Text>
        )}
      </View>

      {detailedDebts.length > 0 ? (
        <View style={styles.debtsList}>
          {detailedDebts.map((d) => {
            const isNewDebt = isNew(d.created_at);
            const isOverdueDebt = isOverdue(d);
            
            let borderColor = '#2E2E2E';
            let badgeBg = '#333';
            let badgeText = '#A0A0A0';
            let statusLabel = 'PENDIENTE';
            let glowStyle = {};
            
            if (isOverdueDebt) {
              borderColor = '#FF4C4C';
              badgeBg = 'rgba(255, 76, 76, 0.15)';
              badgeText = '#FF4C4C';
              statusLabel = 'ATRASADA';
            } else if (isNewDebt) {
              borderColor = '#00D09E';
              badgeBg = 'rgba(0, 208, 158, 0.15)';
              badgeText = '#00D09E';
              statusLabel = 'NUEVA';
              glowStyle = {
                shadowColor: '#00D09E',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
              };
            } else {
              borderColor = '#FFD700';
              badgeBg = 'rgba(255, 215, 0, 0.15)';
              badgeText = '#FFD700';
              statusLabel = 'VIGENTE';
            }

            const progress = d.total_installments > 0 ? (d.installment_number / d.total_installments) : 1;
            const progressPercent = Math.min(100, Math.max(0, progress * 100));

            return (
              <View 
                key={d.id} 
                style={[
                  styles.debtCard, 
                  { borderColor }, 
                  glowStyle
                ]}
              >
                <View style={styles.debtHeader}>
                  <View style={styles.debtInfoLeft}>
                    <View style={[styles.debtIconContainer, { backgroundColor: isOverdueDebt ? 'rgba(255, 76, 76, 0.1)' : 'rgba(255, 255, 255, 0.05)' }]}>
                      <FontAwesome 
                        name={(d.icon || 'credit-card') as any} 
                        size={16} 
                        color={isOverdueDebt ? '#FF4C4C' : '#FFF'} 
                      />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={styles.creditLineName} numberOfLines={1}>
                        {d.credit_lines?.name || 'Línea de Crédito'}
                      </Text>
                      <Text style={styles.debtDescription} numberOfLines={1}>
                        {d.description}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.debtInfoRight}>
                    <Text style={[styles.debtAmount, { color: isOverdueDebt ? '#FF4C4C' : '#FFF' }]}>
                      ${formatCurrency(Number(d.amount))}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                      <Text style={[styles.statusBadgeText, { color: badgeText }]}>{statusLabel}</Text>
                    </View>
                  </View>
                </View>

                {/* Barra de progreso de la deuda */}
                <View style={styles.debtProgressSection}>
                  <View style={styles.debtProgressLabels}>
                    <Text style={styles.debtProgressText}>
                      Cuota {d.installment_number} de {d.total_installments}
                    </Text>
                    <Text style={styles.debtProgressPct}>
                      {Math.round(progressPercent)}% pago
                    </Text>
                  </View>
                  <View style={styles.debtProgressBarBg}>
                    <View 
                      style={[
                        styles.debtProgressBarFill, 
                        { 
                          width: `${progressPercent}%`,
                          backgroundColor: isOverdueDebt ? '#FF4C4C' : (isNewDebt ? '#00D09E' : '#FFD700')
                        }
                      ]} 
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyDebtsCard}>
          <FontAwesome name="check-circle" size={36} color="#00D09E" />
          <Text style={styles.emptyDebtsText}>No tienes deudas pendientes para pagar.</Text>
          <Text style={styles.emptyDebtsSubtext}>¡Buen trabajo manteniendo tus cuentas limpias! 🎉</Text>
        </View>
      )}

      {/* Comparación de Temporadas */}
      <View style={styles.compareContainer}>
        <Text style={styles.sectionTitle}>Comparación de Temporadas</Text>
        
        {/* Fila de selectores */}
        <View style={styles.compareSelectorRow}>
          {/* Periodo A */}
          <View style={styles.compareSelectorCol}>
            <Text style={styles.compareColLabel}>Periodo A (Activo)</Text>
            <View style={[styles.selectorDisplayBox, { borderColor: '#00D09E' }]}>
              <FontAwesome name="calendar" size={12} color="#00D09E" />
              <Text style={styles.selectorText}>{getMonthName(currentMonth, currentYear)}</Text>
            </View>
          </View>
          
          {/* Periodo B */}
          <View style={styles.compareSelectorCol}>
            <Text style={styles.compareColLabel}>Periodo B (Comparar con)</Text>
            <View style={[styles.selectorDisplayBox, { borderColor: '#333' }]}>
              <TouchableOpacity onPress={() => changeCompareMonthB(-1)} style={styles.selectorArrow}>
                <FontAwesome name="chevron-left" size={11} color="#A0A0A0" />
              </TouchableOpacity>
              <Text style={styles.selectorText}>{getMonthName(compareMonthB, compareYearB)}</Text>
              <TouchableOpacity onPress={() => changeCompareMonthB(1)} style={styles.selectorArrow}>
                <FontAwesome name="chevron-right" size={11} color="#A0A0A0" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Resultados de comparación */}
        {compLoading ? (
          <View style={styles.compLoader}>
            <Text style={{color: '#888'}}>Calculando métricas comparativas...</Text>
          </View>
        ) : comparisonResult ? (
          <View style={styles.compCard}>
            {renderComparisonBar(
              "Ingresos", 
              comparisonResult.incomesA, 
              comparisonResult.incomesB, 
              "#00D09E", 
              "rgba(0, 208, 158, 0.4)", 
              true
            )}
            <View style={styles.compDivider} />
            {renderComparisonBar(
              "Gastos", 
              comparisonResult.expensesA, 
              comparisonResult.expensesB, 
              "#FF4C4C", 
              "rgba(255, 76, 76, 0.4)", 
              false
            )}
            <View style={styles.compDivider} />
            {renderComparisonBar(
              "Deudas", 
              comparisonResult.debtsA, 
              comparisonResult.debtsB, 
              "#FFD700", 
              "rgba(255, 215, 0, 0.4)", 
              false
            )}
            <View style={styles.compDivider} />
            {renderComparisonBar(
              "Balance Neto", 
              comparisonResult.incomesA - comparisonResult.expensesA, 
              comparisonResult.incomesB - comparisonResult.expensesB, 
              "#3498DB", 
              "rgba(52, 152, 219, 0.4)", 
              true
            )}
            
            <View style={styles.compDivider} />

            {/* Gráfico de Tendencias Comparativo (Líneas Suavizadas Bezier de Gastos A vs B) */}
            <View style={styles.compChartWrapper}>
              <Text style={styles.compChartTitle}>Comparación de Gastos (Tendencia)</Text>
              <LineChart
                data={{
                  labels: ["1-5", "6-10", "11-15", "16-20", "21-25", "26+"],
                  datasets: [
                    {
                      data: comparisonResult.expensesAIntervals,
                      color: (opacity = 1) => `rgba(0, 208, 158, ${opacity})`, // Verde/Cyan para Activo A
                      strokeWidth: 3
                    },
                    {
                      data: comparisonResult.expensesBIntervals,
                      color: (opacity = 1) => `rgba(255, 165, 0, ${opacity})`, // Naranja/Dorado para Comparar B
                      strokeWidth: 3
                    }
                  ],
                  legend: [
                    `Act: ${getMonthName(currentMonth, currentYear)}`,
                    `Comp: ${getMonthName(compareMonthB, compareYearB)}`
                  ]
                }}
                width={chartWidth - 32} // Ancho adaptado al contenedor interno con padding
                height={180}
                chartConfig={{
                  backgroundColor: '#151515',
                  backgroundGradientFrom: '#151515',
                  backgroundGradientTo: '#151515',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(160, 160, 160, ${opacity})`,
                  style: {
                    borderRadius: 12
                  }
                }}
                bezier
                withDots={false} // Evitar renderizado de puntos en Web para solucionar advertencias de onPressIn
                style={{
                  marginVertical: 8,
                  borderRadius: 12
                }}
              />
            </View>

            {/* Consejo contextual */}
            <View style={styles.compAdviceBox}>
              <FontAwesome name="lightbulb-o" size={16} color="#FFD700" style={{ marginRight: 10, marginTop: 2 }} />
              <Text style={styles.compAdviceText}>{getComparisonAdvice()}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.compLoader}>
            <Text style={{color: '#888'}}>Ingresa transacciones para ver la comparación.</Text>
          </View>
        )}
      </View>

      {/* Modal de Alertas de Notificación (Cuotas Atrasadas) */}
      <Modal
        visible={showAlertsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAlertsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <FontAwesome name="bell" size={20} color="#FF4C4C" />
                <Text style={styles.modalTitle}>Notificaciones</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAlertsModal(false)} style={styles.modalCloseButton}>
                <FontAwesome name="times" size={18} color="#AAA" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 24 }}>
              {overdueAlerts.length > 0 ? (
                <>
                  <Text style={styles.overdueAlertTitle}>Tienes cuotas de pago atrasadas</Text>
                  <Text style={styles.overdueAlertSubtitle}>
                    Las siguientes cuotas de tus líneas de crédito han superado su fecha de vencimiento:
                  </Text>
                  {overdueAlerts.map((alert) => (
                    <View key={alert.id} style={styles.alertCard}>
                      <View style={styles.alertCardHeader}>
                        <Text style={styles.alertCreditLineName}>
                          {alert.credit_lines?.name || 'Línea de Crédito'}
                        </Text>
                        <Text style={styles.alertAmount}>
                          ${formatCurrency(Number(alert.amount))}
                        </Text>
                      </View>
                      <Text style={styles.alertDescription}>{alert.description}</Text>
                      <View style={styles.alertFooter}>
                        <View style={styles.alertDateBadge}>
                          <FontAwesome name="calendar-o" size={10} color="#FF4C4C" style={{ marginRight: 6 }} />
                          <Text style={styles.alertDateText}>
                            Venció: {alert.month}/{alert.year}
                          </Text>
                        </View>
                        <Text style={styles.alertStatusText}>ATRASADO</Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <View style={styles.emptyAlertsContainer}>
                  <FontAwesome name="check-circle" size={48} color="#00D09E" />
                  <Text style={styles.emptyAlertsTitle}>¡Todo al día!</Text>
                  <Text style={styles.emptyAlertsText}>
                    No tienes cuotas atrasadas pendientes de pago.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={{height: 60}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 20, color: '#FFF' },
  monthSelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: '#333' },
  monthText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', width: 70, textAlign: 'center' },
  balanceCard: { backgroundColor: '#1A1A1A', padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 24 },
  balanceLabel: { color: '#A0A0A0', fontSize: 16, marginBottom: 8 },
  balanceValue: { color: '#00D09E', fontSize: 36, fontWeight: 'bold' },
  statsContainer: { flexDirection: 'row', gap: 16 },
  statCard: { flex: 1, backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12 },
  statLabel: { color: '#A0A0A0', fontSize: 14, marginBottom: 8 },
  statValue: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  
  // Gráfico y Desglose
  chartContainer: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 16, marginTop: 24, borderWidth: 1, borderColor: '#333' },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  
  pie3DWrapper: {
    height: 220,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  pie3DContainer: {
    height: 200,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [
      { perspective: 1000 },
      { rotateX: '55deg' },
      { rotateY: '0deg' }
    ],
  },
  pieShadow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    top: 20,
    transform: [
      { scaleY: 0.5 }
    ],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  pieLayer: {
    position: 'absolute',
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Desglose de Gastos
  breakdownList: { marginTop: 20, gap: 8 },
  breakdownCard: { backgroundColor: '#1E1E1E', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#2E2E2E' },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  categoryName: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  categorySubtext: { color: '#888', fontSize: 11, marginTop: 2 },
  breakdownRight: { flexDirection: 'row', alignItems: 'center' },
  categoryAmount: { color: '#FFF', fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
  categoryPercentage: { color: '#888', fontSize: 11, marginTop: 2, textAlign: 'right' },
  
  expandedTransactions: { backgroundColor: '#161616', paddingHorizontal: 14, paddingBottom: 12 },
  divider: { height: 1, backgroundColor: '#2E2E2E', marginBottom: 8 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#222' },
  txTitle: { color: '#DDD', fontSize: 13 },
  txSub: { color: '#666', fontSize: 10, marginTop: 2 },
  txPrice: { color: '#FF4C4C', fontSize: 13, fontWeight: '600' },

  // Deudas
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 12 },
  debtsSummaryCount: { color: '#888', fontSize: 12 },
  debtsList: { gap: 12 },
  debtCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, borderWidth: 1 },
  debtHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  debtInfoLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  debtIconContainer: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  creditLineName: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  debtDescription: { color: '#A0A0A0', fontSize: 12, marginTop: 2 },
  debtInfoRight: { alignItems: 'flex-end', marginLeft: 12 },
  debtAmount: { fontSize: 15, fontWeight: 'bold' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  statusBadgeText: { fontSize: 9, fontWeight: 'bold' },
  debtProgressSection: { marginTop: 12 },
  debtProgressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  debtProgressText: { color: '#888', fontSize: 11 },
  debtProgressPct: { color: '#888', fontSize: 11, fontWeight: '600' },
  debtProgressBarBg: { height: 6, backgroundColor: '#2E2E2E', borderRadius: 3, overflow: 'hidden' },
  debtProgressBarFill: { height: '100%', borderRadius: 3 },
  emptyDebtsCard: { backgroundColor: '#1A1A1A', padding: 24, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333', marginTop: 8 },
  emptyDebtsText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
  emptyDebtsSubtext: { color: '#888', fontSize: 12, marginTop: 4, textAlign: 'center' },

  // Comparador de Temporadas
  compareContainer: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 16, marginTop: 24, borderWidth: 1, borderColor: '#333' },
  compareSelectorRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  compareSelectorCol: { flex: 1 },
  compareColLabel: { color: '#888', fontSize: 11, marginBottom: 6 },
  selectorDisplayBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  selectorArrow: { padding: 4 },
  selectorText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  compLoader: { height: 150, alignItems: 'center', justifyContent: 'center' },
  compCard: { gap: 14, marginTop: 4 },
  compItem: { },
  compHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  compItemTitle: { color: '#DDD', fontSize: 13, fontWeight: 'bold' },
  compChangeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  compChangeText: { fontSize: 10, fontWeight: 'bold' },
  compBarContainer: { gap: 6 },
  compBarRow: { flexDirection: 'row', alignItems: 'center' },
  compPeriodLabel: { color: '#888', fontSize: 10, width: 60 },
  compBarBg: { flex: 1, height: 8, backgroundColor: '#222', borderRadius: 4, overflow: 'hidden', marginRight: 12 },
  compBarFill: { height: '100%', borderRadius: 4 },
  compValueText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', width: 85, textAlign: 'right' },
  compDivider: { height: 1, backgroundColor: '#2E2E2E' },
  compAdviceBox: { flexDirection: 'row', backgroundColor: '#111', padding: 12, borderRadius: 8, marginTop: 6, borderWidth: 1, borderColor: '#2E2E2E' },
  compAdviceText: { color: '#DDD', fontSize: 11, flex: 1, lineHeight: 16 },
  
  // Comparador - Gráfico
  compChartWrapper: { marginTop: 10, alignItems: 'center' },
  compChartTitle: { color: '#DDD', fontSize: 12, fontWeight: 'bold', marginBottom: 8, alignSelf: 'flex-start' },

  assetsDashboardCard: { backgroundColor: '#1A1A1A', padding: 20, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#333' },
  assetsDashboardTitle: { color: '#A0A0A0', fontSize: 11, fontWeight: 'bold', marginBottom: 12, letterSpacing: 1 },
  assetsDashboardGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  assetsDashboardCol: { flex: 1 },
  assetsDashboardLabel: { color: '#888', fontSize: 11, marginBottom: 4 },
  assetsDashboardValue: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  assetsDashboardGoalSection: { borderTopWidth: 1, borderTopColor: '#2A2A2A', paddingTop: 12 },
  assetsDashboardGoalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  assetsDashboardGoalText: { color: '#AAA', fontSize: 11 },
  assetsDashboardGoalPct: { color: '#00D09E', fontSize: 12, fontWeight: 'bold' },
  assetsDashboardGoalBarBg: { height: 6, backgroundColor: '#2E2E2E', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  assetsDashboardGoalBarFill: { height: '100%', backgroundColor: '#00D09E', borderRadius: 3 },
  assetsDashboardGoalSubtext: { color: '#666', fontSize: 10, textAlign: 'right' },

  chartTotalSumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingHorizontal: 4 },
  chartTotalSumLabel: { color: '#888', fontSize: 12 },
  chartTotalSumBadge: { backgroundColor: 'rgba(0, 208, 158, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  chartTotalSumValue: { color: '#00D09E', fontSize: 12, fontWeight: 'bold' },

  // Estilos de la campana y modal de alertas
  notificationBell: {
    padding: 8,
    position: 'relative',
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center'
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF4C4C',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  bellBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#151515',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2E2E2E'
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  },
  modalCloseButton: {
    padding: 8
  },
  modalBody: {
    padding: 16
  },
  overdueAlertTitle: {
    color: '#FF4C4C',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8
  },
  overdueAlertSubtitle: {
    color: '#AAA',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18
  },
  alertCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 76, 76, 0.3)'
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  alertCreditLineName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold'
  },
  alertAmount: {
    color: '#FF4C4C',
    fontSize: 14,
    fontWeight: 'bold'
  },
  alertDescription: {
    color: '#888',
    fontSize: 12,
    marginBottom: 10
  },
  alertFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  alertDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 76, 76, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  alertDateText: {
    color: '#FF4C4C',
    fontSize: 10,
    fontWeight: 'bold'
  },
  alertStatusText: {
    color: '#FF4C4C',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5
  },
  emptyAlertsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40
  },
  emptyAlertsTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12
  },
  emptyAlertsText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6
  }
});
