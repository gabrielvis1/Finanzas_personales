import { AssetService } from './services/AssetService';
import { BudgetService } from './services/BudgetService';
import { CreditLineService } from './services/CreditLineService';
import { TransactionService } from './services/TransactionService';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

async function callGemini(payload: any): Promise<any> {
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada.');
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en API de Gemini: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}

export async function analyzeReceipt(base64Data: string, mimeType: string = 'image/jpeg') {
  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            }
          },
          {
            text: `Analiza esta factura, recibo o comprobante de pago. Extrae la siguiente información y devuélvela ÚNICAMENTE en formato JSON, sin texto adicional, sin formato markdown, sólo el objeto JSON puro.
              El JSON debe tener esta estructura exacta:
              {
                "amount": number (el monto total de la factura, usa punto para decimales. No incluyas el signo de moneda),
                "category": string (infiere una categoría corta, ej. "Comida", "Transporte", "Supermercado", "Sueldo"),
                "description": string (una breve descripción de lo que se pagó o compró, ej. "Compra en Walmart"),
                "type": string (debe ser estrictamente "expense" o "income". Asume "expense" si es una factura de compra),
                "is_valid": boolean (true si parece una factura o comprobante real, false si parece una imagen irrelevante)
              }`
          }
        ]
      }
    ]
  };

  try {
    const response = await callGemini(payload);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Error in analyzeReceipt:', error);
    throw error;
  }
}

export async function processVoiceAssistant(audioBase64: string, mimeType: string, textHistory: string = "") {
  const prompt = `Eres el asistente financiero de Finiax. El usuario te está hablando para registrar un movimiento. 
Tu objetivo es extraer: amount (número), name (título corto), category (categoría), payment_method ('cash', 'credit_card', 'debit'), y type ('income', 'expense').
Historial de la conversación (si existe): "${textHistory}".

Reglas:
1. Si con el historial y este nuevo audio YA tienes suficiente información para registrar el movimiento (principalmente monto y de qué es), responde ÚNICAMENTE con un JSON con esta estructura:
{ "complete": true, "transaction": { "amount": 50, "name": "Verdulería", "category": "Comida", "payment_method": "cash", "type": "expense" }, "message": "Movimiento guardado con éxito." }
2. Si falta información clave (por ejemplo, dijo el monto pero no en qué, o viceversa), hazle una pregunta corta y amigable. Responde ÚNICAMENTE con este JSON:
{ "complete": false, "message": "Entendí que gastaste $50, ¿pero en qué fue?" }

NO uses formato markdown (\`\`\`json) bajo ninguna circunstancia. Devuelve el JSON puro.`;

  const payload = {
    contents: [
      {
        parts: [
          { inlineData: { data: audioBase64, mimeType } },
          { text: prompt }
        ]
      }
    ]
  };

  try {
    const response = await callGemini(payload);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Error in processVoiceAssistant:', error);
    throw error;
  }
}

const toolDeclarations = [
  {
    name: 'getAssets',
    description: 'Obtiene todos los activos financieros del usuario.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'saveAsset',
    description: 'Añade o edita un activo financiero. Para añadir no pases id.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'ID del activo si se va a editar' },
        name: { type: 'STRING', description: 'Nombre descriptivo, ej: Acciones de Apple, Plazo Fijo, Dólar Colchón' },
        symbol: { type: 'STRING', description: 'Símbolo del activo, ej: AAPL, BTC, USD:BILLETE, ARS:MP' },
        type: { type: 'STRING', enum: ['crypto', 'stock', 'fiat', 'other'], description: 'Tipo de activo' },
        quantity: { type: 'NUMBER', description: 'Cantidad total disponible' },
        average_buy_price: { type: 'NUMBER', description: 'Precio promedio de compra en su moneda de origen' }
      },
      required: ['name', 'symbol', 'type', 'quantity', 'average_buy_price']
    }
  },
  {
    name: 'deleteAsset',
    description: 'Elimina un activo por su ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'ID del activo a eliminar' }
      },
      required: ['id']
    }
  },
  {
    name: 'getBudgets',
    description: 'Obtiene los presupuestos del usuario para un mes y año específicos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'NUMBER', description: 'Mes (0 para Enero, 11 para Diciembre)' },
        year: { type: 'NUMBER', description: 'Año, ej: 2026' },
        totalIncome: { type: 'NUMBER', description: 'Ingresos estimados del usuario para calcular límites porcentuales. Opcional, por defecto 0.' }
      },
      required: ['month', 'year']
    }
  },
  {
    name: 'saveBudget',
    description: 'Añade o edita un presupuesto. Para añadir no pases id.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'ID del presupuesto si se va a editar' },
        category: { type: 'STRING', description: 'Nombre de la categoría, ej: Comida, Transporte, Alquiler' },
        section: { type: 'STRING', description: 'Sección del presupuesto, ej: Mensual, Fijos, Variables' },
        limit_amount: { type: 'NUMBER', description: 'Límite monetario asignado' },
        percentage: { type: 'NUMBER', description: 'Porcentaje de ingresos asignado (opcional)' },
        due_day: { type: 'NUMBER', description: 'Día del mes en que vence (opcional)' },
        order_index: { type: 'NUMBER', description: 'Índice de orden en la lista' },
        month: { type: 'NUMBER', description: 'Mes del presupuesto (1-12)' },
        year: { type: 'NUMBER', description: 'Año del presupuesto' }
      },
      required: ['category', 'section', 'limit_amount', 'order_index', 'month', 'year']
    }
  },
  {
    name: 'deleteBudget',
    description: 'Elimina un presupuesto por su ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'ID del presupuesto a eliminar' }
      },
      required: ['id']
    }
  },
  {
    name: 'getPendingInstallments',
    description: 'Obtiene las deudas o cuotas de deudas pendientes del usuario.',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'getTransactionsByDateRange',
    description: 'Obtiene transacciones realizadas en un rango de fechas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        startDate: { type: 'STRING', description: 'Fecha de inicio en formato ISO (YYYY-MM-DD)' },
        endDate: { type: 'STRING', description: 'Fecha final en formato ISO (YYYY-MM-DD)' }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'saveTransaction',
    description: 'Registra o edita una transacción de ingresos o gastos. Para añadir no pases id.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'ID si se va a editar' },
        name: { type: 'STRING', description: 'Concepto o título' },
        amount: { type: 'NUMBER', description: 'Monto total' },
        type: { type: 'STRING', enum: ['income', 'expense'], description: 'Tipo de transacción' },
        payment_method: { type: 'STRING', description: 'Método de pago, ej: efectivo, tarjeta_credito, tarjeta_debito, transferencia' },
        category: { type: 'STRING', description: 'Categoría, ej: Comida, Sueldo, Regalo, Ocio' },
        date: { type: 'STRING', description: 'Fecha de la transacción (YYYY-MM-DD)' },
        description: { type: 'STRING', description: 'Detalle adicional (opcional)' }
      },
      required: ['name', 'amount', 'type', 'payment_method', 'category']
    }
  },
  {
    name: 'deleteTransaction',
    description: 'Elimina una transacción por su ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'ID de la transacción a eliminar' }
      },
      required: ['id']
    }
  }
];

export async function chatWithAssistant(userId: string, messages: any[]) {
  let currentMessages = [...messages];
  const systemInstruction = `Eres Finiax AI, el asistente financiero inteligente de Finiax.
Puedes interactuar con los datos del usuario usando tus herramientas para obtener o registrar información (transacciones, activos, deudas, presupuestos).
El idioma de comunicación debe ser el español y con un tono sumamente premium, claro y empoderador.
Cuando el usuario te pida realizar una acción (ej: agregar una transacción, presupuesto, activo), ejecuta la herramienta correspondiente y confirma al usuario que se ha completado la acción de manera exitosa.
Si el usuario pregunta por resúmenes o distribución de gastos o activos, obtén los datos relevantes usando las herramientas y realiza los cálculos o descripciones informativas de forma clara.`;

  try {
    let loopCount = 0;
    while (loopCount < 5) {
      loopCount++;
      const payload = {
        contents: currentMessages,
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        tools: [{ functionDeclarations: toolDeclarations as any }]
      };

      const response = await callGemini(payload);
      const candidate = response.candidates?.[0];
      const modelContent = candidate?.content;
      const parts = modelContent?.parts || [];

      // Check if there are functionCalls
      const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      if (functionCalls.length > 0) {
        // Guardar la llamada a función de la IA en la historia
        currentMessages.push({
          role: 'model',
          parts: functionCalls.map((call: any) => ({ functionCall: call }))
        });

        const functionResponses: any[] = [];

        for (const call of functionCalls) {
          const { name, args } = call;
          let result: any = { success: false };

          try {
            switch (name) {
              case 'getAssets':
                result = await AssetService.getAssets(userId);
                break;
              case 'saveAsset':
                await AssetService.saveAsset(userId, args as any);
                result = { success: true, message: 'Activo guardado correctamente.' };
                break;
              case 'deleteAsset':
                await AssetService.deleteAsset((args as any).id);
                result = { success: true, message: 'Activo eliminado correctamente.' };
                break;
              case 'getBudgets':
                result = await BudgetService.getBudgets(userId, (args as any).month, (args as any).year, (args as any).totalIncome || 0);
                break;
              case 'saveBudget':
                await BudgetService.saveBudget(userId, args as any);
                result = { success: true, message: 'Presupuesto guardado correctamente.' };
                break;
              case 'deleteBudget':
                await BudgetService.deleteBudget((args as any).id);
                result = { success: true, message: 'Presupuesto eliminado correctamente.' };
                break;
              case 'getPendingInstallments':
                result = await CreditLineService.getPendingInstallments(userId);
                break;
              case 'getTransactionsByDateRange':
                result = await TransactionService.getTransactionsByDateRange(userId, (args as any).startDate, (args as any).endDate);
                break;
              case 'saveTransaction':
                await TransactionService.saveTransaction(userId, args as any);
                result = { success: true, message: 'Transacción guardada correctamente.' };
                break;
              case 'deleteTransaction':
                await TransactionService.deleteTransaction((args as any).id);
                result = { success: true, message: 'Transacción eliminada correctamente.' };
                break;
              default:
                result = { success: false, error: 'Función no soportada.' };
            }
          } catch (e: any) {
            console.error(`Error al ejecutar herramienta ${name}:`, e);
            result = { success: false, error: e.message };
          }

          functionResponses.push({
            functionResponse: {
              name,
              response: { result }
            }
          });
        }

        // Agregar las respuestas de las funciones a la historia y repetir el ciclo
        currentMessages.push({
          role: 'user',
          parts: functionResponses
        });
      } else {
        // No hay llamadas a funciones, Gemini devolvió una respuesta textual
        const text = parts.find((p: any) => p.text)?.text || '';
        return {
          text,
          history: currentMessages
        };
      }
    }

    throw new Error('Se superó el límite de iteraciones en la llamada a funciones.');
  } catch (error) {
    console.error('Error in chatWithAssistant:', error);
    throw error;
  }
}

export async function getInvestmentAdvice(
  riskProfile: string,
  currentAssets: any[],
  monthlyAllocation: any,
  salary: number,
  investPercent: number
): Promise<string> {
  const prompt = `Eres un asesor financiero experto y estratega de portafolio para Finiax.
Analiza la siguiente información de inversión del usuario y brinda una recomendación premium, amigable y muy estructurada en español:

1. Perfil de Riesgo: ${riskProfile}
2. Sueldo mensual: $${salary} ARS (destinando un ${investPercent}% a inversión, total a invertir: $${salary * investPercent / 100} ARS)
3. Alocación objetivo planificada:
${JSON.stringify(monthlyAllocation, null, 2)}

4. Activos reales actuales del usuario:
${JSON.stringify(currentAssets, null, 2)}

Tu tarea:
- Evalúa si el portafolio actual del usuario se alinea con su perfil de riesgo.
- Recomienda si debe realizar algún rebalanceo (por ejemplo, si es conservador pero tiene todo en criptomonedas altamente volátiles, sugiérele rebalancear hacia CEDEARs de consumo o renta fija).
- Brinda sugerencias específicas de Cedears para comprar este mes en base a empresas sólidas que pagan dividendos estables (menciona cuáles pagan dividendos próximamente).
- Sé conciso pero sumamente profesional.`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  };

  try {
    const response = await callGemini(payload);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text || 'No se pudo generar recomendación en este momento.';
  } catch (e: any) {
    console.error('Error in getInvestmentAdvice:', e);
    return 'Error al obtener asesoramiento de IA: ' + e.message;
  }
}
