import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome } from '@expo/vector-icons';
import { AssetService } from '@/lib/services/AssetService';
import { getInvestmentAdvice } from '@/lib/gemini';
import { useAuth } from '@/providers/AuthProvider';

type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

interface SubAllocation {
  name: string;
  percentage: number;
}

interface Allocation {
  name: string;
  percentage: number;
  subAllocations?: SubAllocation[];
}

const DEFAULT_ALLOCATIONS: Record<RiskProfile, Allocation[]> = {
  conservative: [
    { name: 'MERCADO PAGO', percentage: 10 },
    { name: 'UALÁ PESOS', percentage: 10 },
    { name: 'COCOS PESOS', percentage: 10 },
    { name: 'IOL PESOS', percentage: 5 },
    {
      name: 'CEDEARs',
      percentage: 45,
      subAllocations: [
        { name: 'SPY', percentage: 20 },
        { name: 'KO', percentage: 20 },
        { name: 'MCD', percentage: 15 },
        { name: 'MSFT', percentage: 15 },
        { name: 'JNJ', percentage: 10 },
        { name: 'WMT', percentage: 10 },
        { name: 'QQQ', percentage: 10 }
      ]
    },
    {
      name: 'CRIPTOMONEDAS',
      percentage: 20,
      subAllocations: [
        { name: 'BTC', percentage: 30 },
        { name: 'ETH', percentage: 30 },
        { name: 'BNB', percentage: 15 },
        { name: 'SOL', percentage: 15 },
        { name: 'USDT', percentage: 10 }
      ]
    }
  ],
  moderate: [
    { name: 'RENTA FIJA (MP, Ualá, Cocos)', percentage: 20 },
    {
      name: 'CEDEARs / ACCIONES',
      percentage: 50,
      subAllocations: [
        { name: 'SPY', percentage: 30 },
        { name: 'QQQ', percentage: 25 },
        { name: 'AAPL', percentage: 15 },
        { name: 'MSFT', percentage: 15 },
        { name: 'KO', percentage: 15 }
      ]
    },
    {
      name: 'CRIPTOMONEDAS',
      percentage: 30,
      subAllocations: [
        { name: 'BTC', percentage: 40 },
        { name: 'ETH', percentage: 35 },
        { name: 'SOL', percentage: 15 },
        { name: 'USDT', percentage: 10 }
      ]
    }
  ],
  aggressive: [
    { name: 'RENTA FIJA', percentage: 10 },
    {
      name: 'CEDEARs / ACCIONES',
      percentage: 40,
      subAllocations: [
        { name: 'QQQ', percentage: 40 },
        { name: 'SPY', percentage: 30 },
        { name: 'NVDA', percentage: 15 },
        { name: 'AAPL', percentage: 15 }
      ]
    },
    {
      name: 'CRIPTOMONEDAS',
      percentage: 50,
      subAllocations: [
        { name: 'BTC', percentage: 45 },
        { name: 'ETH', percentage: 35 },
        { name: 'SOL', percentage: 15 },
        { name: 'BNB', percentage: 5 }
      ]
    }
  ]
};

const MONTHLY_CEDEARS_DIVIDENDS = [
  { month: 'Enero', tickers: 'KO, WMT, SBUX, UL, MDLZ, QQQ', nextMonth: 'Febrero' },
  { month: 'Febrero', tickers: 'PG, AAPL, CL, T, VZ', nextMonth: 'Marzo' },
  { month: 'Marzo', tickers: 'SPY, JNJ, MCD, MSFT, PFE, CVX, MMM, XOM', nextMonth: 'Abril' },
  { month: 'Abril', tickers: 'KO, WMT, SBUX, QQQ', nextMonth: 'Mayo' },
  { month: 'Mayo', tickers: 'PG, AAPL, CL, T, VZ, UL', nextMonth: 'Junio' },
  { month: 'Junio', tickers: 'SPY, JNJ, MCD, MSFT, PFE, CVX, PEP, MMM, XOM', nextMonth: 'Julio' },
  { month: 'Julio', tickers: 'KO, WMT, SBUX, UL, MDLZ, QQQ', nextMonth: 'Agosto' },
  { month: 'Agosto', tickers: 'PG, AAPL, CL, T, VZ', nextMonth: 'Septiembre' },
  { month: 'Septiembre', tickers: 'SPY, JNJ, MCD, MSFT, PFE, CVX, PEP, MMM, XOM', nextMonth: 'Octubre' },
  { month: 'Octubre', tickers: 'KO, WMT, SBUX, UL, QQQ', nextMonth: 'Noviembre' },
  { month: 'Noviembre', tickers: 'PG, AAPL, CL, T, VZ, MDLZ', nextMonth: 'Diciembre' },
  { month: 'Diciembre', tickers: 'SPY, JNJ, MCD, MSFT, PFE, CVX, PEP, MMM, XOM', nextMonth: 'Enero' }
];

export default function PlannerScreen() {
  const { session } = useAuth();
  
  // Estados de carga e inputs
  const [loading, setLoading] = useState(false);
  const [salary, setSalary] = useState('');
  const [investPercent, setInvestPercent] = useState('10');
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [calculatingAdvice, setCalculatingAdvice] = useState(false);

  // Estados del Quiz
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [quizScores, setQuizScores] = useState<number[]>([]);

  const quizQuestions = [
    {
      question: '¿Cuál es tu principal objetivo financiero al invertir?',
      options: [
        { text: 'Proteger mis ahorros de la inflación y cobrar dividendos estables.', score: 1 },
        { text: 'Hacer crecer mi capital a mediano plazo tolerando cierta volatilidad.', score: 2 },
        { text: 'Maximizar el crecimiento a largo plazo asumiendo altas fluctuaciones y caídas.', score: 3 }
      ]
    },
    {
      question: '¿Cómo reaccionarías si tu portafolio de inversiones cae un 25% en un mes?',
      options: [
        { text: 'Me asustaría mucho y vendería todo para evitar perder más dinero.', score: 1 },
        { text: 'Mantendría la calma esperando que el mercado se recupere a mediano plazo.', score: 2 },
        { text: 'Aprovecharía para comprar más activos a precios de descuento.', score: 3 }
      ]
    },
    {
      question: '¿Cuál es el plazo de tiempo (horizonte) planeado para tus inversiones?',
      options: [
        { text: 'Corto plazo (menos de 1 o 2 años).', score: 1 },
        { text: 'Mediano plazo (entre 2 y 5 años).', score: 2 },
        { text: 'Largo plazo (más de 5 años).', score: 3 }
      ]
    }
  ];

  useEffect(() => {
    loadSavedSettings();
  }, []);

  const loadSavedSettings = async () => {
    try {
      const savedProfile = await AsyncStorage.getItem('finiax_risk_profile');
      if (savedProfile) {
        setRiskProfile(savedProfile as RiskProfile);
      }
      const savedSalary = await AsyncStorage.getItem('finiax_planner_salary');
      if (savedSalary) {
        setSalary(savedSalary);
      }
      const savedPercent = await AsyncStorage.getItem('finiax_planner_percent');
      if (savedPercent) {
        setInvestPercent(savedPercent);
      }
    } catch (e) {
      console.warn('Error cargando configuración:', e);
    }
  };

  const handleStartQuiz = () => {
    setCurrentQuestion(0);
    setQuizScores([]);
    setShowQuiz(true);
  };

  const handleSelectOption = async (score: number) => {
    const newScores = [...quizScores, score];
    setQuizScores(newScores);

    if (currentQuestion < quizQuestions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // Calcular perfil resultante basado en promedio
      const totalScore = newScores.reduce((a, b) => a + b, 0);
      let calculatedProfile: RiskProfile = 'moderate';
      if (totalScore <= 4) {
        calculatedProfile = 'conservative';
      } else if (totalScore >= 8) {
        calculatedProfile = 'aggressive';
      }

      setRiskProfile(calculatedProfile);
      setShowQuiz(false);
      try {
        await AsyncStorage.setItem('finiax_risk_profile', calculatedProfile);
      } catch (e) {}
    }
  };

  const handleSaveSalaryAndPercent = async () => {
    try {
      await AsyncStorage.setItem('finiax_planner_salary', salary);
      await AsyncStorage.setItem('finiax_planner_percent', investPercent);
      Alert.alert('Éxito', 'Valores de planificación guardados.');
    } catch (e) {}
  };

  const handleGetAiAdvice = async () => {
    if (!riskProfile || !session?.user?.id) {
      Alert.alert('Aviso', 'Realiza el test de perfil de riesgo primero.');
      return;
    }

    setCalculatingAdvice(true);
    setAiAdvice(null);

    try {
      const numSalary = Number(salary || 0);
      const numPercent = Number(investPercent || 10);
      const currentAssets = await AssetService.getAssets(session.user.id);
      const currentAllocations = DEFAULT_ALLOCATIONS[riskProfile];

      const advice = await getInvestmentAdvice(
        riskProfile,
        currentAssets,
        currentAllocations,
        numSalary,
        numPercent
      );
      setAiAdvice(advice);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo obtener el asesoramiento.');
    } finally {
      setCalculatingAdvice(false);
    }
  };

  const numSalary = Number(salary) || 0;
  const numPercent = Number(investPercent) || 0;
  const totalToInvest = (numSalary * numPercent) / 100;
  const currentMonthIdx = new Date().getMonth();
  const currentMonthName = MONTHLY_CEDEARS_DIVIDENDS[currentMonthIdx].month;

  const allocations = riskProfile ? DEFAULT_ALLOCATIONS[riskProfile] : [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.headerTitle}>Planificador de Inversiones</Text>
      <Text style={styles.headerSubtitle}>Estrategias automatizadas para maximizar tus ingresos pasivos</Text>

      {/* QUIZ SECTION */}
      {!riskProfile && !showQuiz ? (
        <View style={styles.welcomeCard}>
          <FontAwesome name="line-chart" size={36} color="#00D09E" style={{ marginBottom: 12 }} />
          <Text style={styles.cardTitle}>¿Cuál es tu Perfil de Inversor?</Text>
          <Text style={styles.cardDesc}>
            Para diseñarte una estrategia de distribución ideal, primero necesitamos realizar un breve test de tu tolerancia al riesgo.
          </Text>
          <TouchableOpacity style={styles.btnAction} onPress={handleStartQuiz}>
            <Text style={styles.btnActionText}>Iniciar Test de Perfil</Text>
          </TouchableOpacity>
        </View>
      ) : showQuiz ? (
        <View style={styles.quizCard}>
          <Text style={styles.quizProgress}>Pregunta {currentQuestion + 1} de {quizQuestions.length}</Text>
          <Text style={styles.quizQuestion}>{quizQuestions[currentQuestion].question}</Text>
          {quizQuestions[currentQuestion].options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={styles.quizOption}
              onPress={() => handleSelectOption(opt.score)}
            >
              <Text style={styles.quizOptionText}>{opt.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.profileCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.avatarIcon, { backgroundColor: riskProfile === 'conservative' ? '#1b4d3e' : riskProfile === 'moderate' ? '#5a3d1b' : '#5a1b1b' }]}>
                <FontAwesome name="shield" size={16} color="#00D09E" />
              </View>
              <View>
                <Text style={styles.profileLabel}>Tu perfil de inversor</Text>
                <Text style={styles.profileValue}>
                  {riskProfile === 'conservative' ? 'CONSERVADOR' : riskProfile === 'moderate' ? 'MODERADO' : 'AGRESIVO'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.retestBtn} onPress={handleStartQuiz}>
              <Text style={styles.retestText}>Repetir Test</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.profileDesc}>
            {riskProfile === 'conservative' && 'Buscas proteger tu capital inicial minimizando las fluctuaciones del mercado. Priorizas dividendos consistentes y estabilidad mediante CEDEARs defensivos e instrumentos de renta fija.'}
            {riskProfile === 'moderate' && 'Buscas un balance óptimo entre crecimiento y estabilidad. Toleras fluctuaciones moderadas para acceder a retornos mayores combinando activos de dividendos y criptomonedas consolidadas.'}
            {riskProfile === 'aggressive' && 'Priorizas la maximización de retornos a largo plazo y toleras caídas severas a corto plazo. Destinas una porción mayoritaria a activos de alta volatilidad como criptoactivos y acciones de tecnología.'}
          </Text>
        </View>
      )}

      {/* PLANNER CALCULATOR SECTION */}
      {riskProfile && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Calculadora de Distribución</Text>
          <Text style={styles.sectionSubtitle}>Divide tu sueldo automáticamente al instante de ingresar</Text>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1.5 }}>
              <Text style={styles.inputLabel}>Sueldo Mensual ($)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ingresar sueldo..."
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={salary}
                onChangeText={setSalary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Invertir (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="10"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={investPercent}
                onChangeText={setInvestPercent}
              />
            </View>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total asignado a Inversiones:</Text>
            <Text style={styles.summaryValue}>${totalToInvest.toLocaleString('es-ES', { minimumFractionDigits: 2 })} ARS</Text>
          </View>

          <TouchableOpacity style={[styles.btnAction, { marginTop: 12 }]} onPress={handleSaveSalaryAndPercent}>
            <Text style={styles.btnActionText}>Guardar Planificación</Text>
          </TouchableOpacity>

          {totalToInvest > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.distributionTitle}>Distribución Sugerida</Text>
              {allocations.map((alloc, idx) => {
                const allocatedAmount = (totalToInvest * alloc.percentage) / 100;
                return (
                  <View key={idx} style={styles.allocationRow}>
                    <View style={styles.allocationHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={styles.allocationDot} />
                        <Text style={styles.allocationName}>{alloc.name}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.allocationAmt}>${allocatedAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</Text>
                        <Text style={styles.allocationPct}>{alloc.percentage}%</Text>
                      </View>
                    </View>

                    {/* Sub-allocations details */}
                    {alloc.subAllocations && (
                      <View style={styles.subAllocationsBox}>
                        {alloc.subAllocations.map((sub, sIdx) => {
                          const subAmt = (allocatedAmount * sub.percentage) / 100;
                          return (
                            <View key={sIdx} style={styles.subAllocRow}>
                              <Text style={styles.subAllocName}>{sub.name} ({sub.percentage}%)</Text>
                              <Text style={styles.subAllocAmt}>${subAmt.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* DIVIDEND CALENDAR SECTION */}
      {riskProfile && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Calendario de Dividendos</Text>
          <Text style={styles.sectionSubtitle}> CEDEARs a comprar este mes para cobrar el mes próximo</Text>

          <View style={styles.calendarBox}>
            {MONTHLY_CEDEARS_DIVIDENDS.map((item, idx) => {
              const isCurrent = item.month === currentMonthName;
              return (
                <View key={idx} style={[styles.calendarRow, isCurrent && styles.calendarRowActive]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {isCurrent && <FontAwesome name="check-circle" size={14} color="#00D09E" />}
                    <Text style={[styles.calendarMonth, isCurrent && { fontWeight: 'bold', color: '#00D09E' }]}>{item.month}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={styles.calendarTickers}>{item.tickers}</Text>
                    <Text style={styles.calendarReason}>Genera dividendos en: {item.nextMonth}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* AI STRATEGY AND PORTFOLIO ADVICE */}
      {riskProfile && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Cotejo de Portafolio y Consejos de IA</Text>
          <Text style={styles.sectionSubtitle}>La IA evaluará tus activos actuales y te dará sugerencias de rebalanceo</Text>

          {calculatingAdvice ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color="#00D09E" size="large" />
              <Text style={{ color: '#888', marginTop: 12 }}>Finiax AI analizando tus activos...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.btnAction} onPress={handleGetAiAdvice}>
              <FontAwesome name="magic" size={16} color="#121212" style={{ marginRight: 8 }} />
              <Text style={styles.btnActionText}>Analizar Portafolio con IA</Text>
            </TouchableOpacity>
          )}

          {aiAdvice && (
            <View style={styles.adviceBox}>
              <Text style={styles.adviceTitle}>Recomendación de Finiax AI</Text>
              <Text style={styles.adviceContent}>{aiAdvice}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginHorizontal: 16, marginTop: 20 },
  headerSubtitle: { color: '#888', fontSize: 12, marginHorizontal: 16, marginBottom: 20 },
  
  welcomeCard: { backgroundColor: '#111', padding: 20, borderRadius: 16, marginHorizontal: 16, borderWidth: 1, borderColor: '#222', alignItems: 'center' },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 8, marginBottom: 6 },
  cardDesc: { color: '#AAA', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  
  quizCard: { backgroundColor: '#111', padding: 20, borderRadius: 16, marginHorizontal: 16, borderWidth: 1, borderColor: '#222' },
  quizProgress: { color: '#00D09E', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  quizQuestion: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 20, lineHeight: 22 },
  quizOption: { backgroundColor: '#222', padding: 16, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  quizOptionText: { color: '#FFF', fontSize: 14 },
  
  profileCard: { backgroundColor: '#111', padding: 18, borderRadius: 16, marginHorizontal: 16, borderWidth: 1, borderColor: '#222', marginBottom: 20 },
  avatarIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  profileLabel: { color: '#888', fontSize: 11 },
  profileValue: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  profileDesc: { color: '#AAA', fontSize: 12, lineHeight: 18, marginTop: 10 },
  retestBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#222' },
  retestText: { color: '#00D09E', fontSize: 11, fontWeight: 'bold' },
  
  sectionCard: { backgroundColor: '#111', padding: 18, borderRadius: 16, marginHorizontal: 16, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  sectionTitle: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  sectionSubtitle: { color: '#888', fontSize: 12, marginBottom: 16 },
  
  inputLabel: { color: '#888', fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: '#222', color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1C1C1C', padding: 14, borderRadius: 8, marginTop: 12 },
  summaryLabel: { color: '#AAA', fontSize: 13 },
  summaryValue: { color: '#00D09E', fontSize: 15, fontWeight: 'bold' },
  
  btnAction: { flexDirection: 'row', backgroundColor: '#00D09E', padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnActionText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
  
  distributionTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#222', paddingBottom: 6 },
  allocationRow: { marginBottom: 16, backgroundColor: '#181818', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#262626' },
  allocationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  allocationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00D09E' },
  allocationName: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  allocationAmt: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  allocationPct: { color: '#888', fontSize: 10 },
  
  subAllocationsBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#2C2C2C', paddingTop: 8, paddingLeft: 12 },
  subAllocRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  subAllocName: { color: '#AAA', fontSize: 11 },
  subAllocAmt: { color: '#FFF', fontSize: 11 },
  
  calendarBox: { marginTop: 8 },
  calendarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  calendarRowActive: { backgroundColor: 'rgba(0, 208, 158, 0.05)', borderRadius: 8, paddingHorizontal: 8, borderBottomWidth: 0 },
  calendarMonth: { color: '#FFF', fontSize: 13 },
  calendarTickers: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  calendarReason: { color: '#888', fontSize: 10, marginTop: 2 },
  
  adviceBox: { marginTop: 16, backgroundColor: '#1C1C1C', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#2E2E2E' },
  adviceTitle: { color: '#00D09E', fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  adviceContent: { color: '#AAA', fontSize: 12, lineHeight: 18 }
});
