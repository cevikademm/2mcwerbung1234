/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

// Configuration - API keys loaded from environment variables only
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- CENTRALIZED LOGGING SYSTEM ---

/**
 * Logs an action to the audit_logs table.
 * Does not throw errors to prevent breaking the main application flow.
 */
export async function logAction(
    actionType: 'INSERT' | 'UPDATE' | 'DELETE' | 'ERROR' | 'LOGIN',
    module: string,
    details: any,
    status: 'SUCCESS' | 'FAILURE',
    errorMessage?: string,
    userEmail?: string
) {
    try {
        const payload = {
            action_type: actionType,
            module: module,
            details: details ? JSON.stringify(details) : null,
            status: status,
            error_message: errorMessage || null,
            user_email: userEmail || 'system'
        };
        await supabase.from('audit_logs').insert([payload]);
    } catch (e) {
        // Fire and forget logging fail - do not stop the app
        console.warn("Audit Log Write Failed (Non-Critical):", e);
    }
}

export async function fetchAuditLogs() {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100); // Fetch last 100 logs
    
    if (error) return [];
    return data || [];
}

export function subscribeToAuditLogs(onEvent: (payload: any) => void): RealtimeChannel {
    const channelName = 'room:audit_logs';
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload) => { onEvent(payload); }
      )
      .subscribe();
      
    return channel;
}


// --- AUTHENTICATION ---

const ADMIN_EMAILS = ['cevikademm@gmail.com', 'mete@mail.com', 'elif@mail.com'];

export async function loginUser(email: string, password: string): Promise<{ success: boolean, user?: any, error?: string }> {
  try {
    // 1. Check if Admin
    if (ADMIN_EMAILS.includes(email)) {
      const settings = await fetchAppSettings();
      const adminPass = settings?.admin_password || '123456';
      
      if (password === adminPass) {
        await logAction('LOGIN', 'Auth', { email, role: 'admin' }, 'SUCCESS', undefined, email);
        return { 
          success: true, 
          user: { 
            id: 'admin-' + email, 
            email: email, 
            name: email.split('@')[0], // Simple name extraction 
            role: 'admin' 
          } 
        };
      } else {
        await logAction('LOGIN', 'Auth', { email }, 'FAILURE', 'Wrong password', email);
        return { success: false, error: 'Hatalı şifre' };
      }
    }

    // 2. Check if Employee
    const { data: employee, error } = await supabase
      .from('employees')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !employee) {
      await logAction('LOGIN', 'Auth', { email }, 'FAILURE', 'User not found or wrong password', email);
      return { success: false, error: 'Kullanıcı bulunamadı veya şifre yanlış' };
    }

    await logAction('LOGIN', 'Auth', { email, role: 'employee' }, 'SUCCESS', undefined, email);
    return { 
      success: true, 
      user: { 
        id: employee.id, 
        email: employee.email, 
        name: employee.name, 
        role: 'employee',
        hourlyRate: employee.hourly_rate,
        taxClass: employee.tax_class
      } 
    };

  } catch (e: any) {
    await logAction('ERROR', 'Auth', { email }, 'FAILURE', e.message);
    return { success: false, error: 'Giriş yapılamadı' };
  }
}

export async function updateUserPassword(userId: string, role: 'admin' | 'employee', newPass: string) {
  try {
      if (role === 'admin') {
        const { error } = await supabase.from('app_settings').update({ admin_password: newPass }).neq('id', '00000000-0000-0000-0000-000000000000'); 
        if (error) throw error;
      } else {
        const { error } = await supabase.from('employees').update({ password: newPass }).eq('id', userId);
        if (error) throw error;
      }
      await logAction('UPDATE', 'Settings', { userId, role }, 'SUCCESS', undefined, userId);
  } catch (e: any) {
      await logAction('ERROR', 'Settings', { userId, role }, 'FAILURE', e.message, userId);
      throw e;
  }
}

// --- APP SETTINGS ---

export async function fetchAppSettings() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') {
      console.log("Ayarlar tablosu başlatılıyor...");
      const { data: newData, error: insertError } = await supabase
        .from('app_settings')
        .insert([{
          total_credits: 100,
          salary_approved: '0.00',
          salary_pending_count: 0,
          admin_password: '123456'
        }])
        .select()
        .single();

      if (insertError) return { total_credits: 100, salary_approved: '0.00', salary_pending_count: 0, admin_password: '123456' };
      return newData;
    }

    if (error) return null;
    return data;
  } catch (error) {
    return null;
  }
}

export function subscribeToAppSettings(onUpdate: (payload: any) => void): RealtimeChannel {
  const channelName = 'room:app_settings';
  const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
  if (existing) supabase.removeChannel(existing);

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_settings' },
      (payload) => { 
          if (payload.new) onUpdate(payload.new); 
      }
    )
    .subscribe();
    
  return channel;
}

// --- INVOICES ---

export async function saveInvoiceToSupabase(metadata: any, html: string) {
  if (!metadata) return { success: false, error: "Veri yok" };
  try {
    const payload = {
          invoice_no: metadata.invoice_no ? String(metadata.invoice_no) : null,
          invoice_date: metadata.date ? String(metadata.date) : null,
          supplier: metadata.supplier ? String(metadata.supplier) : null,
          description: metadata.description ? String(metadata.description) : null,
          amount: metadata.amount ? String(metadata.amount) : null,
          currency: metadata.currency ? String(metadata.currency) : null,
          tax_id: metadata.tax_id ? String(metadata.tax_id) : null,
          iban: metadata.iban ? String(metadata.iban) : null,
          tax_amount: metadata.tax_amount ? String(metadata.tax_amount) : null,
          transaction_type: metadata.transaction_type ? String(metadata.transaction_type) : 'GİDER',
          html_view: html || ""
    };

    const { data, error } = await supabase.from('invoices').insert([payload]).select();
    
    if (error) {
        await logAction('INSERT', 'Invoices', payload, 'FAILURE', error.message);
        return { success: false, error: error.message };
    }

    // AUTOMATICALLY SAVE TO ACCOUNTS (Cari Hesaplar)
    if (payload.supplier) {
        // Upsert: Create if not exists, update tax_id if exists
        await supabase.from('accounts').upsert(
            { 
                name: payload.supplier, 
                tax_id: payload.tax_id || null 
            }, 
            { onConflict: 'name' }
        );
    }

    // IMPORTANT: Wait for log action to ensure it's written
    await logAction('INSERT', 'Invoices', { id: data[0].id, invoice_no: payload.invoice_no }, 'SUCCESS');
    
    return { success: true, data };

  } catch (err: any) {
    await logAction('ERROR', 'Invoices', metadata, 'FAILURE', err.message);
    return { success: false, error: err.message || "Beklenmeyen hata" };
  }
}

export async function deleteInvoice(id: string) {
  try {
      // 1. Fetch details first for logging
      const { data: item } = await supabase.from('invoices').select('*').eq('id', id).single();
      
      // 2. Perform Delete
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) {
          console.error("FATURA SİLME HATASI", error);
          await logAction('DELETE', 'Invoices', { id }, 'FAILURE', error.message);
          throw error;
      }
      
      // 3. Log Success with details
      const summary = item ? `No: ${item.invoice_no}, Tutar: ${item.amount}, Tarih: ${item.invoice_date}` : 'Detay alınamadı';
      await logAction('DELETE', 'Invoices', { id, deleted_data: summary }, 'SUCCESS');
  } catch (e: any) {
      await logAction('ERROR', 'Invoices', { id }, 'FAILURE', e.message);
      throw e;
  }
}

export async function fetchInvoices() {
  try {
    const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  } catch (error) {
    return [];
  }
}

export function subscribeToInvoices(onEvent: (payload: any) => void): RealtimeChannel {
  const channelName = 'room:invoices';
  // Ensure we clean up any existing channel with the same name to avoid duplicates
  const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
  if (existing) supabase.removeChannel(existing);

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'invoices' },
      (payload) => { onEvent(payload); }
    )
    .subscribe();
    
  return channel;
}

// --- ACCOUNTS (CARI HESAPLAR) ---

export async function fetchAccounts() {
  const { data, error } = await supabase.from('accounts').select('*').order('name', { ascending: true });
  if (error) {
      return [];
  }
  return data || [];
}

export async function deleteAccount(id: string) {
    try {
        // 1. Fetch details
        const { data: item } = await supabase.from('accounts').select('*').eq('id', id).single();

        // 2. Delete
        const { error } = await supabase.from('accounts').delete().eq('id', id);
        if (error) {
            await logAction('DELETE', 'Accounts', { id }, 'FAILURE', error.message);
            throw error;
        }

        // 3. Log
        const summary = item ? `Firma: ${item.name}, VKN: ${item.tax_id}` : 'Bilinmeyen Firma';
        await logAction('DELETE', 'Accounts', { id, deleted_data: summary }, 'SUCCESS');
    } catch (e: any) {
        await logAction('ERROR', 'Accounts', { id }, 'FAILURE', e.message);
        throw e;
    }
}

export function subscribeToAccounts(onEvent: (payload: any) => void): RealtimeChannel {
    const channelName = 'room:accounts';
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'accounts' },
      (payload) => { onEvent(payload); }
    )
    .subscribe();
    
    return channel;
}


// --- LOCATIONS (ÇALIŞMA YERLERİ) ---

export async function fetchLocations(): Promise<{ id: string; name: string }[]> {
    try {
        const { data, error } = await supabase.from('locations').select('id, name').order('name', { ascending: true });
        if (error) return [];
        return data || [];
    } catch { return []; }
}

export async function upsertLocation(name: string): Promise<void> {
    try {
        await supabase.from('locations').upsert({ name: name.trim() }, { onConflict: 'name' });
    } catch { /* non-critical */ }
}

export async function deleteLocation(id: string): Promise<void> {
    await supabase.from('locations').delete().eq('id', id);
}

export function subscribeToLocations(onEvent: (payload: any) => void): import('@supabase/supabase-js').RealtimeChannel {
    const channelName = 'room:locations';
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);
    return supabase.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, onEvent)
        .subscribe();
}

// --- EMPLOYEES (PERSONEL) ---

export async function fetchEmployees() {
  const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: true });
  if (error) console.error("Error fetching employees:", error);
  return data || [];
}

export async function saveEmployee(employee: any) {
  try {
      const { id, ...rest } = employee; 
      const payload = { ...rest, password: '123456' };
      const { data, error } = await supabase.from('employees').insert([payload]).select().single();
      
      if (error) {
          await logAction('INSERT', 'Employees', payload, 'FAILURE', error.message);
          throw error;
      }
      
      await logAction('INSERT', 'Employees', { name: payload.name }, 'SUCCESS');
      return data;
  } catch (e: any) {
      await logAction('ERROR', 'Employees', employee, 'FAILURE', e.message);
      throw e;
  }
}

export async function updateEmployee(id: string, updates: any) {
  try {
      const { error } = await supabase.from('employees').update(updates).eq('id', id);
      if (error) {
          await logAction('UPDATE', 'Employees', { id, ...updates }, 'FAILURE', error.message);
          throw error;
      }
      await logAction('UPDATE', 'Employees', { id, updates }, 'SUCCESS');
  } catch (e: any) {
      await logAction('ERROR', 'Employees', { id }, 'FAILURE', e.message);
      throw e;
  }
}

export async function deleteEmployee(id: string) {
  try {
      // Fetch details first
      const { data: item } = await supabase.from('employees').select('name').eq('id', id).single();

      // Manual Cascade: First delete work logs
      const { error: logError } = await supabase.from('work_logs').delete().eq('employee_id', id);
      if (logError) {
          await logAction('DELETE', 'Employees (Cascade Logs)', { id }, 'FAILURE', logError.message);
          throw logError;
      }
      
      // Then delete employee
      const { error } = await supabase.from('employees').delete().eq('id', id);
      
      if (error) {
          await logAction('DELETE', 'Employees', { id }, 'FAILURE', error.message);
          console.error("PERSONEL SİLME HATASI", error);
          throw error;
      }
      
      await logAction('DELETE', 'Employees', { id, deleted_name: item?.name }, 'SUCCESS');
  } catch (e: any) {
      await logAction('ERROR', 'Employees', { id }, 'FAILURE', e.message);
      throw e;
  }
}

export function subscribeToEmployees(onEvent: (payload: any) => void): RealtimeChannel {
    const channelName = 'room:employees';
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'employees' },
      (payload) => { onEvent(payload); }
    )
    .subscribe();
    
    return channel;
}

// --- WORK LOGS (SAAT GİRİŞLERİ) ---

export async function fetchWorkLogs() {
  const { data, error } = await supabase.from('work_logs').select('*').order('date', { ascending: false });
  if (error) console.error("Error fetching work logs:", error);
  return data || [];
}

export async function saveWorkLog(log: any) {
  try {
      const payload = {
          employee_id: log.employeeId,
          date: log.date,
          start_time: log.startTime,
          end_time: log.endTime,
          break_minutes: log.breakMinutes,
          net_hours: log.netHours,
          location: log.location,
          description: log.description,
          status: 'pending'
      };
      
      const { data, error } = await supabase.from('work_logs').insert([payload]).select().single();
      if (error) {
          await logAction('INSERT', 'WorkLogs', payload, 'FAILURE', error.message);
          throw error;
      }
      
      await logAction('INSERT', 'WorkLogs', { employeeId: log.employeeId, date: log.date }, 'SUCCESS');
      return data;
  } catch (e: any) {
      await logAction('ERROR', 'WorkLogs', log, 'FAILURE', e.message);
      throw e;
  }
}

export async function updateWorkLog(id: string, updates: Partial<{ date: string; start_time: string; end_time: string; break_minutes: number; net_hours: number; location: string; description: string; employee_id: string }>) {
    try {
        const { error } = await supabase.from('work_logs').update(updates).eq('id', id);
        if (error) {
            await logAction('UPDATE', 'WorkLogs', { id, updates }, 'FAILURE', error.message);
            throw error;
        }
        await logAction('UPDATE', 'WorkLogs', { id, updates }, 'SUCCESS');
    } catch (e: any) {
        await logAction('ERROR', 'WorkLogs', { id }, 'FAILURE', e.message);
        throw e;
    }
}

export async function updateWorkLogStatus(id: string, status: 'approved' | 'rejected') {
  try {
      const { data, error } = await supabase
        .from('work_logs')
        .update({ status: status })
        .eq('id', id)
        .select()
        .single();
        
      if (error) {
          await logAction('UPDATE', 'WorkLogs', { id, status }, 'FAILURE', error.message);
          throw error;
      }
      
      await logAction('UPDATE', 'WorkLogs', { id, status }, 'SUCCESS');
      return data;
  } catch (e: any) {
      await logAction('ERROR', 'WorkLogs', { id, status }, 'FAILURE', e.message);
      throw e;
  }
}

export async function deleteWorkLog(id: string) {
    try {
        // Fetch details
        const { data: item } = await supabase.from('work_logs').select('date, net_hours').eq('id', id).single();
        
        // Delete
        const { error } = await supabase.from('work_logs').delete().eq('id', id);
        if (error) {
            await logAction('DELETE', 'WorkLogs', { id }, 'FAILURE', error.message);
            throw error;
        }
        
        const summary = item ? `Tarih: ${item.date}, Süre: ${item.net_hours}s` : 'Bilinmiyor';
        await logAction('DELETE', 'WorkLogs', { id, summary }, 'SUCCESS');
    } catch (e: any) {
        await logAction('ERROR', 'WorkLogs', { id }, 'FAILURE', e.message);
        throw e;
    }
}

export function subscribeToWorkLogs(onEvent: (payload: any) => void): RealtimeChannel {
  const channelName = 'room:work_logs';
  const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
  if (existing) supabase.removeChannel(existing);

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'work_logs' },
      (payload) => { onEvent(payload); }
    )
    .subscribe();
    
  return channel;
}

// --- ADVANCES (AVANSLAR) ---

export async function fetchAdvances() {
    const { data, error } = await supabase.from('advances').select('*').order('date', { ascending: false });
    if (error) return [];
    return data || [];
}

export async function saveAdvance(advance: { employee_id: string, amount: number, date: string, description?: string }) {
    const { data, error } = await supabase.from('advances').insert([advance]).select().single();
    if(error) {
        await logAction('INSERT', 'Advances', advance, 'FAILURE', error.message);
        throw error;
    }
    await logAction('INSERT', 'Advances', { empId: advance.employee_id, amount: advance.amount }, 'SUCCESS');
    return data;
}

export async function deleteAdvance(id: string) {
    const { error } = await supabase.from('advances').delete().eq('id', id);
    if(error) throw error;
}

export function subscribeToAdvances(onEvent: (payload: any) => void): RealtimeChannel {
    const channelName = 'room:advances';
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'advances' },
        (payload) => { onEvent(payload); }
      )
      .subscribe();
      
    return channel;
}

// --- TASKS (GÖREV TAKİP) ---

export async function fetchTasks() {
    // Sort by DUE DATE ascending (earliest first)
    // ADDED LIMIT to ensure all old data is retrieved (default is 1000, setting to 5000)
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('due_date', { ascending: true })
        .limit(5000); 
        
    if (error) {
        console.error("Error fetching tasks:", error);
        return [];
    }
    return data || [];
}

export async function saveTask(task: any) {
    try {
        const payload = {
            title: task.title,
            description: task.description,
            employee_id: task.employeeId,
            start_date: task.startDate,
            due_date: task.dueDate,
            priority: task.priority,
            status: task.status || 'pending',
            progress: task.progress || 0,
            steps: task.steps || [] // Support for sub-tasks
        };
        const { data, error } = await supabase.from('tasks').insert([payload]).select().single();
        if (error) {
             await logAction('INSERT', 'Tasks', payload, 'FAILURE', error.message);
             throw error;
        }
        await logAction('INSERT', 'Tasks', { title: task.title }, 'SUCCESS');
        return data;
    } catch (e: any) {
        throw e;
    }
}

export async function updateTask(id: string, updates: any) {
    try {
        const { error } = await supabase.from('tasks').update(updates).eq('id', id);
        if (error) {
             await logAction('UPDATE', 'Tasks', { id, updates }, 'FAILURE', error.message);
             throw error;
        }
        await logAction('UPDATE', 'Tasks', { id, updates }, 'SUCCESS');
    } catch (e: any) {
        throw e;
    }
}

export async function deleteTask(id: string) {
    try {
        const { data: item } = await supabase.from('tasks').select('title').eq('id', id).single();
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (error) {
             await logAction('DELETE', 'Tasks', { id }, 'FAILURE', error.message);
             throw error;
        }
        await logAction('DELETE', 'Tasks', { id, title: item?.title }, 'SUCCESS');
    } catch (e: any) {
        throw e;
    }
}

export function subscribeToTasks(onEvent: (payload: any) => void): RealtimeChannel {
    const channelName = 'room:tasks';
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);
  
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => { onEvent(payload); }
      )
      .subscribe();
      
    return channel;
}

// --- CALENDAR EVENTS (TAKVİM) ---

export async function fetchCalendarEvents() {
    const { data, error } = await supabase.from('calendar_events').select('*').order('start_time', { ascending: true });
    if (error) return [];
    return data || [];
}

export async function saveCalendarEvent(event: any) {
    try {
        const payload = {
            title: event.title,
            description: event.description,
            start_time: event.startTime,
            end_time: event.endTime,
            type: event.type,
            created_by: event.createdBy,
            location: event.location,
            attendees: event.attendees || [] // Array of employee IDs
        };
        const { data, error } = await supabase.from('calendar_events').insert([payload]).select().single();
        if(error) {
            await logAction('INSERT', 'Calendar', payload, 'FAILURE', error.message);
            throw error;
        }
        await logAction('INSERT', 'Calendar', { title: event.title }, 'SUCCESS');
        return data;
    } catch (e: any) { throw e; }
}

export async function updateCalendarEvent(id: string, updates: any) {
    try {
        // Map camelCase to snake_case for DB if needed, mostly handled by partial objects
        const payload: any = {};
        if(updates.title) payload.title = updates.title;
        if(updates.description) payload.description = updates.description;
        if(updates.startTime) payload.start_time = updates.startTime;
        if(updates.endTime) payload.end_time = updates.endTime;
        if(updates.type) payload.type = updates.type;
        if(updates.location) payload.location = updates.location;
        if(updates.attendees) payload.attendees = updates.attendees;

        const { error } = await supabase.from('calendar_events').update(payload).eq('id', id);
        if(error) {
            await logAction('UPDATE', 'Calendar', { id, updates }, 'FAILURE', error.message);
            throw error;
        }
        await logAction('UPDATE', 'Calendar', { id, updates }, 'SUCCESS');
    } catch (e: any) { throw e; }
}

export async function deleteCalendarEvent(id: string) {
    try {
        const { data: item } = await supabase.from('calendar_events').select('title').eq('id', id).single();
        const { error } = await supabase.from('calendar_events').delete().eq('id', id);
        if (error) {
             await logAction('DELETE', 'Calendar', { id }, 'FAILURE', error.message);
             throw error;
        }
        await logAction('DELETE', 'Calendar', { id, title: item?.title }, 'SUCCESS');
    } catch(e: any) { throw e; }
}

export function subscribeToCalendarEvents(onEvent: (payload: any) => void): RealtimeChannel {
    const channelName = 'room:calendar_events';
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events' },
        (payload) => { onEvent(payload); }
      )
      .subscribe();
      
    return channel;
}