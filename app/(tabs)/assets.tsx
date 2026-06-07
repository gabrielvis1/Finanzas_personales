import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, Dimensions, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { FontAwesome } from '@expo/vector-icons';
import { PieChart } from 'react-native-chart-kit';

type Asset = {
  id: string;
  name: string;
  symbol: string;
  type: string; // 'crypto', 'stock', 'fiat', 'other'
  quantity: number;
  average_buy_price: number;
  current_price?: number;
  is_autoprestamo?: boolean;
  is_mercado_pago?: boolean;
};

const DEFAULT_GOAL = 248602903.00;
const screenWidth = Dimensions.get('window').width;
const chartWidth = screenWidth - 48;

export default function AssetsScreen() {
  const { session } = useAuth();
  
  // Estados de carga y datos
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Tipo de cambio Dólar CCL y Meta de Inversión
  const [exchangeRate, setExchangeRate] = useState(1350); 
  const [investmentGoal, setInvestmentGoal] = useState(DEFAULT_GOAL);
  const [totalDebts, setTotalDebts] = useState(0);

  // Estados de Formularios (Modal de Carga y Edición)
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  
  const [formName, setFormName] = useState('');
  const [formSymbol, setFormSymbol] = useState('');
  const [formType, setFormType] = useState('stock'); // 'stock', 'crypto', 'fiat', 'other'
  const [formQuantity, setFormQuantity] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formInvestedCapital, setFormInvestedCapital] = useState(''); // Para fiat/cash manual
  
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  // Identificadores de tipos de activos
  const isUSDAsset = useCallback((symbol: string, name: string) => {
    const sym = symbol.toUpperCase().trim();
    const n = name.toLowerCase().trim();
    return (
      sym === 'BTC' ||
      sym === 'ETH' ||
      sym === 'BNB' ||
      sym === 'USDT' ||
      sym === 'SOL' ||
      sym === 'SIMPLESTATE' ||
      sym.includes('USD') ||
      n.includes('dolar') ||
      n.includes('crypto')
    );
  }, []);

  const isCryptoSymbol = (symbol: string): boolean => {
    return ['BTC', 'ETH', 'BNB', 'USDT', 'SOL'].includes(symbol.toUpperCase().trim());
  };

  const isStockSymbol = (symbol: string): boolean => {
    return [
      'MMM', 'T', 'AAPL', 'CVX', 'KO', 'CL', 'QQQ', 'SPY', 'XOM', 'JNJ', 'MCD', 'MSFT', 'PEP', 'PFE', 'PG', 'SBUX', 'STBUX', 'UL', 'VZ', 'WMT'
    ].includes(symbol.toUpperCase().trim());
  };

  // Carga inicial y configuraciones
  useEffect(() => {
    if (session?.user?.id) {
      loadSettings();
      loadData();
    }
  }, [session]);

  const loadSettings = async () => {
    try {
      const savedGoal = await AsyncStorage.getItem('finiax_investment_goal');
      if (savedGoal) {
        setInvestmentGoal(Number(savedGoal));
      }
    } catch (e) {
      console.warn('Error al cargar la meta desde almacenamiento local:', e);
    }
  };

  const handleSaveGoal = async () => {
    const numericGoal = Number(goalInput);
    if (isNaN(numericGoal) || numericGoal <= 0) {
      Alert.alert('Error', 'Ingrese una meta numérica válida');
      return;
    }
    try {
      setInvestmentGoal(numericGoal);
      await AsyncStorage.setItem('finiax_investment_goal', String(numericGoal));
      setIsEditingGoal(false);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la meta');
    }
  };

  // Buscador de precios de CEDEARs en Yahoo Finance (BCBA) con CORS Proxy fallback
  const fetchStockPrice = async (symbol: string): Promise<number | null> => {
    let querySym = symbol.toUpperCase().trim();
    if (querySym === 'S&P500' || querySym === 'SP500') {
      querySym = 'SPY';
    }
    if (querySym === 'STBUX') {
      querySym = 'SBUX';
    }
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${querySym}.BA`;
    
    // Intento 1: Fetch directo (por ejemplo en móvil o Node)
    try {
      const res = await fetch(targetUrl);
      const data = await res.json();
      if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
        return Number(data.chart.result[0].meta.regularMarketPrice);
      }
    } catch (e) {
      // Intento 2: Fallback por proxy CORS para navegadores web
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        const data = await res.json();
        if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
          return Number(data.chart.result[0].meta.regularMarketPrice);
        }
      } catch (proxyError) {
        console.warn(`No se pudo obtener el precio de la acción ${symbol}:`, proxyError);
      }
    }
    return null;
  };

  // Buscador de precios Crypto
  const fetchCryptoPrices = async (symbols: string[]): Promise<Record<string, number>> => {
    if (!symbols.length) return {};
    try {
      const symList = symbols.map(s => s.toUpperCase()).join(',');
      const res = await fetch(`https://min-api.cryptocompare.com/data/pricemulti?fsyms=${symList}&tsyms=USD`);
      const data = await res.json();
      const prices: Record<string, number> = {};
      symbols.forEach(sym => {
        const upperSym = sym.toUpperCase();
        if (data[upperSym] && data[upperSym].USD) {
          prices[sym.toLowerCase()] = Number(data[upperSym].USD);
        }
      });
      return prices;
    } catch (e) {
      console.warn('Error al obtener precios de criptomonedas:', e);
      return {};
    }
  };

  // Buscador de Tipo de Cambio Dólar CCL
  const fetchExchangeRate = async () => {
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/ccl');
      const data = await res.json();
      if (data && data.venta) {
        setExchangeRate(Number(data.venta));
      }
    } catch (e) {
      console.warn('Error obteniendo dólar CCL, usando fallback 1350:', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await fetchExchangeRate();
    
    try {
      // 1. Cargar activos desde Supabase
      const { data: assetsData, error: assetsError } = await supabase
        .from('assets')
        .select('*')
        .eq('user_id', session!.user.id);
      
      if (assetsError) throw assetsError;

      // 2. Cargar todas las cuotas de deudas pendientes
      const { data: debtsData, error: debtsError } = await supabase
        .from('debt_installments')
        .select('amount, status, credit_lines(name, type)')
        .eq('user_id', session!.user.id)
        .eq('status', 'pending');

      if (debtsError) throw debtsError;

      // Calcular sumas de deudas y autopréstamos pendientes
      let totalDebtsSum = 0;
      let totalAutoprestamos = 0;

      debtsData?.forEach(d => {
        const amt = Number(d.amount);
        totalDebtsSum += amt;

        const clObj = Array.isArray(d.credit_lines) ? d.credit_lines[0] : d.credit_lines;
        const clName = (clObj?.name || '').toLowerCase();
        if (clName.includes('autoprestamo') || clName.includes('autopréstamo') || clName.includes('prestamos personales') || clName.includes('préstamos personales')) {
          totalAutoprestamos += amt;
        }
      });

      setTotalDebts(totalDebtsSum);

      const items: Asset[] = assetsData || [];

      // Extraer símbolos para buscar precios
      const cryptoSymbols = items.filter(a => a.type === 'crypto' || isCryptoSymbol(a.symbol)).map(a => a.symbol);
      const stockSymbols = items.filter(a => a.type === 'stock' || isStockSymbol(a.symbol)).map(a => a.symbol);

      // Fetch paralelo de precios
      const [cryptosMap, stocksPricesList] = await Promise.all([
        fetchCryptoPrices(cryptoSymbols),
        Promise.all(stockSymbols.map(async sym => {
          const price = await fetchStockPrice(sym);
          return { symbol: sym, price };
        }))
      ]);

      const stocksMap = stocksPricesList.reduce((acc, item) => {
        if (item.price !== null) {
          acc[item.symbol.toLowerCase()] = item.price;
        }
        return acc;
      }, {} as Record<string, number>);

      // Enriquecer activos con precios en vivo y lógica cruzada de autopréstamos y mercado pago
      const enriched = items.map(item => {
        const sym = item.symbol.toUpperCase().trim();
        const n = item.name.toLowerCase().trim();

        // CASO: Autopréstamos (SKU Prestamos personales)
        if (sym === 'PRESTAMOS PERSONALES' || n.includes('autoprestamo') || n.includes('autopréstamo') || n.includes('prestamos personales')) {
          return {
            ...item,
            quantity: 1,
            average_buy_price: totalAutoprestamos,
            current_price: totalAutoprestamos,
            is_autoprestamo: true
          };
        }

        // CASO: Mercado Pago (Deducción automática de autopréstamos)
        if (sym === 'MERCADO PAGO' || n.includes('mercado pago')) {
          const baseInvested = item.quantity * item.average_buy_price;
          const baseCurrent = item.quantity; // Cantidad representa el saldo actual base

          // Descontamos las deudas de autopréstamos de ambos saldos (actual e invertido) para no alterar la diferencia neta de MP
          const displayedCurrent = Math.max(0, baseCurrent - totalAutoprestamos);
          const displayedInvested = Math.max(0, baseInvested - totalAutoprestamos);

          return {
            ...item,
            quantity: 1,
            average_buy_price: displayedInvested,
            current_price: displayedCurrent,
            is_mercado_pago: true
          };
        }

        // CASO: Criptomonedas (Precios en vivo en USD)
        if (item.type === 'crypto' || isCryptoSymbol(sym)) {
          const livePrice = cryptosMap[item.symbol.toLowerCase()] || item.average_buy_price;
          return {
            ...item,
            current_price: livePrice
          };
        }

        // CASO: Acciones (Precios en vivo en ARS)
        if (item.type === 'stock' || isStockSymbol(sym)) {
          const livePrice = stocksMap[item.symbol.toLowerCase()] || item.average_buy_price;
          return {
            ...item,
            current_price: livePrice
          };
        }

        // CASO GENERAL: Activos manuales o fijos (Uala, Cocos, IOL, Plazos fijos)
        // El saldo actual se almacena en `quantity` y el invertido en `quantity * average_buy_price`
        if (item.type === 'fiat' || item.type === 'other') {
          return {
            ...item,
            current_price: 1.0 // Cotización fija $1
          };
        }

        return {
          ...item,
          current_price: item.average_buy_price
        };
      });

      setAssets(enriched);
    } catch (e: any) {
      Alert.alert('Error', 'No se pudieron cargar los activos: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingAsset(null);
    setFormName('');
    setFormSymbol('');
    setFormType('stock');
    setFormQuantity('');
    setFormPrice('');
    setFormInvestedCapital('');
    setIsModalVisible(true);
  };

  const handleOpenEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setFormName(asset.name);
    setFormSymbol(asset.symbol);
    setFormType(asset.type);
    
    if (asset.type === 'fiat' || asset.type === 'other') {
      // Reconstruir capital invertido
      const currentVal = asset.quantity;
      const investedVal = asset.quantity * asset.average_buy_price;
      setFormQuantity(String(currentVal));
      setFormInvestedCapital(String(investedVal));
    } else {
      setFormQuantity(String(asset.quantity));
      setFormPrice(String(asset.average_buy_price));
    }
    
    setIsModalVisible(true);
  };

  const handleSaveAsset = async () => {
    if (!formName || !formSymbol || !formQuantity) {
      Alert.alert('Error', 'Complete los campos obligatorios');
      return;
    }

    const qty = Number(formQuantity);
    if (isNaN(qty) || qty < 0) {
      Alert.alert('Error', 'Cantidad inválida');
      return;
    }

    let avgPrice = 0;
    if (formType === 'fiat' || formType === 'other') {
      const invested = Number(formInvestedCapital || formQuantity);
      if (isNaN(invested) || invested < 0) {
        Alert.alert('Error', 'Capital invertido inválido');
        return;
      }
      // FÓRMULA MÁGICA: Guardamos cantidad = saldo actual y average_buy_price = relación invertido/actual
      avgPrice = qty > 0 ? (invested / qty) : 1;
    } else {
      avgPrice = Number(formPrice || 0);
      if (isNaN(avgPrice) || avgPrice < 0) {
        Alert.alert('Error', 'Precio de compra inválido');
        return;
      }
    }

    try {
      if (editingAsset) {
        // ACTUALIZAR ACTIVO EXISTENTE
        const { error } = await supabase
          .from('assets')
          .update({
            name: formName,
            symbol: formSymbol.toUpperCase().trim(),
            type: formType,
            quantity: qty,
            average_buy_price: avgPrice
          })
          .eq('id', editingAsset.id);

        if (error) throw error;
        Alert.alert('Éxito', 'Activo actualizado correctamente');
      } else {
        // AÑADIR NUEVO ACTIVO
        const { error } = await supabase
          .from('assets')
          .insert({
            user_id: session!.user.id,
            name: formName,
            symbol: formSymbol.toUpperCase().trim(),
            type: formType,
            quantity: qty,
            average_buy_price: avgPrice
          });

        if (error) throw error;
        Alert.alert('Éxito', 'Activo añadido correctamente');
      }

      setIsModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo guardar el activo: ' + e.message);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    Alert.alert(
      'Confirmar eliminación',
      '¿Está seguro de que desea eliminar este activo de su portafolio?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('assets')
                .delete()
                .eq('id', id);

              if (error) throw error;
              setIsModalVisible(false);
              loadData();
            } catch (e: any) {
              Alert.alert('Error', 'No se pudo eliminar el activo');
            }
          }
        }
      ]
    );
  };

  // CÁLCULOS GENERALES DE VALORIZACIÓN
  let totalPesos = 0;
  let totalDollars = 0;
  
  // Agrupar activos en Pesos y Dólares
  const pesosAssetsList: any[] = [];
  const dollarsAssetsList: any[] = [];

  assets.forEach(asset => {
    const isUSD = isUSDAsset(asset.symbol, asset.name);
    
    // Valor invertido y actual
    let investedVal = 0;
    let currentVal = 0;

    if (asset.type === 'fiat' || asset.type === 'other') {
      currentVal = asset.current_price === 1.0 ? asset.quantity : (asset.quantity * (asset.current_price || 0));
      investedVal = asset.quantity * asset.average_buy_price;
    } else {
      currentVal = asset.quantity * (asset.current_price || asset.average_buy_price);
      investedVal = asset.quantity * asset.average_buy_price;
    }

    if (asset.is_mercado_pago) {
      // Ajustar valor de MP
      currentVal = asset.current_price || 0;
      investedVal = asset.average_buy_price;
    }

    const profitVal = currentVal - investedVal;
    const profitPct = investedVal > 0 ? (profitVal / investedVal) * 100 : 0;
    const unitPrice = asset.quantity > 0 ? (currentVal / asset.quantity) : 0;

    const mapped = {
      ...asset,
      currentValue: currentVal,
      investedValue: investedVal,
      profit: profitVal,
      profitPercentage: profitPct,
      unitPrice: unitPrice
    };

    if (isUSD) {
      totalDollars += currentVal;
      dollarsAssetsList.push(mapped);
    } else {
      totalPesos += currentVal;
      pesosAssetsList.push(mapped);
    }
  });

  // Capital Propiedades (Suma de Simplestate y activos de tipo 'other' en pesos convertidos a pesos)
  let propertiesValuePesos = 0;
  assets.forEach(asset => {
    const isUSD = isUSDAsset(asset.symbol, asset.name);
    const value = asset.type === 'fiat' || asset.type === 'other' ? asset.quantity : (asset.quantity * (asset.current_price || asset.average_buy_price));
    
    if (asset.symbol.toUpperCase() === 'SIMPLESTATE' || asset.type === 'other') {
      if (isUSD) {
        propertiesValuePesos += value * exchangeRate;
      } else {
        propertiesValuePesos += value;
      }
    }
  });

  // Totales Integrales (Equivalentes en Pesos y USD)
  const usdEquivalentePesos = totalDollars * exchangeRate; // Equivalente en pesos de activos en dólares
  const patrimonioNetoPesos = totalPesos + usdEquivalentePesos - totalDebts; // Patrimonio Neto en Pesos (Activos Pesos + Activos Dólares a Pesos - Deudas)
  const patrimonioNetoUSD = exchangeRate > 0 ? (patrimonioNetoPesos / exchangeRate) : 0;
  const activosTotalesPesos = totalPesos + usdEquivalentePesos;

  // Faltante a la Meta de Inversión
  const missingToGoal = Math.max(0, investmentGoal - patrimonioNetoPesos);
  const goalProgress = investmentGoal > 0 ? Math.min(100, (patrimonioNetoPesos / investmentGoal) * 100) : 0;

  // RENDERIZADOR DE CHART DATA
  // 1. Capital Neto
  const netCapitalData = [
    {
      name: 'Propiedades',
      amount: propertiesValuePesos,
      color: '#3498DB',
      legendFontColor: '#A0A0A0',
      legendFontSize: 11
    },
    {
      name: 'Activos Líquidos',
      amount: Math.max(0, activosTotalesPesos - propertiesValuePesos),
      color: '#00D09E',
      legendFontColor: '#A0A0A0',
      legendFontSize: 11
    },
    {
      name: 'Deuda',
      amount: totalDebts,
      color: '#FF4C4C',
      legendFontColor: '#A0A0A0',
      legendFontSize: 11
    }
  ];

  // 2. Activos en Pesos Chart Data
  const chartColors = ['#FF4C4C', '#00D09E', '#FFD700', '#4BC0C0', '#9966FF', '#FF9F40', '#E53935', '#8E24AA', '#3949AB'];
  const pesosChartData = pesosAssetsList.map((asset, index) => ({
    name: asset.symbol,
    amount: asset.currentValue,
    color: chartColors[index % chartColors.length],
    legendFontColor: '#A0A0A0',
    legendFontSize: 11
  })).sort((a, b) => b.amount - a.amount).slice(0, 8); // top 8 para que quepa en pantalla

  // 3. Activos en Dólares Chart Data
  const dollarsChartData = dollarsAssetsList.map((asset, index) => ({
    name: asset.symbol,
    amount: asset.currentValue,
    color: chartColors[index % chartColors.length],
    legendFontColor: '#A0A0A0',
    legendFontSize: 11
  })).sort((a, b) => b.amount - a.amount).slice(0, 8);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [session]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#00D09E" size="large" />
        <Text style={{ color: '#888', marginTop: 12 }}>Consultando precios en vivo...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D09E" />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Portafolio de Inversiones</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenAddModal}>
          <FontAwesome name="plus" size={14} color="#000" />
          <Text style={styles.addBtnText}>Añadir</Text>
        </TouchableOpacity>
      </View>

      {/* TARJETAS DE PATRIMONIO NETO INTEGRAL */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>PATRIMONIO NETO TOTAL</Text>
        <Text style={styles.totalValue}>${formatCurrency(patrimonioNetoPesos)} ARS</Text>
        <Text style={styles.totalSubValue}>u$s {formatCurrency(patrimonioNetoUSD)} USD</Text>
        <View style={styles.cclBadge}>
          <Text style={styles.cclText}>Cotización Dólar CCL: ${formatCurrency(exchangeRate)}</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { borderLeftColor: '#00D09E', borderLeftWidth: 4 }]}>
          <Text style={styles.statLabel}>Activos Totales</Text>
          <Text style={styles.statValue}>${formatCurrency(activosTotalesPesos)}</Text>
          <Text style={styles.statSubValue}>Pesos: ${formatCurrency(totalPesos)} | USD: u$s {formatCurrency(totalDollars)}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#FF4C4C', borderLeftWidth: 4 }]}>
          <Text style={styles.statLabel}>Deuda Pasiva</Text>
          <Text style={[styles.statValue, { color: '#FF4C4C' }]}>-${formatCurrency(totalDebts)}</Text>
          <Text style={styles.statSubValue}>Cuotas e intereses pendientes</Text>
        </View>
      </View>

      {/* SECCIÓN DE META DE INVERSIÓN */}
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle}>Meta / Objetivo Financiero</Text>
          {isEditingGoal ? (
            <View style={styles.editingGoalRow}>
              <TextInput 
                style={styles.goalInput}
                value={goalInput}
                onChangeText={setGoalInput}
                keyboardType="numeric"
                placeholder="Meta en Pesos"
                placeholderTextColor="#888"
              />
              <TouchableOpacity style={styles.goalSaveBtn} onPress={handleSaveGoal}>
                <FontAwesome name="check" size={12} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.goalSaveBtn, { backgroundColor: '#444' }]} onPress={() => setIsEditingGoal(false)}>
                <FontAwesome name="times" size={12} color="#FFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.editGoalBtn} 
              onPress={() => {
                setGoalInput(String(investmentGoal));
                setIsEditingGoal(true);
              }}
            >
              <Text style={styles.goalValueText}>Meta: ${formatCurrency(investmentGoal)}</Text>
              <FontAwesome name="pencil" size={12} color="#FFD700" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
        </View>

        {/* Barra de Progreso de la Meta */}
        <View style={styles.goalProgressSection}>
          <View style={styles.goalProgressLabels}>
            <Text style={styles.goalProgressText}>Progreso a Meta</Text>
            <Text style={styles.goalProgressPct}>{formatNumber(goalProgress, 2)}%</Text>
          </View>
          <View style={styles.goalProgressBarBg}>
            <View style={[styles.goalProgressBarFill, { width: `${goalProgress}%` }]} />
          </View>
          <View style={styles.missingBox}>
            <Text style={styles.missingText}>Faltante para alcanzar meta:</Text>
            <Text style={styles.missingValue}>${formatCurrency(missingToGoal)} ARS</Text>
          </View>
        </View>
      </View>

      {/* SECCIÓN DE GRÁFICOS DE RENDIMIENTO */}
      <View style={styles.chartsCard}>
        <Text style={styles.sectionTitle}>Distribución y Rendimiento de Inversiones</Text>
        
        {/* Gráfico 1: Capital Neto */}
        <View style={styles.chartBlock}>
          <Text style={styles.chartTitle}>Composición de Capital Neto</Text>
          <PieChart
            data={netCapitalData}
            width={chartWidth - 16}
            height={160}
            chartConfig={{ color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})` }}
            accessor={"amount"}
            backgroundColor={"transparent"}
            paddingLeft={"0"}
            center={[chartWidth / 6, 0]}
            hasLegend={true}
          />
        </View>

        {/* Gráfico 2: Activos en Pesos */}
        {pesosChartData.length > 0 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>Distribución de Activos en Pesos</Text>
            <PieChart
              data={pesosChartData}
              width={chartWidth - 16}
              height={160}
              chartConfig={{ color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})` }}
              accessor={"amount"}
              backgroundColor={"transparent"}
              paddingLeft={"0"}
              center={[chartWidth / 6, 0]}
              hasLegend={true}
            />
          </View>
        )}

        {/* Gráfico 3: Activos en Dólares */}
        {dollarsChartData.length > 0 && (
          <View style={styles.chartBlock}>
            <Text style={styles.chartTitle}>Distribución de Activos en Dólares</Text>
            <PieChart
              data={dollarsChartData}
              width={chartWidth - 16}
              height={160}
              chartConfig={{ color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})` }}
              accessor={"amount"}
              backgroundColor={"transparent"}
              paddingLeft={"0"}
              center={[chartWidth / 6, 0]}
              hasLegend={true}
            />
          </View>
        )}
      </View>

      {/* LISTADO DE ACTIVOS EN PESOS */}
      <Text style={styles.tableSectionTitle}>Activos en Pesos (ARS)</Text>
      {pesosAssetsList.length > 0 ? (
        <View style={styles.assetsList}>
          {pesosAssetsList.map((asset) => {
            const isPositive = asset.profit >= 0;
            return (
              <TouchableOpacity key={asset.id} style={styles.assetItemCard} onPress={() => handleOpenEditModal(asset)}>
                <View style={styles.assetItemHeader}>
                  <View style={styles.assetItemLeft}>
                    <View style={[styles.assetIconBox, { backgroundColor: asset.is_autoprestamo ? 'rgba(255, 215, 0, 0.1)' : 'rgba(0, 208, 158, 0.1)' }]}>
                      <FontAwesome 
                        name={asset.is_autoprestamo ? 'bank' : (asset.type === 'stock' ? 'line-chart' : 'money')} 
                        size={14} 
                        color={asset.is_autoprestamo ? '#FFD700' : '#00D09E'} 
                      />
                    </View>
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={styles.assetItemSymbol} numberOfLines={1}>{asset.symbol}</Text>
                      <Text style={styles.assetItemName} numberOfLines={1}>{asset.name}</Text>
                    </View>
                  </View>
                  <View style={styles.assetItemRight}>
                    <Text style={styles.assetItemValue}>${formatCurrency(asset.currentValue)}</Text>
                    <Text style={styles.assetItemUnitPrice}>Cant: {formatNumber(asset.quantity, 2)} | u: ${formatCurrency(asset.unitPrice)}</Text>
                  </View>
                </View>
                
                {/* Diferencia / Rendimiento */}
                <View style={styles.assetItemFooter}>
                  <Text style={styles.investedLabel}>Invertido: ${formatCurrency(asset.investedValue)}</Text>
                  <View style={[styles.profitBadge, { backgroundColor: isPositive ? 'rgba(0, 208, 158, 0.15)' : 'rgba(255, 76, 76, 0.15)' }]}>
                    <FontAwesome name={isPositive ? 'caret-up' : 'caret-down'} size={10} color={isPositive ? '#00D09E' : '#FF4C4C'} />
                    <Text style={[styles.profitTextValue, { color: isPositive ? '#00D09E' : '#FF4C4C' }]}>
                      {isPositive ? '+' : ''}${formatCurrency(asset.profit)} ({formatNumber(asset.profitPercentage, 2)}%)
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={{ color: '#888', fontStyle: 'italic' }}>No tienes activos en pesos registrados.</Text>
        </View>
      )}

      {/* LISTADO DE ACTIVOS EN DÓLARES */}
      <Text style={styles.tableSectionTitle}>Activos en Dólares (USD)</Text>
      {dollarsAssetsList.length > 0 ? (
        <View style={styles.assetsList}>
          {dollarsAssetsList.map((asset) => {
            const isPositive = asset.profit >= 0;
            return (
              <TouchableOpacity key={asset.id} style={styles.assetItemCard} onPress={() => handleOpenEditModal(asset)}>
                <View style={styles.assetItemHeader}>
                  <View style={styles.assetItemLeft}>
                    <View style={[styles.assetIconBox, { backgroundColor: 'rgba(52, 152, 219, 0.1)' }]}>
                      <FontAwesome 
                        name={asset.type === 'crypto' ? 'bitcoin' : 'globe'} 
                        size={14} 
                        color="#3498DB" 
                      />
                    </View>
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={styles.assetItemSymbol} numberOfLines={1}>{asset.symbol}</Text>
                      <Text style={styles.assetItemName} numberOfLines={1}>{asset.name}</Text>
                    </View>
                  </View>
                  <View style={styles.assetItemRight}>
                    <Text style={styles.assetItemValue}>u$s {formatCurrency(asset.currentValue)}</Text>
                    <Text style={styles.assetItemUnitPrice}>Cant: {formatNumber(asset.quantity, 6)} | u: u$s {formatCurrency(asset.unitPrice)}</Text>
                  </View>
                </View>
                
                {/* Diferencia / Rendimiento */}
                <View style={styles.assetItemFooter}>
                  <Text style={styles.investedLabel}>Invertido: u$s {formatCurrency(asset.investedValue)}</Text>
                  <View style={[styles.profitBadge, { backgroundColor: isPositive ? 'rgba(0, 208, 158, 0.15)' : 'rgba(255, 76, 76, 0.15)' }]}>
                    <FontAwesome name={isPositive ? 'caret-up' : 'caret-down'} size={10} color={isPositive ? '#00D09E' : '#FF4C4C'} />
                    <Text style={[styles.profitTextValue, { color: isPositive ? '#00D09E' : '#FF4C4C' }]}>
                      {isPositive ? '+' : ''}u$s {formatCurrency(asset.profit)} ({formatNumber(asset.profitPercentage, 2)}%)
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={{ color: '#888', fontStyle: 'italic' }}>No tienes activos en dólares registrados.</Text>
        </View>
      )}

      {/* FORMULARIO DE CARGA / EDICIÓN EN MODAL POPUP */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingAsset ? 'Editar Activo' : 'Nuevo Activo'}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setIsModalVisible(false)}>
                <FontAwesome name="times" size={18} color="#AAA" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
              <Text style={styles.inputLabel}>Tipo de Activo</Text>
              <View style={styles.typeSelectorRow}>
                {['stock', 'crypto', 'fiat', 'other'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeSelectBtn, formType === t && styles.typeSelectBtnActive]}
                    onPress={() => setFormType(t)}
                  >
                    <Text style={[styles.typeSelectText, formType === t && styles.typeSelectTextActive]}>
                      {t === 'stock' ? 'Acción' : t === 'crypto' ? 'Crypto' : t === 'fiat' ? 'Fondo/Cash' : 'Otros'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Nombre Comercial</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="ej. Apple o Mercado Pago"
                placeholderTextColor="#666"
                value={formName}
                onChangeText={setFormName}
              />

              <Text style={styles.inputLabel}>Código / Símbolo (SKU)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="ej. AAPL, BTC, Mercado Pago"
                placeholderTextColor="#666"
                value={formSymbol}
                onChangeText={setFormSymbol}
              />

              {/* Mostrar campos diferentes si es Fondo/Cash Manual */}
              {formType === 'fiat' || formType === 'other' ? (
                <>
                  <Text style={styles.inputLabel}>Capital Invertido Original (Pesos/Dólares)</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="ej. 1230352.76"
                    placeholderTextColor="#666"
                    value={formInvestedCapital}
                    onChangeText={setFormInvestedCapital}
                    keyboardType="numeric"
                  />

                  <Text style={styles.inputLabel}>Saldo / Valor Actual del Fondo</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="ej. 1231524.54"
                    placeholderTextColor="#666"
                    value={formQuantity}
                    onChangeText={setFormQuantity}
                    keyboardType="numeric"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>Cantidad / Unidades</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="ej. 7.00 o 0.00176972"
                    placeholderTextColor="#666"
                    value={formQuantity}
                    onChangeText={setFormQuantity}
                    keyboardType="numeric"
                  />

                  <Text style={styles.inputLabel}>Precio de Compra Promedio (USD para crypto, ARS para acciones)</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="ej. 23279.65"
                    placeholderTextColor="#666"
                    value={formPrice}
                    onChangeText={setFormPrice}
                    keyboardType="numeric"
                  />
                </>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAsset}>
                <Text style={styles.saveBtnText}>{editingAsset ? 'Actualizar Activo' : 'Guardar Activo'}</Text>
              </TouchableOpacity>

              {editingAsset && (
                <TouchableOpacity 
                  style={[styles.saveBtn, { backgroundColor: '#FF4C4C', marginTop: 8 }]} 
                  onPress={() => handleDeleteAsset(editingAsset.id)}
                >
                  <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Eliminar Activo</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24 },
  centered: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#FFF' },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00D09E', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6 },
  addBtnText: { color: '#000', fontSize: 13, fontWeight: 'bold' },

  // Tarjeta Patrimonio
  totalCard: { backgroundColor: '#1A1A1A', padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  totalLabel: { color: '#888', fontSize: 13, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8 },
  totalValue: { color: '#00D09E', fontSize: 28, fontWeight: 'bold', textShadowColor: 'rgba(0, 208, 158, 0.2)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  totalSubValue: { color: '#AAA', fontSize: 16, marginTop: 4 },
  cclBadge: { backgroundColor: 'rgba(255, 255, 255, 0.05)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginTop: 12 },
  cclText: { color: '#888', fontSize: 11 },

  // Estadísticas
  statsContainer: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#1A1A1A', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2E2E2E' },
  statLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  statValue: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  statSubValue: { color: '#555', fontSize: 10, marginTop: 4 },

  // Meta de Inversión
  goalCard: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  goalTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  editGoalBtn: { flexDirection: 'row', alignItems: 'center' },
  goalValueText: { color: '#FFD700', fontSize: 14, fontWeight: 'bold' },
  editingGoalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalInput: { backgroundColor: '#111', color: '#FFF', borderRadius: 6, borderWidth: 1, borderColor: '#444', paddingHorizontal: 8, paddingVertical: 4, width: 100, fontSize: 12 },
  goalSaveBtn: { backgroundColor: '#FFD700', width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  
  goalProgressSection: { },
  goalProgressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  goalProgressText: { color: '#888', fontSize: 11 },
  goalProgressPct: { color: '#FFD700', fontSize: 11, fontWeight: 'bold' },
  goalProgressBarBg: { height: 8, backgroundColor: '#222', borderRadius: 4, overflow: 'hidden' },
  goalProgressBarFill: { height: '100%', backgroundColor: '#FFD700', borderRadius: 4 },
  missingBox: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, backgroundColor: '#111', padding: 8, borderRadius: 8 },
  missingText: { color: '#666', fontSize: 11 },
  missingValue: { color: '#DDD', fontSize: 11, fontWeight: 'bold' },

  // Gráficos
  chartsCard: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#333' },
  sectionTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  chartBlock: { marginBottom: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#2E2E2E', paddingBottom: 16 },
  chartTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', alignSelf: 'flex-start', marginBottom: 10 },

  // Listados de activos
  tableSectionTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 12, marginTop: 8 },
  assetsList: { gap: 10 },
  assetItemCard: { backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#2E2E2E' },
  assetItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assetItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  assetIconBox: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  assetItemSymbol: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  assetItemName: { color: '#888', fontSize: 12, marginTop: 1 },
  assetItemRight: { alignItems: 'flex-end', marginLeft: 12 },
  assetItemValue: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  assetItemUnitPrice: { color: '#666', fontSize: 11, marginTop: 2 },
  
  assetItemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#222' },
  investedLabel: { color: '#888', fontSize: 11 },
  profitBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  profitTextValue: { fontSize: 11, fontWeight: 'bold' },

  emptyCard: { backgroundColor: '#1A1A1A', padding: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#222' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#333', maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  inputLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  modalInput: { backgroundColor: '#222', color: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#333', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  typeSelectorRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  typeSelectBtn: { flex: 1, backgroundColor: '#222', paddingVertical: 8, borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  typeSelectBtnActive: { backgroundColor: '#00D09E', borderColor: '#00D09E' },
  typeSelectText: { color: '#888', fontSize: 11 },
  typeSelectTextActive: { color: '#000', fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#00D09E', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
});
