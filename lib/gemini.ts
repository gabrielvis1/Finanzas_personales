import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

// Initialize the Gemini client
export const ai = new GoogleGenAI({ apiKey });

export async function analyzeReceipt(base64Data: string, mimeType: string = 'image/jpeg') {
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada.');
  }
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
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
    });
    
    const text = response.text || '';
    // Clean up potential markdown formatting that the AI might add despite instructions
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Error in analyzeReceipt:', error);
    throw error;
  }
}

export async function processVoiceAssistant(audioBase64: string, mimeType: string, textHistory: string = "") {
  if (!apiKey) throw new Error('API Key de Gemini no configurada.');

  try {
    const prompt = `Eres el asistente financiero de Finiax. El usuario te está hablando para registrar un movimiento. 
Tu objetivo es extraer: amount (número), name (título corto), category (categoría), payment_method ('cash', 'credit_card', 'debit'), y type ('income', 'expense').
Historial de la conversación (si existe): "${textHistory}".

Reglas:
1. Si con el historial y este nuevo audio YA tienes suficiente información para registrar el movimiento (principalmente monto y de qué es), responde ÚNICAMENTE con un JSON con esta estructura:
{ "complete": true, "transaction": { "amount": 50, "name": "Verdulería", "category": "Comida", "payment_method": "cash", "type": "expense" }, "message": "Movimiento guardado con éxito." }
2. Si falta información clave (por ejemplo, dijo el monto pero no en qué, o viceversa), hazle una pregunta corta y amigable. Responde ÚNICAMENTE con este JSON:
{ "complete": false, "message": "Entendí que gastaste $50, ¿pero en qué fue?" }

NO uses formato markdown (\`\`\`json) bajo ninguna circunstancia. Devuelve el JSON puro.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: audioBase64, mimeType } },
            { text: prompt }
          ]
        }
      ]
    });

    const text = response.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('Error in processVoiceAssistant:', error);
    throw error;
  }
}
