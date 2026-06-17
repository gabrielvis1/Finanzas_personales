import { supabase } from '../supabase';

export interface Transaction {
  id: string;
  name: string;
  amount: number;
  type: 'income' | 'expense';
  payment_method: string;
  category: string;
  date: string;
  description?: string;
}

export class TransactionService {
  static async getTransactionsByDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, name, amount, type, payment_method, category, date, description')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (error) throw error;
    return data || [];
  }

  static async saveTransaction(userId: string, payload: Omit<Transaction, 'id'> & { id?: string }) {
    const dbPayload = {
      user_id: userId,
      name: payload.name,
      amount: payload.amount,
      type: payload.type,
      payment_method: payload.payment_method,
      category: payload.category,
      date: payload.date || new Date().toISOString(),
      description: payload.description
    };

    if (payload.id) {
      const { error } = await supabase
        .from('transactions')
        .update(dbPayload)
        .eq('id', payload.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('transactions')
        .insert(dbPayload);
      if (error) throw error;
    }
  }

  static async deleteTransaction(id: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
