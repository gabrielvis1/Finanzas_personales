import { supabase } from '../supabase';

export interface CreditLine {
  id: string;
  name: string;
  type: 'credit_card' | 'loan';
  limit_amount: number | null;
  cut_off_day: number | null;
  payment_due_day: number | null;
  icon: string | null;
}

export class CreditLineService {
  static async getCreditLines(userId: string): Promise<CreditLine[]> {
    const { data, error } = await supabase
      .from('credit_lines')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async saveCreditLine(userId: string, payload: Omit<CreditLine, 'id'> & { id?: string | null }) {
    const dbPayload = {
      user_id: userId,
      name: payload.name,
      type: payload.type,
      limit_amount: payload.limit_amount,
      cut_off_day: payload.cut_off_day,
      payment_due_day: payload.payment_due_day,
      icon: payload.icon
    };

    if (payload.id) {
      const { error } = await supabase
        .from('credit_lines')
        .update(dbPayload)
        .eq('id', payload.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('credit_lines')
        .insert(dbPayload);
      if (error) throw error;
    }
  }

  static async deleteCreditLine(id: string): Promise<void> {
    const { error } = await supabase
      .from('credit_lines')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  static async getPendingInstallments(userId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('debt_installments')
      .select('*, credit_lines(name, type)')
      .eq('user_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return data || [];
  }

  static async getInstallmentsByMonth(userId: string, month: number, year: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('debt_installments')
      .select('amount')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year);
    if (error) throw error;
    return data || [];
  }
}

