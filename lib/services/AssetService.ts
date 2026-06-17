import { supabase } from '../supabase';

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  type: string; // 'crypto', 'stock', 'fiat', 'other'
  quantity: number;
  average_buy_price: number;
  current_price?: number;
  is_autoprestamo?: boolean;
  is_mercado_pago?: boolean;
  base_quantity?: number;
  base_invested?: number;
  autoprestamos_deducted?: number;
}

export class AssetService {
  static isCryptoSymbol(symbol: string): boolean {
    return ['BTC', 'ETH', 'BNB', 'USDT', 'SOL'].includes(symbol.toUpperCase().trim());
  }

  static isStockSymbol(symbol: string): boolean {
    return [
      'MMM', 'T', 'AAPL', 'CVX', 'KO', 'CL', 'QQQ', 'SPY', 'XOM', 'JNJ', 'MCD', 'MSFT', 'PEP', 'PFE', 'PG', 'SBUX', 'STBUX', 'UL', 'VZ', 'WMT'
    ].includes(symbol.toUpperCase().trim());
  }

  static isUSDAsset(symbol: string, name: string): boolean {
    if (!symbol) return false;
    const sym = symbol.toUpperCase().trim();
    const n = (name || '').toLowerCase().trim();
    return (
      sym.startsWith('USD:') ||
      sym.startsWith('EUR:') ||
      sym.startsWith('BRL:') ||
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
  }

  static getAssetNativeCurrency(symbol: string): 'ARS' | 'USD' | 'EUR' | 'BRL' {
    if (!symbol) return 'ARS';
    const sym = symbol.toUpperCase().trim();
    if (sym.startsWith('USD:')) return 'USD';
    if (sym.startsWith('EUR:')) return 'EUR';
    if (sym.startsWith('BRL:')) return 'BRL';
    if (sym.startsWith('ARS:')) return 'ARS';
    if (this.isUSDAsset(symbol, '')) return 'USD';
    return 'ARS';
  }

  static getCleanSymbol(symbol: string): string {
    if (!symbol) return '';
    const parts = symbol.split(':');
    if (parts.length > 1 && ['USD', 'EUR', 'BRL', 'ARS'].includes(parts[0].toUpperCase())) {
      return parts.slice(1).join(':');
    }
    return symbol;
  }

  static async fetchStockPrice(symbol: string): Promise<number | null> {
    let querySym = symbol.toUpperCase().trim();
    if (querySym === 'S&P500' || querySym === 'SP500') querySym = 'SPY';
    if (querySym === 'STBUX') querySym = 'SBUX';
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${querySym}.BA`;

    try {
      const res = await fetch(targetUrl);
      if (res.ok) {
        const data = await res.json();
        if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
          return Number(data.chart.result[0].meta.regularMarketPrice);
        }
      }
    } catch (e) {
      try {
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
            return Number(data.chart.result[0].meta.regularMarketPrice);
          }
        }
      } catch (e2) {
        try {
          const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
              return Number(data.chart.result[0].meta.regularMarketPrice);
            }
          }
        } catch (e3) {}
      }
    }
    return null;
  }

  static async fetchCryptoPrices(symbols: string[]): Promise<Record<string, number>> {
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
      return {};
    }
  }

  static async fetchExchangeRate(): Promise<number> {
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/ccl');
      if (res.ok) {
        const data = await res.json();
        if (data?.venta) return Number(data.venta);
      }
    } catch (e) {}
    return 1350; // Fallback
  }

  static async fetchAdditionalRates(): Promise<{ eur: number; brl: number; btc: number; eth: number }> {
    let eur = 1400;
    let brl = 240;
    let btc = 65000;
    let eth = 3500;

    try {
      const resEur = await fetch('https://dolarapi.com/v1/dolares/euro');
      if (resEur.ok) {
        const data = await resEur.json();
        if (data?.venta) eur = Number(data.venta);
      }
    } catch (e) {}

    try {
      const resBrl = await fetch('https://open.er-api.com/v6/latest/BRL');
      if (resBrl.ok) {
        const data = await resBrl.json();
        if (data?.rates?.ARS) brl = Number(data.rates.ARS);
      }
    } catch (e) {}

    try {
      const resCrypto = await fetch('https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH&tsyms=USD');
      if (resCrypto.ok) {
        const data = await resCrypto.json();
        if (data?.BTC?.USD) btc = Number(data.BTC.USD);
        if (data?.ETH?.USD) eth = Number(data.ETH.USD);
      }
    } catch (e) {}

    return { eur, brl, btc, eth };
  }

  static async getAssets(userId: string): Promise<Asset[]> {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  }

  static async saveAsset(userId: string, payload: Omit<Asset, 'id'> & { id?: string }) {
    const dbPayload = {
      user_id: userId,
      name: payload.name,
      symbol: payload.symbol,
      type: payload.type,
      quantity: payload.quantity,
      average_buy_price: payload.average_buy_price
    };

    if (payload.id) {
      const { error } = await supabase
        .from('assets')
        .update(dbPayload)
        .eq('id', payload.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('assets')
        .insert(dbPayload);
      if (error) throw error;
    }
  }

  static async deleteAsset(id: string): Promise<void> {
    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
