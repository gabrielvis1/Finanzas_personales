import { formatCurrency, formatNumber } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { AssetService, Asset } from '@/lib/services/AssetService';
import { supabase } from '@/lib/supabase';

type DisplayCurrency = 'ARS' | 'USD' | 'EUR' | 'BRL' | 'BTC' | 'ETH';
type NativeCurrency = 'ARS' | 'USD' | 'EUR' | 'BRL';

const DISPLAY_CURRENCY_OPTIONS: { value: DisplayCurrency; label: string; symbol: string }[] = [
  { value: 'ARS', label: 'ARS (Pesos)', symbol: '$' },
  { value: 'USD', label: 'USD (Dólares)', symbol: 'u$s' },
  { value: 'EUR', label: 'EUR (Euros)', symbol: '€' },
  { value: 'BRL', label: 'BRL (Reales)', symbol: 'R$' },
  { value: 'BTC', label: 'BTC (Bitcoin)', symbol: '₿' },
  { value: 'ETH', label: 'ETH (Ethereum)', symbol: 'Ξ' },
];

const NATIVE_CURRENCY_OPTIONS: { value: NativeCurrency; label: string }[] = [
  { value: 'ARS', label: 'ARS ($)' },
  { value: 'USD', label: 'USD (u$s)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'BRL', label: 'BRL (R$)' },
];

const DEFAULT_GOAL = 248602903.00;
const screenWidth = Dimensions.get('window').width;
const chartWidth = screenWidth - 48;

export default function AssetsScreen() {
  const { session } = useAuth();

  // Estados de carga y datos
  const [assets, setAssets] = useState<Asset[]>([]);
  const [rawAssets, setRawAssets] = useState<Asset[]>([]); // Activos puros de Supabase (sin deducción de UI)
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de monedas y visualización
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('ARS');
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const [formCurrency, setFormCurrency] = useState<NativeCurrency>('ARS');
  const [showListView, setShowListView] = useState(true);

  // Metas con tipo de divisa
  const [goalCurrency, setGoalCurrency] = useState<NativeCurrency>('ARS');

  // Estados temporales para formulario de edición de la meta
  const [goalCurrencyInput, setGoalCurrencyInput] = useState<NativeCurrency>('ARS');

  // Tasas de cambio adicionales
  const [eurRate, setEurRate] = useState(1400); // Fallback EUR/ARS
  const [brlRate, setBrlRate] = useState(240);  // Fallback BRL/ARS
  const [btcUsdPrice, setBtcUsdPrice] = useState(65000); // Fallback BTC/USD
  const [ethUsdPrice, setEthUsdPrice] = useState(3500);  // Fallback ETH/USD

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

  const convertFromARS = useCallback((valueARS: number, target: DisplayCurrency): number => {
    if (target === 'ARS') return valueARS;
    
    // Todo lo convertimos a USD primero como pivot
    const valueUSD = exchangeRate > 0 ? (valueARS / exchangeRate) : 0;
    if (target === 'USD') return valueUSD;

    if (target === 'EUR') {
      const eurToArs = eurRate || (exchangeRate * 1.05); // Fallback EUR/ARS
      return eurToArs > 0 ? (valueARS / eurToArs) : 0;
    }
    if (target === 'BRL') {
      const brlToArs = brlRate || (exchangeRate * 0.18); // Fallback BRL/ARS
      return brlToArs > 0 ? (valueARS / brlToArs) : 0;
    }
    if (target === 'BTC') {
      return btcUsdPrice > 0 ? (valueUSD / btcUsdPrice) : 0;
    }
    if (target === 'ETH') {
      return ethUsdPrice > 0 ? (valueUSD / ethUsdPrice) : 0;
    }
    return valueARS;
  }, [exchangeRate, eurRate, brlRate, btcUsdPrice, ethUsdPrice]);

  const convertAsset = useCallback((asset: Asset) => {
    const nativeCur = AssetService.getAssetNativeCurrency(asset.symbol);
    
    let currentValueARS = 0;
    let investedValueARS = 0;

    if (asset.type === 'fiat' || asset.type === 'other') {
      const currentNative = asset.quantity;
      const investedNative = asset.quantity * asset.average_buy_price;

      // Convertir desde la moneda nativa a ARS
      if (nativeCur === 'ARS') {
        currentValueARS = currentNative;
        investedValueARS = investedNative;
      } else if (nativeCur === 'USD') {
        currentValueARS = currentNative * exchangeRate;
        investedValueARS = investedNative * exchangeRate;
      } else if (nativeCur === 'EUR') {
        currentValueARS = currentNative * eurRate;
        investedValueARS = investedNative * eurRate;
      } else if (nativeCur === 'BRL') {
        currentValueARS = currentNative * brlRate;
        investedValueARS = investedNative * brlRate;
      }
    } else {
      // Acciones/Crypto (almacenados ya en moneda correspondiente: crypto en USD, stocks en ARS)
      const isUSD = AssetService.isUSDAsset(asset.symbol, asset.name);
      const currentPrice = asset.current_price || asset.average_buy_price;
      
      if (isUSD) {
        currentValueARS = asset.quantity * currentPrice * exchangeRate;
        investedValueARS = asset.quantity * asset.average_buy_price * exchangeRate;
      } else {
        currentValueARS = asset.quantity * currentPrice;
        investedValueARS = asset.quantity * asset.average_buy_price;
      }
    }

    if (asset.is_mercado_pago) {
      currentValueARS = (asset.current_price || 0);
      investedValueARS = asset.average_buy_price;
    }

    return {
      currentValueARS,
      investedValueARS,
    };
  }, [exchangeRate, eurRate, brlRate]);

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
      const savedCurrency = await AsyncStorage.getItem('finiax_display_currency');
      if (savedCurrency) {
        setDisplayCurrency(savedCurrency as DisplayCurrency);
      }
      const savedGoalCurrency = await AsyncStorage.getItem('finiax_goal_currency');
      if (savedGoalCurrency) {
        setGoalCurrency(savedGoalCurrency as NativeCurrency);
      }
    } catch (e) {
      console.warn('Error al cargar la configuración desde almacenamiento local:', e);
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
      setGoalCurrency(goalCurrencyInput);
      
      await AsyncStorage.setItem('finiax_investment_goal', String(numericGoal));
      await AsyncStorage.setItem('finiax_goal_currency', goalCurrencyInput);
      
      setIsEditingGoal(false);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la meta');
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const liveRate = await AssetService.fetchExchangeRate();
      setExchangeRate(liveRate);
      
      const rates = await AssetService.fetchAdditionalRates();
      setEurRate(rates.eur);
      setBrlRate(rates.brl);
      setBtcUsdPrice(rates.btc);
      setEthUsdPrice(rates.eth);

      // 1. Cargar activos desde Supabase
      const assetsData = await AssetService.getAssets(session!.user.id);
      setRawAssets(assetsData);

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
      const cryptoSymbols = items.filter(a => a.type === 'crypto' || AssetService.isCryptoSymbol(a.symbol)).map(a => a.symbol);
      const stockSymbols = items.filter(a => a.type === 'stock' || AssetService.isStockSymbol(a.symbol)).map(a => a.symbol);

      // Fetch paralelo de precios
      const [cryptosMap, stocksPricesList] = await Promise.all([
        AssetService.fetchCryptoPrices(cryptoSymbols),
        Promise.all(stockSymbols.map(async sym => {
          const price = await AssetService.fetchStockPrice(sym);
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
            is_mercado_pago: true,
            base_quantity: baseCurrent,
            base_invested: baseInvested,
            autoprestamos_deducted: totalAutoprestamos
          };
        }

        // CASO: Criptomonedas (Precios en vivo en USD)
        if (item.type === 'crypto' || AssetService.isCryptoSymbol(sym)) {
          const livePrice = cryptosMap[item.symbol.toLowerCase()] || item.average_buy_price;
          return {
            ...item,
            current_price: livePrice
          };
        }

        // CASO: Acciones (Precios en vivo en ARS)
        if (item.type === 'stock' || AssetService.isStockSymbol(sym)) {
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
    setFormCurrency('ARS');
    setIsModalVisible(true);
  };

  const handleOpenEditModal = (asset: Asset) => {
    if (asset.is_autoprestamo) {
      Alert.alert('Información', 'Los autopréstamos se calculan automáticamente a partir de tus deudas pendientes y no se pueden editar manualmente.');
      return;
    }

    // Buscar el activo original en la lista pura para no usar valores modificados por UI (como quantity=1)
    const rawAsset = rawAssets.find(r => r.id === asset.id) || asset;

    setEditingAsset(rawAsset);
    setFormName(rawAsset.name);
    setFormSymbol(AssetService.getCleanSymbol(rawAsset.symbol));
    setFormType(rawAsset.type);

    const nativeCur = AssetService.getAssetNativeCurrency(rawAsset.symbol);
    setFormCurrency(nativeCur);

    if (rawAsset.type === 'fiat' || rawAsset.type === 'other') {
      // Reconstruir capital invertido real usando los valores puros de la base de datos
      const currentVal = rawAsset.quantity;
      const investedVal = rawAsset.quantity * rawAsset.average_buy_price;
      setFormQuantity(String(currentVal));
      setFormInvestedCapital(String(investedVal));
      setFormPrice('');
    } else {
      setFormQuantity(String(rawAsset.quantity));
      setFormPrice(String(rawAsset.average_buy_price));
      setFormInvestedCapital('');
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

    let finalSymbol = formSymbol.toUpperCase().trim();
    if ((formType === 'fiat' || formType === 'other') && formCurrency !== 'ARS') {
      finalSymbol = `${formCurrency}:${finalSymbol}`;
    }

    try {
      if (editingAsset) {
        // ACTUALIZAR ACTIVO EXISTENTE
        await AssetService.saveAsset(session!.user.id, {
          id: editingAsset.id,
          name: formName,
          symbol: finalSymbol,
          type: formType,
          quantity: qty,
          average_buy_price: avgPrice
        });
        Alert.alert('Éxito', 'Activo actualizado correctamente');
      } else {
        // AÑADIR NUEVO ACTIVO
        await AssetService.saveAsset(session!.user.id, {
          name: formName,
          symbol: finalSymbol,
          type: formType,
          quantity: qty,
          average_buy_price: avgPrice
        });
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
              await AssetService.deleteAsset(id);
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
  let totalARS_Current = 0;
  let totalARS_Invested = 0;

  // Agrupar activos en Pesos y Dólares
  const pesosAssetsList: any[] = [];
  const dollarsAssetsList: any[] = [];

  assets.forEach(asset => {
    const isUSD = AssetService.isUSDAsset(asset.symbol, asset.name);
    const { currentValueARS, investedValueARS } = convertAsset(asset);

    totalARS_Current += currentValueARS;
    totalARS_Invested += investedValueARS;

    const profitValARS = currentValueARS - investedValueARS;
    const profitPct = investedValueARS > 0 ? (profitValARS / investedValueARS) * 100 : 0;

    // Convertir montos individuales a la moneda de visualización seleccionada
    const dispCurrent = convertFromARS(currentValueARS, displayCurrency);
    const dispInvested = convertFromARS(investedValueARS, displayCurrency);
    const dispProfit = dispCurrent - dispInvested;
    const dispUnitPrice = asset.quantity > 0 ? (dispCurrent / asset.quantity) : 0;

    const mapped = {
      ...asset,
      currentValue: dispCurrent,
      investedValue: dispInvested,
      profit: dispProfit,
      profitPercentage: profitPct,
      unitPrice: dispUnitPrice,
      nativeCurrency: AssetService.getAssetNativeCurrency(asset.symbol),
      currentValueARS,
      investedValueARS
    };

    if (isUSD) {
      dollarsAssetsList.push(mapped);
    } else {
      pesosAssetsList.push(mapped);
    }
  });

  // Capital Propiedades (Suma de Simplestate y activos de tipo 'other' en pesos convertidos a pesos)
  let propertiesValueARS = 0;
  assets.forEach(asset => {
    const { currentValueARS } = convertAsset(asset);
    if (asset.symbol.toUpperCase() === 'SIMPLESTATE' || asset.type === 'other') {
      propertiesValueARS += currentValueARS;
    }
  });

  // Totales Integrales (Equivalentes en la divisa de visualización)
  const patrimonioNetoARS = totalARS_Current - totalDebts;
  const patrimonioNetoDisp = convertFromARS(patrimonioNetoARS, displayCurrency);
  const patrimonioNetoUSD = convertFromARS(patrimonioNetoARS, 'USD');
  const activosTotalesDisp = convertFromARS(totalARS_Current, displayCurrency);
  const deudasTotalesDisp = convertFromARS(totalDebts, displayCurrency);

  // Conversión de la meta a ARS según su moneda de configuración
  let investmentGoalARS = investmentGoal;
  if (goalCurrency === 'USD') investmentGoalARS = investmentGoal * exchangeRate;
  else if (goalCurrency === 'EUR') investmentGoalARS = investmentGoal * eurRate;
  else if (goalCurrency === 'BRL') investmentGoalARS = investmentGoal * brlRate;

  // Faltante a la Meta de Inversión (en la moneda de la meta)
  const patrimonioNetoInGoalCur = convertFromARS(patrimonioNetoARS, goalCurrency);
  const missingToGoalInGoalCur = Math.max(0, investmentGoal - patrimonioNetoInGoalCur);
  const goalProgress = investmentGoalARS > 0 ? Math.min(100, (patrimonioNetoARS / investmentGoalARS) * 100) : 0;

  // Rendimiento real del portafolio actual (calculado por el mercado)
  const totalProfitARS = totalARS_Current - totalARS_Invested;
  const portfolioReturnRate = totalARS_Invested > 0 ? (totalProfitARS / totalARS_Invested) * 100 : 0;

  // Interés Compuesto - Cálculo de tiempo
  let compoundInterestTimeText = '';
  if (patrimonioNetoARS >= investmentGoalARS) {
    compoundInterestTimeText = '¡Meta alcanzada!';
  } else if (patrimonioNetoARS <= 0) {
    compoundInterestTimeText = 'Patrimonio nulo o negativo';
  } else if (portfolioReturnRate <= 0) {
    compoundInterestTimeText = 'No es posible proyectar sin un rendimiento positivo en tu portafolio actual';
  } else {
    const years = Math.log(investmentGoalARS / patrimonioNetoARS) / Math.log(1 + portfolioReturnRate / 100);
    const wholeYears = Math.floor(years);
    const months = Math.round((years - wholeYears) * 12);
    
    if (wholeYears === 0) {
      compoundInterestTimeText = `${months} ${months === 1 ? 'mes' : 'meses'}`;
    } else if (months === 0) {
      compoundInterestTimeText = `${wholeYears} ${wholeYears === 1 ? 'año' : 'años'}`;
    } else {
      compoundInterestTimeText = `${wholeYears} ${wholeYears === 1 ? 'año' : 'años'} y ${months} ${months === 1 ? 'mes' : 'meses'}`;
    }
  }

  const propertiesValueDisp = convertFromARS(propertiesValueARS, displayCurrency);
  const liquidAssetsValueDisp = Math.max(0, activosTotalesDisp - propertiesValueDisp);

  // RENDERIZADOR DE CHART DATA
  // 1. Capital Neto (filtrando cantidades cero o negativas para evitar crashes en PieChart)
  const netCapitalData = [
    {
      name: 'Propiedades',
      amount: propertiesValueDisp,
      color: '#3498DB',
      legendFontColor: '#A0A0A0',
      legendFontSize: 11
    },
    {
      name: 'Activos Líquidos',
      amount: liquidAssetsValueDisp,
      color: '#00D09E',
      legendFontColor: '#A0A0A0',
      legendFontSize: 11
    },
    {
      name: 'Deuda',
      amount: deudasTotalesDisp,
      color: '#FF4C4C',
      legendFontColor: '#A0A0A0',
      legendFontSize: 11
    }
  ].filter(item => item.amount > 0);

  // 2. Activos en Pesos Chart Data
  const chartColors = ['#FF4C4C', '#00D09E', '#FFD700', '#4BC0C0', '#9966FF', '#FF9F40', '#E53935', '#8E24AA', '#3949AB'];
  const pesosChartData = pesosAssetsList
    .filter(asset => asset.currentValue > 0)
    .map((asset, index) => ({
      name: asset.symbol,
      amount: asset.currentValue,
      color: chartColors[index % chartColors.length],
      legendFontColor: '#A0A0A0',
      legendFontSize: 11
    })).sort((a, b) => b.amount - a.amount);

  // 3. Activos en Dólares Chart Data
  const dollarsChartData = dollarsAssetsList
    .filter(asset => asset.currentValue > 0)
    .map((asset, index) => ({
      name: asset.symbol,
      amount: asset.currentValue,
      color: chartColors[index % chartColors.length],
      legendFontColor: '#A0A0A0',
      legendFontSize: 11
    })).sort((a, b) => b.amount - a.amount);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [session]);

  const formatDisplayValue = (val: number, target: DisplayCurrency = displayCurrency) => {
    const option = DISPLAY_CURRENCY_OPTIONS.find(o => o.value === target);
    const symbol = option ? option.symbol : '$';
    
    // Si es crypto (BTC/ETH), mostrar más decimales
    if (target === 'BTC' || target === 'ETH') {
      return `${symbol} ${formatNumber(val, 6)}`;
    }
    
    return `${symbol} ${formatCurrency(val)}`;
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#00D09E" size="large" />
        <Text style={{ color: '#888', marginTop: 12 }}>Consultando precios en vivo...</Text>
      </View>
    );
  }

  // Calcular subtotales para la etiqueta informativa
  let totalARS_PesosOnly = 0;
  let totalARS_USDOnly = 0;
  assets.forEach(asset => {
    const { currentValueARS } = convertAsset(asset);
    if (AssetService.isUSDAsset(asset.symbol, asset.name)) {
      totalARS_USDOnly += currentValueARS;
    } else {
      totalARS_PesosOnly += currentValueARS;
    }
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D09E" />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Portafolio</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', zIndex: 10 }}>
          {/* Selector de divisa */}
          <View style={{ position: 'relative', zIndex: 20 }}>
            <TouchableOpacity 
              style={styles.currencyBtn} 
              onPress={() => setShowCurrencySelector(!showCurrencySelector)}
            >
              <FontAwesome name="money" size={13} color="#FFF" />
              <Text style={styles.currencyBtnText}>{displayCurrency}</Text>
              <FontAwesome name={showCurrencySelector ? "caret-up" : "caret-down"} size={10} color="#FFF" />
            </TouchableOpacity>
            
            {showCurrencySelector && (
              <View style={styles.currencyDropdown}>
                {DISPLAY_CURRENCY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.currencyOption,
                      displayCurrency === opt.value && styles.currencyOptionActive
                    ]}
                    onPress={async () => {
                      setDisplayCurrency(opt.value);
                      setShowCurrencySelector(false);
                      try {
                        await AsyncStorage.setItem('finiax_display_currency', opt.value);
                      } catch (e) {
                        console.warn(e);
                      }
                    }}
                  >
                    <Text style={[
                      styles.currencyOptionText,
                      displayCurrency === opt.value && styles.currencyOptionTextActive
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.addBtn} onPress={handleOpenAddModal}>
            <FontAwesome name="plus" size={14} color="#000" />
            <Text style={styles.addBtnText}>Añadir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* TARJETAS DE PATRIMONIO NETO INTEGRAL */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>PATRIMONIO NETO TOTAL</Text>
        <Text style={styles.totalValue}>{formatDisplayValue(patrimonioNetoDisp)}</Text>
        <Text style={styles.totalSubValue}>{formatDisplayValue(patrimonioNetoUSD, 'USD')}</Text>
        <View style={styles.cclBadge}>
          <Text style={styles.cclText}>Cotización Dólar CCL: ${formatCurrency(exchangeRate)}</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { borderLeftColor: '#00D09E', borderLeftWidth: 4 }]}>
          <Text style={styles.statLabel}>Activos Totales</Text>
          <Text style={styles.statValue}>{formatDisplayValue(activosTotalesDisp)}</Text>
          <Text style={styles.statSubValue}>ARS: ${formatCurrency(totalARS_PesosOnly)} | USD: u$s {formatCurrency(totalARS_USDOnly / exchangeRate)}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#FF4C4C', borderLeftWidth: 4 }]}>
          <Text style={styles.statLabel}>Deuda Pasiva</Text>
          <Text style={[styles.statValue, { color: '#FF4C4C' }]}>-{formatDisplayValue(deudasTotalesDisp)}</Text>
          <Text style={styles.statSubValue}>Cuotas e intereses pendientes</Text>
        </View>
      </View>

      {/* SECCIÓN DE META DE INVERSIÓN */}
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle}>Meta / Objetivo Financiero</Text>
          {!isEditingGoal && (
            <TouchableOpacity
              style={styles.editGoalBtn}
              onPress={() => {
                setGoalInput(String(investmentGoal));
                setGoalCurrencyInput(goalCurrency);
                setIsEditingGoal(true);
              }}
            >
              <FontAwesome name="pencil" size={12} color="#FFD700" style={{ marginRight: 6 }} />
              <Text style={styles.goalValueText}>Editar Meta</Text>
            </TouchableOpacity>
          )}
        </View>

        {isEditingGoal ? (
          <View style={{ gap: 10, marginTop: 4 }}>
            <Text style={styles.inputLabel}>Monto de la Meta</Text>
            <TextInput
              style={styles.modalInput}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="numeric"
              placeholder="Monto"
              placeholderTextColor="#888"
            />

            <Text style={styles.inputLabel}>Moneda de la Meta</Text>
            <View style={styles.typeSelectorRow}>
              {NATIVE_CURRENCY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.typeSelectBtn, goalCurrencyInput === opt.value && styles.typeSelectBtnActive]}
                  onPress={() => setGoalCurrencyInput(opt.value)}
                >
                  <Text style={[styles.typeSelectText, goalCurrencyInput === opt.value && styles.typeSelectTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, marginTop: 0 }]} onPress={handleSaveGoal}>
                <Text style={styles.saveBtnText}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: '#444', marginTop: 0 }]} onPress={() => setIsEditingGoal(false)}>
                <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.goalProgressSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: '#FFF', fontSize: 15, fontWeight: 'bold' }}>
                Meta: {formatDisplayValue(investmentGoal, goalCurrency)}
              </Text>
              <Text style={styles.goalProgressPct}>{formatNumber(goalProgress, 2)}%</Text>
            </View>
            <View style={styles.goalProgressBarBg}>
              <View style={[styles.goalProgressBarFill, { width: `${goalProgress}%` }]} />
            </View>
            <View style={[styles.missingBox, { marginTop: 12 }]}>
              <Text style={styles.missingText}>Faltante para alcanzar meta:</Text>
              <Text style={styles.missingValue}>{formatDisplayValue(missingToGoalInGoalCur, goalCurrency)}</Text>
            </View>

            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 10 }}>
              <Text style={{ color: '#888', fontSize: 11, lineHeight: 16 }}>
                <FontAwesome name="hourglass-half" size={10} color="#FFD700" /> Proyección sin aportes (Interés Compuesto al {formatNumber(portfolioReturnRate, 2)}% basado en tus activos):
              </Text>
              <Text style={{ color: '#FFF', fontSize: 13, fontWeight: 'bold', marginTop: 4 }}>
                {patrimonioNetoARS >= investmentGoalARS ? '¡Meta alcanzada!' : `${compoundInterestTimeText}`}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* SECCIÓN DE GRÁFICOS DE RENDIMIENTO */}
      <View style={styles.chartsCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Distribución y Rendimiento de Inversiones</Text>
          
          {/* Selector de tipo de visualización */}
          <View style={styles.viewToggleContainer}>
            <TouchableOpacity 
              style={[styles.viewToggleBtn, !showListView && styles.viewToggleBtnActive]} 
              onPress={() => setShowListView(false)}
            >
              <FontAwesome name="pie-chart" size={11} color={!showListView ? '#000' : '#888'} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.viewToggleBtn, showListView && styles.viewToggleBtnActive]} 
              onPress={() => setShowListView(true)}
            >
              <FontAwesome name="align-left" size={11} color={showListView ? '#000' : '#888'} />
            </TouchableOpacity>
          </View>
        </View>

        {showListView ? (
          /* Renderizado como Lista de Barras Horizontales Ordenada */
          <View style={{ gap: 16 }}>
            {/* Composición de Capital Neto */}
            <View>
              <Text style={styles.chartTitle}>Composición de Capital Neto</Text>
              {netCapitalData.map((item, idx) => {
                const total = netCapitalData.reduce((acc, c) => acc + c.amount, 0);
                const pct = total > 0 ? (item.amount / total) * 100 : 0;
                return (
                  <View key={idx} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#FFF', fontSize: 11 }}>{item.name}</Text>
                      <Text style={{ color: '#888', fontSize: 11 }}>{formatDisplayValue(item.amount)} ({pct.toFixed(1)}%)</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: item.color, borderRadius: 3 }} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Distribución de Activos en Pesos (Completo sin esconder ninguno) */}
            {pesosAssetsList.length > 0 && (
              <View style={{ borderTopWidth: 1, borderTopColor: '#2E2E2E', paddingTop: 16 }}>
                <Text style={styles.chartTitle}>Distribución de Activos en Pesos (ARS)</Text>
                {(() => {
                  const sortedList = [...pesosAssetsList].sort((a, b) => b.currentValue - a.currentValue);
                  const total = sortedList.reduce((acc, a) => acc + a.currentValue, 0);

                  return sortedList.map((item, idx) => {
                    const pct = total > 0 ? (item.currentValue / total) * 100 : 0;
                    return (
                      <View key={idx} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: 'bold' }}>{item.symbol}</Text>
                          <Text style={{ color: '#888', fontSize: 11 }}>{formatDisplayValue(item.currentValue)} ({pct.toFixed(1)}%)</Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: item.color || chartColors[idx % chartColors.length], borderRadius: 3 }} />
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>
            )}

            {/* Distribución de Activos en Dólares (Completo sin esconder ninguno) */}
            {dollarsAssetsList.length > 0 && (
              <View style={{ borderTopWidth: 1, borderTopColor: '#2E2E2E', paddingTop: 16 }}>
                <Text style={styles.chartTitle}>Distribución de Activos en Dólares (USD)</Text>
                {(() => {
                  const sortedList = [...dollarsAssetsList].sort((a, b) => b.currentValue - a.currentValue);
                  const total = sortedList.reduce((acc, a) => acc + a.currentValue, 0);

                  return sortedList.map((item, idx) => {
                    const pct = total > 0 ? (item.currentValue / total) * 100 : 0;
                    return (
                      <View key={idx} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: 'bold' }}>{item.symbol}</Text>
                          <Text style={{ color: '#888', fontSize: 11 }}>{formatDisplayValue(item.currentValue)} ({pct.toFixed(1)}%)</Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: item.color || chartColors[idx % chartColors.length], borderRadius: 3 }} />
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>
            )}
          </View>
        ) : (
          /* Renderizado como Gráfico de Torta Clásico */
          <View>
            {/* Gráfico 1: Capital Neto */}
            {netCapitalData.length > 0 ? (
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
            ) : (
              <View style={styles.chartBlock}>
                <Text style={styles.chartTitle}>Composición de Capital Neto</Text>
                <Text style={{ color: '#666', fontSize: 12, marginVertical: 40, textAlign: 'center' }}>No hay datos suficientes para mostrar la distribución</Text>
              </View>
            )}

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
        )}
      </View>

      {/* LISTADO DE ACTIVOS EN PESOS */}
      <Text style={styles.tableSectionTitle}>Activos en Pesos (ARS)</Text>
      {pesosAssetsList.length > 0 ? (
        <View style={styles.assetsList}>
          {pesosAssetsList.map((asset) => {
            const isPositive = asset.profit >= 0;
            const cleanSym = AssetService.getCleanSymbol(asset.symbol);
            const nativeCur = AssetService.getAssetNativeCurrency(asset.symbol);
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.assetItemSymbol} numberOfLines={1}>{cleanSym}</Text>
                        <View style={styles.nativeCurrencyPill}>
                          <Text style={styles.nativeCurrencyPillText}>{nativeCur}</Text>
                        </View>
                      </View>
                      <Text style={styles.assetItemName} numberOfLines={1}>{asset.name}</Text>
                    </View>
                  </View>
                  <View style={styles.assetItemRight}>
                    <Text style={styles.assetItemValue}>{formatDisplayValue(asset.currentValue)}</Text>
                    <Text style={styles.assetItemUnitPrice}>Cant: {formatNumber(asset.quantity, 2)} | u: {formatDisplayValue(asset.unitPrice)}</Text>
                  </View>
                </View>

                {/* Desglose de Mercado Pago (Opción B) */}
                {asset.is_mercado_pago && asset.base_quantity !== undefined && asset.autoprestamos_deducted !== undefined && (
                  <View style={styles.mpBreakdownContainer}>
                    <View style={styles.mpBreakdownRow}>
                      <Text style={styles.mpBreakdownLabel}>Saldo en Cuenta:</Text>
                      <Text style={styles.mpBreakdownValue}>${formatCurrency(asset.base_quantity)}</Text>
                    </View>
                    <View style={styles.mpBreakdownRow}>
                      <Text style={styles.mpBreakdownLabel}>Autopréstamos Tomados:</Text>
                      <Text style={[styles.mpBreakdownValue, { color: '#FF4C4C' }]}>-${formatCurrency(asset.autoprestamos_deducted)}</Text>
                    </View>
                  </View>
                )}

                {/* Diferencia / Rendimiento */}
                <View style={styles.assetItemFooter}>
                  <Text style={styles.investedLabel}>Invertido: {formatDisplayValue(asset.investedValue)}</Text>
                  <View style={[styles.profitBadge, { backgroundColor: isPositive ? 'rgba(0, 208, 158, 0.15)' : 'rgba(255, 76, 76, 0.15)' }]}>
                    <FontAwesome name={isPositive ? 'caret-up' : 'caret-down'} size={10} color={isPositive ? '#00D09E' : '#FF4C4C'} />
                    <Text style={[styles.profitTextValue, { color: isPositive ? '#00D09E' : '#FF4C4C' }]}>
                      {isPositive ? '+' : ''}{formatDisplayValue(asset.profit)} ({formatNumber(asset.profitPercentage, 2)}%)
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
      <Text style={styles.tableSectionTitle}>Activos en Moneda Extranjera / Hard Assets</Text>
      {dollarsAssetsList.length > 0 ? (
        <View style={styles.assetsList}>
          {dollarsAssetsList.map((asset) => {
            const isPositive = asset.profit >= 0;
            const cleanSym = AssetService.getCleanSymbol(asset.symbol);
            const nativeCur = AssetService.getAssetNativeCurrency(asset.symbol);
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.assetItemSymbol} numberOfLines={1}>{cleanSym}</Text>
                        <View style={[styles.nativeCurrencyPill, { backgroundColor: 'rgba(52, 152, 219, 0.15)' }]}>
                          <Text style={[styles.nativeCurrencyPillText, { color: '#3498DB' }]}>{nativeCur}</Text>
                        </View>
                      </View>
                      <Text style={styles.assetItemName} numberOfLines={1}>{asset.name}</Text>
                    </View>
                  </View>
                  <View style={styles.assetItemRight}>
                    <Text style={styles.assetItemValue}>{formatDisplayValue(asset.currentValue)}</Text>
                    <Text style={styles.assetItemUnitPrice}>Cant: {formatNumber(asset.quantity, 6)} | u: {formatDisplayValue(asset.unitPrice)}</Text>
                  </View>
                </View>

                {/* Diferencia / Rendimiento */}
                <View style={styles.assetItemFooter}>
                  <Text style={styles.investedLabel}>Invertido: {formatDisplayValue(asset.investedValue)}</Text>
                  <View style={[styles.profitBadge, { backgroundColor: isPositive ? 'rgba(0, 208, 158, 0.15)' : 'rgba(255, 76, 76, 0.15)' }]}>
                    <FontAwesome name={isPositive ? 'caret-up' : 'caret-down'} size={10} color={isPositive ? '#00D09E' : '#FF4C4C'} />
                    <Text style={[styles.profitTextValue, { color: isPositive ? '#00D09E' : '#FF4C4C' }]}>
                      {isPositive ? '+' : ''}{formatDisplayValue(asset.profit)} ({formatNumber(asset.profitPercentage, 2)}%)
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={{ color: '#888', fontStyle: 'italic' }}>No tienes activos extranjeros registrados.</Text>
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
                  <Text style={styles.inputLabel}>Moneda Base del Activo</Text>
                  <View style={styles.typeSelectorRow}>
                    {NATIVE_CURRENCY_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.typeSelectBtn, formCurrency === opt.value && styles.typeSelectBtnActive]}
                        onPress={() => setFormCurrency(opt.value)}
                      >
                        <Text style={[styles.typeSelectText, formCurrency === opt.value && styles.typeSelectTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Capital Invertido Original ({formCurrency})</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="ej. 1000.00"
                    placeholderTextColor="#666"
                    value={formInvestedCapital}
                    onChangeText={setFormInvestedCapital}
                    keyboardType="numeric"
                  />

                  <Text style={styles.inputLabel}>Saldo / Valor Actual del Fondo ({formCurrency})</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="ej. 1050.00"
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

              {/* Vista previa de rendimiento / actualización para Fondos/Cash */}
              {(formType === 'fiat' || formType === 'other') && (() => {
                const invested = Number(formInvestedCapital);
                const current = Number(formQuantity);
                if (isNaN(invested) || isNaN(current) || invested <= 0) return null;
                const diff = current - invested;
                const pct = (diff / invested) * 100;
                const symbol = formCurrency === 'USD' ? 'u$s' : formCurrency === 'EUR' ? '€' : formCurrency === 'BRL' ? 'R$' : '$';
                return (
                  <View style={[styles.modalProfitBadge, { backgroundColor: diff >= 0 ? 'rgba(0, 208, 158, 0.15)' : 'rgba(255, 76, 76, 0.15)' }]}>
                    <Text style={[styles.modalProfitText, { color: diff >= 0 ? '#00D09E' : '#FF4C4C' }]}>
                      Actualización: {diff >= 0 ? 'Subió ▲' : 'Bajó ▼'} {diff >= 0 ? '+' : ''}{symbol} {formatCurrency(diff)} ({formatNumber(pct, 2)}%)
                    </Text>
                  </View>
                );
              })()}

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

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, zIndex: 100, position: 'relative' },
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

  goalProgressSection: {},
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
  modalProfitBadge: { padding: 12, borderRadius: 8, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  modalProfitText: { fontSize: 13, fontWeight: 'bold' },
  mpBreakdownContainer: { marginTop: 10, padding: 10, backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: 8, gap: 4, borderWidth: 1, borderColor: '#222' },
  mpBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mpBreakdownLabel: { color: '#666', fontSize: 12 },
  mpBreakdownValue: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },

  // Estilos de Selector de Moneda y Pills
  currencyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6, borderWidth: 1, borderColor: '#333' },
  currencyBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  currencyDropdown: { position: 'absolute', top: 38, right: 0, backgroundColor: '#1E1E1E', borderRadius: 8, padding: 4, borderWidth: 1, borderColor: '#333', width: 140, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5, zIndex: 1000 },
  currencyOption: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  currencyOptionActive: { backgroundColor: 'rgba(0, 208, 158, 0.15)' },
  currencyOptionText: { color: '#AAA', fontSize: 12 },
  currencyOptionTextActive: { color: '#00D09E', fontWeight: 'bold' },
  nativeCurrencyPill: { backgroundColor: 'rgba(0, 208, 158, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  nativeCurrencyPillText: { color: '#00D09E', fontSize: 9, fontWeight: 'bold' },

  viewToggleContainer: { flexDirection: 'row', backgroundColor: '#222', borderRadius: 8, padding: 3, borderWidth: 1, borderColor: '#333' },
  viewToggleBtn: { width: 28, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  viewToggleBtnActive: { backgroundColor: '#FFD700' }
});
