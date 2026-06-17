import { supabase } from '../supabase';

export interface Budget {
  id: string;
  category: string;
  section: string;
  limit_amount: number;
  percentage: number | null;
  spent_amount: number;
  due_day: number | null;
  month: number;
  year: number;
  row_color: string | null;
  icon: string | null;
  order_index: number;
  is_debt?: boolean;
  debt_status?: string;
  credit_limit?: number;
  credit_used?: number;
  shared_budget_id?: string | null;
  installments?: any[];
}

export interface SharedBudget {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface SharedBudgetMember {
  id: string;
  shared_budget_id: string;
  user_id: string;
  role: string;
  profiles?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
  };
}

export class BudgetService {
  static async getBudgets(
    userId: string, 
    currentMonth: number, 
    currentYear: number, 
    totalIncome: number,
    sharedBudgetId?: string | null
  ): Promise<Budget[]> {
    const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59).toISOString();

    let budgetsQuery = supabase
      .from('budgets')
      .select('*')
      .eq('month', currentMonth + 1)
      .eq('year', currentYear);
      
    if (sharedBudgetId) {
      budgetsQuery = budgetsQuery.eq('shared_budget_id', sharedBudgetId);
    } else {
      budgetsQuery = budgetsQuery.eq('user_id', userId).is('shared_budget_id', null);
    }
    
    const { data: budgetData, error: budgetError } = await budgetsQuery.order('order_index', { ascending: true });

    if (budgetError) throw budgetError;

    let txQuery = supabase
      .from('transactions')
      .select('type, category, amount')
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);
      
    if (sharedBudgetId) {
      txQuery = txQuery.eq('shared_budget_id', sharedBudgetId);
    } else {
      txQuery = txQuery.eq('user_id', userId).is('shared_budget_id', null);
    }

    const { data: txData, error: txError } = await txQuery;

    if (txError) throw txError;

    const spentByCategory: Record<string, number> = {};
    txData?.forEach((tx) => {
      if (tx.type === 'expense') {
        const cat = tx.category.toLowerCase().trim();
        spentByCategory[cat] = (spentByCategory[cat] || 0) + Number(tx.amount);

        if (!sharedBudgetId && (cat.startsWith('pago: ') || cat === 'pago de deuda' || cat === 'deudas / créditos' || cat === 'deudas / creditos' || cat === 'créditos' || cat === 'creditos')) {
          const commonDebtCats = ['pago de deuda', 'pago de deudas', 'deudas', 'deuda', 'créditos', 'creditos', 'pago de deuda', 'pago de deudas', 'deudas / créditos', 'deudas / creditos', 'créditos', 'creditos'];
          commonDebtCats.forEach(c => {
            spentByCategory[c] = (spentByCategory[c] || 0) + Number(tx.amount);
          });
        }
      }
    });

    let fixIndex = 10;
    const mapped = budgetData?.map(b => {
      let calcLimit = Number(b.limit_amount);
      if (b.percentage) {
        calcLimit = (Number(b.percentage) / 100) * totalIncome;
      }

      return {
        id: b.id,
        category: b.category,
        section: b.section || 'General',
        limit_amount: calcLimit,
        percentage: b.percentage ? Number(b.percentage) : null,
        due_day: b.due_day,
        month: b.month,
        year: b.year,
        row_color: b.row_color,
        icon: b.icon,
        order_index: b.order_index === 0 ? (fixIndex++) : b.order_index,
        spent_amount: spentByCategory[b.category.toLowerCase().trim()] || 0,
        shared_budget_id: b.shared_budget_id
      };
    }) || [];

    if (sharedBudgetId) {
      // Los presupuestos compartidos no tienen deudas personales
      return mapped;
    }

    const { data: debtData, error: debtError } = await supabase
      .from('debt_installments')
      .select('*, credit_lines(name, limit_amount)')
      .eq('user_id', userId)
      .eq('month', currentMonth + 1)
      .eq('year', currentYear);

    if (debtError) throw debtError;

    const { data: allPendingDebt } = await supabase
      .from('debt_installments')
      .select('credit_line_id, amount')
      .eq('user_id', userId)
      .eq('status', 'pending');

    const usedByCreditLine: Record<string, number> = {};
    allPendingDebt?.forEach(d => {
      if (d.credit_line_id) {
        usedByCreditLine[d.credit_line_id] = (usedByCreditLine[d.credit_line_id] || 0) + Number(d.amount);
      }
    });

    // Agrupar cuotas por credit_line_id
    const groups: Record<string, {
      creditLineName: string;
      limit: number;
      used: number;
      installments: any[];
    }> = {};

    debtData?.forEach((d: any) => {
      const clId = d.credit_line_id || 'others';
      if (!groups[clId]) {
        groups[clId] = {
          creditLineName: d.credit_lines?.name || (d.credit_line_id ? 'Crédito' : 'Otros Créditos'),
          limit: d.credit_lines ? Number(d.credit_lines.limit_amount || 0) : 0,
          used: d.credit_line_id ? (usedByCreditLine[d.credit_line_id] || 0) : 0,
          installments: []
        };
      }
      groups[clId].installments.push({
        id: d.id,
        description: d.description,
        amount: Number(d.amount),
        installment_number: d.installment_number,
        total_installments: d.total_installments,
        status: d.status,
        month: d.month,
        year: d.year
      });
    });

    const debtMapped = Object.keys(groups).map((clId) => {
      const g = groups[clId];
      const totalLimit = g.installments.reduce((sum, inst) => sum + inst.amount, 0);
      const totalSpent = g.installments.reduce((sum, inst) => sum + (inst.status === 'paid' ? inst.amount : 0), 0);
      const allPaid = g.installments.every(inst => inst.status === 'paid');

      return {
        id: `debt_group_${clId}`,
        category: g.creditLineName,
        section: 'CRÉDITOS',
        limit_amount: totalLimit,
        percentage: null,
        due_day: null,
        month: currentMonth + 1,
        year: currentYear,
        row_color: '#78350F',
        icon: 'credit-card',
        order_index: 999,
        spent_amount: totalSpent,
        is_debt: true,
        debt_status: allPaid ? 'paid' : 'pending',
        credit_limit: g.limit,
        credit_used: g.used,
        installments: g.installments
      };
    });

    return [...mapped, ...debtMapped];
  }

  static async saveBudget(userId: string, payload: Omit<Budget, 'id' | 'spent_amount'> & { id?: string }) {
    const dbPayload = {
      user_id: userId,
      category: payload.category,
      section: payload.section,
      limit_amount: payload.limit_amount,
      percentage: payload.percentage,
      due_day: payload.due_day,
      order_index: payload.order_index,
      month: payload.month,
      year: payload.year,
      row_color: payload.row_color || null,
      icon: payload.icon || null,
      shared_budget_id: payload.shared_budget_id || null,
      start_date: new Date(payload.year, payload.month - 1, 1).toISOString(),
      end_date: new Date(payload.year, payload.month, 0).toISOString()
    };

    if (payload.id) {
      const { error } = await supabase
        .from('budgets')
        .update(dbPayload)
        .eq('id', payload.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('budgets')
        .insert(dbPayload);
      if (error) throw error;
    }
  }

  static async deleteBudget(id: string): Promise<void> {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  static async clonePreviousMonth(
    userId: string, 
    currentMonth: number, 
    currentYear: number, 
    sharedBudgetId?: string | null
  ): Promise<void> {
    let prevM = currentMonth - 1;
    let prevY = currentYear;
    if (prevM < 0) { prevM = 11; prevY--; }

    let query = supabase
      .from('budgets')
      .select('category, section, limit_amount, percentage, due_day, row_color, icon, order_index')
      .eq('month', prevM + 1)
      .eq('year', prevY);
      
    if (sharedBudgetId) {
      query = query.eq('shared_budget_id', sharedBudgetId);
    } else {
      query = query.eq('user_id', userId).is('shared_budget_id', null);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No hay datos en el mes anterior para clonar.');
    }

    const newBudgets = data.map(b => ({
      user_id: userId,
      category: b.category,
      section: b.section,
      limit_amount: b.limit_amount,
      percentage: b.percentage,
      due_day: b.due_day,
      row_color: b.row_color,
      icon: b.icon,
      order_index: b.order_index,
      month: currentMonth + 1,
      year: currentYear,
      shared_budget_id: sharedBudgetId || null,
      start_date: new Date(currentYear, currentMonth, 1).toISOString(),
      end_date: new Date(currentYear, currentMonth + 1, 0).toISOString()
    }));

    const { error: insertError } = await supabase.from('budgets').insert(newBudgets);
    if (insertError) throw insertError;
  }

  static async markDebtPaid(userId: string, budget: Budget): Promise<void> {
    const actualId = budget.id.replace('debt_', '');
    await this.markInstallmentPaid(userId, actualId, budget.category, budget.limit_amount);
  }

  static async markInstallmentPaid(userId: string, installmentId: string, description: string, amount: number): Promise<void> {
    const { error: updateError } = await supabase
      .from('debt_installments')
      .update({ status: 'paid' })
      .eq('id', installmentId);

    if (updateError) throw updateError;

    const { error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        name: description,
        amount: amount,
        type: 'expense',
        category: 'CRÉDITOS',
        payment_method: 'debit',
        date: new Date().toISOString()
      });

    if (insertError) throw insertError;
  }

  static async updateOrderIndex(id: string, index: number): Promise<void> {
    await supabase.from('budgets').update({ order_index: index }).eq('id', id);
  }

  // --- MÉTODOS DE PRESUPUESTOS COMPARTIDOS ---

  static async getSharedBudgets(userId: string): Promise<SharedBudget[]> {
    try {
      const { data: memberData, error: memberError } = await supabase
        .from('shared_budget_members')
        .select('shared_budget_id')
        .eq('user_id', userId);
      
      if (memberError) throw memberError;
      if (!memberData || memberData.length === 0) return [];
      
      const ids = memberData.map(m => m.shared_budget_id);
      
      const { data, error } = await supabase
        .from('shared_budgets')
        .select('*')
        .in('id', ids);
        
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('Error fetching shared budgets:', e);
      return [];
    }
  }

  static async createSharedBudget(userId: string, name: string): Promise<SharedBudget> {
    const { data: group, error: groupError } = await supabase
      .from('shared_budgets')
      .insert({ name, created_by: userId })
      .select('*')
      .single();
      
    if (groupError) throw groupError;
    
    const { error: memberError } = await supabase
      .from('shared_budget_members')
      .insert({
        shared_budget_id: group.id,
        user_id: userId,
        role: 'owner'
      });
      
    if (memberError) throw memberError;
    return group;
  }

  static async getSharedBudgetMembers(sharedBudgetId: string): Promise<SharedBudgetMember[]> {
    const { data, error } = await supabase
      .from('shared_budget_members')
      .select('*, profiles:user_id(id, username, full_name, avatar_url)')
      .eq('shared_budget_id', sharedBudgetId);
      
    if (error) throw error;
    
    // Mapear de forma segura la relación profiles
    return (data || []).map((m: any) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        ...m,
        profiles: profile
      };
    });
  }

  static async addMemberToSharedBudget(sharedBudgetId: string, username: string): Promise<void> {
    const cleanUsername = username.trim().replace(/^@/, '');
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .single();
      
    if (profileError || !profile) {
      throw new Error('Usuario no encontrado. Asegúrate de ingresar el handle correcto.');
    }
    
    const { error } = await supabase
      .from('shared_budget_members')
      .insert({
        shared_budget_id: sharedBudgetId,
        user_id: profile.id,
        role: 'member'
      });
      
    if (error) throw error;
  }

  static async removeMemberFromSharedBudget(sharedBudgetId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('shared_budget_members')
      .delete()
      .eq('shared_budget_id', sharedBudgetId)
      .eq('user_id', userId);
      
    if (error) throw error;
  }
}
