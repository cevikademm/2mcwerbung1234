/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useMemo } from 'react';
import TubesBackground from './components/TubesBackground';
import { 
  fetchEmployees,
  saveEmployee,
  updateEmployee,
  deleteEmployee,
  fetchWorkLogs,
  saveWorkLog,
  deleteWorkLog,
  loginUser,
  updateUserPassword,
  updateWorkLogStatus,
  fetchTasks,
  saveTask,
  updateTask,
  deleteTask,
  fetchCalendarEvents,
  saveCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  fetchAdvances,
  saveAdvance,
  deleteAdvance,
  updateWorkLog,
  fetchLocations,
  upsertLocation,
  deleteLocation,
  subscribeToLocations,
  subscribeToWorkLogs,
  subscribeToEmployees,
  subscribeToAdvances
} from './services/supabaseClient';
import { 
  UsersIcon, 
  BanknotesIcon, 
  PencilSquareIcon, 
  ArrowLeftOnRectangleIcon,
  XMarkIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  XCircleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  Cog6ToothIcon,
  ClipboardDocumentCheckIcon,
  CalendarDaysIcon,
  Squares2X2Icon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  UserCircleIcon,
  EnvelopeIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

type ViewType = 'panel' | 'salary' | 'settings' | 'tasks' | 'calendar' | 'messages';
type SalaryTab = 'employees' | 'hours' | 'payroll' | 'costs' | 'records';
type UserRole = 'admin' | 'employee';

// --- MESSAGING INTERFACES ---
interface MessageReply {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: string;
    isAdmin: boolean;
}

interface Message {
    id: string;
    senderId: string;
    senderName: string;
    subject: string;
    content: string;
    timestamp: string;
    isRead: boolean;
    status: 'open' | 'closed';
    replies: MessageReply[];
}

interface Advance {
    id: string;
    employeeId: string;
    amount: number;
    date: string;
    description: string;
}

interface AppSettings {
  total_credits: number;
  salary_approved: string;
  salary_pending_count: number;
}

interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    hourlyRate?: number;
    taxClass?: string;
}

interface SalaryHistoryItem {
    date: string;
    rate: number;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  email: string;
  hourlyRate: number;
  taxClass: 'SK 1' | 'SK 3' | 'SK 5';
  iban: string;
  salary_history?: SalaryHistoryItem[];
  monthly_net_salary?: number;
}

interface WorkLog {
  id: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  netHours: number;
  location: string;
  description: string;
  status?: 'pending' | 'approved' | 'rejected';
}

interface TaskStep {
    id: string;
    text: string;
    completed: boolean;
}

interface Task {
    id: string;
    title: string;
    description: string;
    employeeId: string;
    startDate: string;
    dueDate: string;
    priority: 'low' | 'medium' | 'high';
    status: 'pending' | 'in_progress' | 'completed';
    progress: number; // 0-100
    steps?: TaskStep[]; // Sub-tasks
    created_at?: string;
}

interface CalendarEvent {
    id: string;
    title: string;
    description: string;
    startTime: string; // ISO
    endTime: string; // ISO
    type: 'meeting' | 'deadline' | 'call' | 'personal' | 'montaj';
    location?: string;
    createdBy: string;
    attendees: string[]; // Array of Employee IDs
}

// --- DATA MAPPERS ---
const mapEmployeeToApp = (e: any): Employee => {
    let history: SalaryHistoryItem[] = [];
    if (e.salary_history) {
        try {
            history = typeof e.salary_history === 'string' ? JSON.parse(e.salary_history) : e.salary_history;
        } catch { history = []; }
    }
    
    return {
        id: e.id,
        name: e.name || 'İsimsiz',
        role: e.role || '',
        email: e.email || '',
        hourlyRate: Number(e.hourly_rate) || 0,
        taxClass: e.tax_class || 'SK 1',
        iban: e.iban || '',
        salary_history: history,
        monthly_net_salary: Number(e.monthly_net_salary) || 0
    };
};

const mapWorkLogToApp = (l: any): WorkLog => ({
    id: l.id,
    employeeId: l.employee_id || '',
    date: l.date || new Date().toISOString().split('T')[0],
    startTime: l.start_time || '00:00',
    endTime: l.end_time || '00:00',
    breakMinutes: Number(l.break_minutes) || 0,
    netHours: Number(l.net_hours) || 0,
    location: l.location || '',
    description: l.description || '',
    status: l.status || 'pending'
});

const mapAdvanceToApp = (a: any): Advance => ({
    id: String(a.id),
    employeeId: a.employee_id,
    amount: Number(a.amount) || 0,
    date: a.date || new Date().toISOString().split('T')[0], // Ensure date is never undefined
    description: a.description || ''
});

// Robust mapper for Tasks to prevent crashes
const mapTaskToApp = (t: any): Task => {
    // Handle 'steps' which might be a JSON string from DB or an array
    let parsedSteps: TaskStep[] = [];
    if (Array.isArray(t.steps)) {
        parsedSteps = t.steps;
    } else if (typeof t.steps === 'string') {
        try {
            parsedSteps = JSON.parse(t.steps);
        } catch (e) {
            console.warn("Failed to parse task steps", e);
            parsedSteps = [];
        }
    }

    return {
        id: t.id ? String(t.id) : `task-${Math.floor(Math.random() * 100000)}`,
        title: t.title || 'Adsız Görev',
        description: t.description || '',
        employeeId: t.employee_id,
        // Safely handle dates
        startDate: t.start_date || new Date().toISOString(),
        dueDate: t.due_date || new Date().toISOString(),
        priority: t.priority || 'medium',
        status: t.status || 'pending',
        progress: typeof t.progress === 'number' ? t.progress : 0,
        // Ensure steps is always a valid array
        steps: Array.isArray(parsedSteps) 
            ? parsedSteps.filter((s: any) => s && (typeof s === 'object' || typeof s === 'string')) 
            : [],
        created_at: t.created_at
    };
};

// Robust mapper for Calendar Events
const mapCalendarEventToApp = (e: any): CalendarEvent => {
    // Helper to ensure valid ISO string
    const safeISO = (d: any) => {
        try {
            const date = new Date(d);
            return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
        } catch {
            return new Date().toISOString();
        }
    };

    return {
        id: e.id ? String(e.id) : `event-${Math.floor(Math.random() * 100000)}`,
        title: e.title || 'Etkinlik',
        description: e.description || '',
        startTime: safeISO(e.start_time),
        endTime: safeISO(e.end_time),
        type: e.type || 'meeting',
        location: e.location || '',
        createdBy: e.created_by || '',
        attendees: Array.isArray(e.attendees) ? e.attendees : []
    };
};

// Helper Components
const SidebarItem = ({ icon: Icon, label, active = false, count, onClick }: { icon: any, label: string, active?: boolean, count?: string, onClick?: () => void }) => (
    <div onClick={onClick} className={`group flex items-center justify-between px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-all duration-200 ${active ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
        <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${active ? 'text-blue-500' : 'text-zinc-500 group-hover:text-zinc-400'}`} />
            <span className="text-sm font-medium">{label}</span>
        </div>
        {count && <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/50 px-1.5 py-0.5 rounded-full">{count}</span>}
    </div>
);

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState('');

  // --- APP STATE ---
  // Navigation State
  const [activeView, setActiveView] = useState<ViewType>('panel');

  // HIDDEN SALARY TAB STATE
  const [showSalaryTab, setShowSalaryTab] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  // Mobile specific view state for Hours tab (Toggle between Form and History)
  const [mobileHoursTab, setMobileHoursTab] = useState<'form' | 'list'>('form');

  // SALARY UPDATE MODAL STATE
  const [showSalaryUpdateModal, setShowSalaryUpdateModal] = useState(false);
  const [salaryUpdateTarget, setSalaryUpdateTarget] = useState<Employee | null>(null);
  const [salaryUpdateForm, setSalaryUpdateForm] = useState({
      newRate: '',
      effectiveDate: new Date().toISOString().split('T')[0]
  });

  // Handle secret code input - toggle salary tab with 250455
  const handleMessageSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val === '250455') {
          const newState = !showSalaryTab;
          setShowSalaryTab(newState);
          if (!newState && activeView === 'salary') {
              setActiveView('panel');
          }
          setMessageSearchQuery(''); 
      } else {
          setMessageSearchQuery(val);
      }
  };
  
  // App Settings from Supabase
  const [settings, setSettings] = useState<AppSettings>({
    total_credits: 100, 
    salary_approved: '0.00',
    salary_pending_count: 0
  });

  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  // --- TASKS STATE ---
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({
      title: '',
      description: '',
      employeeId: '',
      startDate: new Date().toISOString().split('T')[0],
      dueDate: new Date().toISOString().split('T')[0],
      priority: 'medium' as 'low' | 'medium' | 'high',
      steps: [] as TaskStep[]
  });
  const [newStepText, setNewStepText] = useState('');

  // --- CALENDAR STATE ---
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [calendarForm, setCalendarForm] = useState({
      title: '',
      description: '',
      location: '',
      startTime: new Date().toISOString().slice(0, 16),
      endTime: new Date().toISOString().slice(0, 16),
      type: 'meeting' as 'meeting' | 'deadline' | 'call' | 'personal' | 'montaj',
      attendees: [] as string[]
  });
  const [panelCalendarDate, setPanelCalendarDate] = useState(new Date());
  const [selectedPanelDate, setSelectedPanelDate] = useState<string | null>(null); 

  // --- MESSAGING STATE ---
  const [messages, setMessages] = useState<Message[]>([
      {
          id: '1',
          senderId: 'emp-1',
          senderName: 'Ahmet Yılmaz',
          subject: 'Stok yetersizliği hk.',
          content: 'Merhaba, 324 kodlu ürün stoklarımızda kritik seviyeye düştü. Sipariş geçilmeli mi?',
          timestamp: new Date().toISOString(),
          isRead: false,
          status: 'open',
          replies: []
      }
  ]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [newMessageForm, setNewMessageForm] = useState({
      subject: '',
      content: ''
  });
  const [replyContent, setReplyContent] = useState('');
  const [showMessageForm, setShowMessageForm] = useState(false);


  // --- SALARY MODULE STATE ---
  const [activeSalaryTab, setActiveSalaryTab] = useState<SalaryTab>('employees');
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [selectedSalaryDate, setSelectedSalaryDate] = useState(new Date());
  const [payrollDate, setPayrollDate] = useState(new Date());
  const [costsMonth, setCostsMonth] = useState<Date>(new Date());
  const [costsStatusFilter, setCostsStatusFilter] = useState<'all' | 'approved'>('approved');
  const [editingSalaryEmpId, setEditingSalaryEmpId] = useState<string | null>(null);
  const [editingSalaryValue, setEditingSalaryValue] = useState<string>('');
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  // Records tab state
  const [recordsMonth, setRecordsMonth] = useState<Date>(new Date());
  const [recordsEmpFilter, setRecordsEmpFilter] = useState<string>('all');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogField, setEditingLogField] = useState<Record<string, string>>({});

  const [officialPayrollHours, setOfficialPayrollHours] = useState<Record<string, number>>({});

  const [newEmployee, setNewEmployee] = useState<Partial<Employee>>({
      taxClass: 'SK 1'
  });

  const [hourEntry, setHourEntry] = useState({
      employeeId: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 30,
      location: '',
      description: ''
  });
  
  const [newAdvance, setNewAdvance] = useState({
      employeeId: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      description: ''
  });

  // Settings State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Accordion states for Salary Module
  const [expandedEmployees, setExpandedEmployees] = useState<Record<string, boolean>>({});
  const [expandedPayroll, setExpandedPayroll] = useState<Record<string, boolean>>({});
  const [expandedSalaryMonths, setExpandedSalaryMonths] = useState<Record<string, boolean>>({});

  // Helper to get historical rate
  const getHourlyRateForDate = (emp: Employee, date: Date | string): number => {
      if (!emp.salary_history || emp.salary_history.length === 0) {
          return emp.hourlyRate;
      }

      const targetTime = new Date(date).getTime();
      // Sort history descending by date
      const sortedHistory = [...emp.salary_history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Find the first record where history date is <= target date
      const validRecord = sortedHistory.find(h => new Date(h.date).getTime() <= targetTime);
      
      // If no valid record is found (target date is before all history entries), return the oldest known rate
      return validRecord ? validRecord.rate : sortedHistory[sortedHistory.length - 1].rate;
  };

  // --- INITIALIZATION & SESSION PERSISTENCE ---
  useEffect(() => {
      const initSession = () => {
        const savedSession = localStorage.getItem('faturaai_session');
        if (savedSession) {
            try {
                const user = JSON.parse(savedSession);
                setCurrentUser(user);
                if (user.role !== 'admin') {
                    setActiveView('panel');
                }
            } catch (e) {
                console.error("Session parse error", e);
                localStorage.removeItem('faturaai_session');
            }
        }
        
        const savedEmail = localStorage.getItem('remember_me_email');
        if (savedEmail) {
            setLoginEmail(savedEmail);
            setRememberMe(true);
        }

        setTimeout(() => setIsAuthChecking(false), 500);
      };

      initSession();
  }, []);

  // Fetch initial data
  useEffect(() => {
    if (!currentUser) return;
    
    const loadData = async () => {
        const [emps, logs, advs, tsks, evts, locs] = await Promise.all([
            fetchEmployees(),
            fetchWorkLogs(),
            fetchAdvances(),
            fetchTasks(),
            fetchCalendarEvents(),
            fetchLocations()
        ]);

        setEmployees(emps.map(mapEmployeeToApp));
        setWorkLogs(logs.map(mapWorkLogToApp));
        setAdvances(advs.map(mapAdvanceToApp));
        setTasks(tsks.map(mapTaskToApp));
        setCalendarEvents(evts.map(mapCalendarEventToApp));
        setLocations(locs);
    };

    loadData();

    const locChannel = subscribeToLocations((payload) => {
        if (payload.eventType === 'INSERT') {
            setLocations(prev => [...prev, payload.new].sort((a, b) => a.name.localeCompare(b.name)));
        } else if (payload.eventType === 'DELETE') {
            setLocations(prev => prev.filter(l => l.id !== payload.old.id));
        }
    });

    const empChannel = subscribeToEmployees((payload) => {
        if (payload.eventType === 'INSERT') {
            setEmployees(prev => [...prev, mapEmployeeToApp(payload.new)]);
        } else if (payload.eventType === 'UPDATE') {
            setEmployees(prev => prev.map(e => e.id === payload.new.id ? mapEmployeeToApp(payload.new) : e));
        } else if (payload.eventType === 'DELETE') {
            setEmployees(prev => prev.filter(e => e.id !== payload.old.id));
        }
    });

    const logChannel = subscribeToWorkLogs((payload) => {
        if (payload.eventType === 'INSERT') {
            setWorkLogs(prev => [mapWorkLogToApp(payload.new), ...prev]);
        } else if (payload.eventType === 'UPDATE') {
            setWorkLogs(prev => prev.map(l => l.id === payload.new.id ? mapWorkLogToApp(payload.new) : l));
        } else if (payload.eventType === 'DELETE') {
            setWorkLogs(prev => prev.filter(l => l.id !== payload.old.id));
        }
    });

    const advChannel = subscribeToAdvances((payload) => {
        if (payload.eventType === 'INSERT') {
            setAdvances(prev => [mapAdvanceToApp(payload.new), ...prev]);
        } else if (payload.eventType === 'UPDATE') {
            setAdvances(prev => prev.map(a => a.id === payload.new.id ? mapAdvanceToApp(payload.new) : a));
        } else if (payload.eventType === 'DELETE') {
            setAdvances(prev => prev.filter(a => a.id !== payload.old.id));
        }
    });

    return () => {
        locChannel.unsubscribe();
        empChannel.unsubscribe();
        logChannel.unsubscribe();
        advChannel.unsubscribe();
    };
  }, [currentUser]);

  // --- AUTH LOGIC ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const res = await loginUser(loginEmail, loginPass);
    if (res.success && res.user) {
        setCurrentUser(res.user);
        localStorage.setItem('faturaai_session', JSON.stringify(res.user));
        
        if(rememberMe) {
            localStorage.setItem('remember_me_email', loginEmail);
        } else {
            localStorage.removeItem('remember_me_email');
        }

        setActiveView('panel'); 
    } else {
        setLoginError(res.error || 'Giriş başarısız');
    }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setLoginPass('');
      setShowSalaryTab(false);
      setActiveView('panel');
      localStorage.removeItem('faturaai_session');
  };

  const handleChangePassword = async () => {
      if (newPassword !== confirmPassword) {
          alert("Şifreler eşleşmiyor.");
          return;
      }
      if (newPassword.length < 3) {
          alert("Şifre çok kısa.");
          return;
      }
      if (!currentUser) return;

      try {
          await updateUserPassword(currentUser.id, currentUser.role, newPassword);
          alert("Şifre başarıyla güncellendi.");
          setNewPassword('');
          setConfirmPassword('');
      } catch (e) {
          alert("Şifre güncellenemedi.");
      }
  };

  const calculatedNetHours = useMemo(() => {
      if (!hourEntry.startTime || !hourEntry.endTime) return 0;
      const start = new Date(`2000-01-01T${hourEntry.startTime}`);
      const end = new Date(`2000-01-01T${hourEntry.endTime}`);
      let diffMs = end.getTime() - start.getTime();
      if (diffMs < 0) return 0;
      const diffMins = Math.floor(diffMs / 60000);
      const netMins = Math.max(0, diffMins - hourEntry.breakMinutes);
      return (netMins / 60).toFixed(1);
  }, [hourEntry.startTime, hourEntry.endTime, hourEntry.breakMinutes]);

  const handleOpenAddEmployee = () => {
      setEditingEmployee(null);
      setNewEmployee({ taxClass: 'SK 1' });
      setShowAddEmployeeModal(true);
  };

  const handleEditEmployee = (emp: Employee) => {
      setEditingEmployee(emp);
      setNewEmployee({
          name: emp.name,
          email: emp.email,
          role: emp.role,
          hourlyRate: emp.hourlyRate,
          taxClass: emp.taxClass,
          iban: emp.iban
      });
      setShowAddEmployeeModal(true);
  };

  const handleSaveEmployee = async () => {
      if (newEmployee.name && newEmployee.email && newEmployee.hourlyRate) {
          try {
              const empData = {
                  name: newEmployee.name,
                  role: newEmployee.role || 'Personel',
                  email: newEmployee.email,
                  hourly_rate: Number(newEmployee.hourlyRate),
                  tax_class: (newEmployee.taxClass as any) || 'SK 1',
                  iban: newEmployee.iban || ''
              };

              if (editingEmployee) {
                  // Optimistic Update
                  setEmployees(prev => prev.map(e => e.id === editingEmployee.id ? { ...e, ...newEmployee, id: e.id } as Employee : e));
                  await updateEmployee(editingEmployee.id, empData);
              } else {
                  const savedData = await saveEmployee(empData);
              }
              
              setShowAddEmployeeModal(false);
              setNewEmployee({ taxClass: 'SK 1' });
              setEditingEmployee(null);
          } catch (e) {
              console.error("Error saving employee", e);
              alert("Kaydedilemedi!");
          }
      }
  };

  const handleDeleteEmployee = async (id: string) => {
      if(window.confirm("Bu personeli ve tüm çalışma geçmişini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) {
          const originalList = [...employees];
          setEmployees(prev => prev.filter(e => e.id !== id));
          try {
              await deleteEmployee(id);
          } catch (e) {
              console.error(e);
              setEmployees(originalList);
              alert("Silme işlemi başarısız! Lütfen veritabanı politikalarını (RLS) kontrol edin.");
          }
      }
  };

  const handleOpenSalaryUpdate = (emp: Employee, defaultDate?: Date) => {
      setSalaryUpdateTarget(emp);
      const dateToUse = defaultDate || new Date();
      const year = dateToUse.getFullYear();
      const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
      const day = String(dateToUse.getDate()).padStart(2, '0');
      
      setSalaryUpdateForm({
          newRate: emp.hourlyRate.toString(),
          effectiveDate: `${year}-${month}-${day}`
      });
      setShowSalaryUpdateModal(true);
  };

  const handleSaveSalaryUpdate = async () => {
      if (!salaryUpdateTarget || !salaryUpdateForm.newRate) return;
      
      const newRate = parseFloat(salaryUpdateForm.newRate);
      if (isNaN(newRate) || newRate <= 0) {
          alert("Geçerli bir ücret giriniz.");
          return;
      }

      try {
          // Prepare history update
          const currentHistory = salaryUpdateTarget.salary_history ? [...salaryUpdateTarget.salary_history] : [];
          
          // If history is empty, add the current rate as a baseline from a very old date
          if (currentHistory.length === 0) {
              currentHistory.push({ date: '2000-01-01', rate: salaryUpdateTarget.hourlyRate });
          }
          
          const newHistoryEntry = { date: salaryUpdateForm.effectiveDate, rate: newRate };
          const updatedHistory = [...currentHistory, newHistoryEntry];

          // Optimistic Update
          setEmployees(prev => prev.map(e => e.id === salaryUpdateTarget.id ? { ...e, hourlyRate: newRate, salary_history: updatedHistory } : e));

          // Save to DB
          await updateEmployee(salaryUpdateTarget.id, {
              hourly_rate: newRate,
              salary_history: JSON.stringify(updatedHistory) // Assumes DB handles JSON string for custom column or mapped correctly
          });

          setShowSalaryUpdateModal(false);
          setSalaryUpdateTarget(null);
      } catch (e) {
          console.error("Salary update failed", e);
          alert("Maaş güncellenemedi.");
      }
  };

  const handleSaveMonthlyNetSalary = async (empId: string) => {
      const val = parseFloat(editingSalaryValue);
      if (isNaN(val) || val < 0) { alert("Geçerli bir değer giriniz."); return; }
      try {
          setEmployees(prev => prev.map(e => e.id === empId ? { ...e, monthly_net_salary: val } : e));
          await updateEmployee(empId, { monthly_net_salary: val });
          setEditingSalaryEmpId(null);
      } catch (e) {
          console.error("Monthly salary update failed", e);
          alert("Aylık maaş güncellenemedi.");
      }
  };

  const handleSaveHourEntry = async () => {
      const empId = currentUser?.role === 'admin' ? hourEntry.employeeId : currentUser?.id;
      
      if (empId && calculatedNetHours && hourEntry.location.trim() && hourEntry.description.trim()) {
          try {
              const logData = {
                  employeeId: empId,
                  date: hourEntry.date,
                  startTime: hourEntry.startTime,
                  endTime: hourEntry.endTime,
                  breakMinutes: hourEntry.breakMinutes,
                  netHours: parseFloat(calculatedNetHours as string),
                  location: hourEntry.location,
                  description: hourEntry.description
              };

              await saveWorkLog(logData);
              // Auto-save location to shared locations list
              if (hourEntry.location.trim()) {
                  await upsertLocation(hourEntry.location.trim());
                  setLocations(prev => {
                      const name = hourEntry.location.trim();
                      if (prev.some(l => l.name.toLowerCase() === name.toLowerCase())) return prev;
                      return [...prev, { id: name, name }].sort((a, b) => a.name.localeCompare(b.name));
                  });
              }
              setHourEntry(prev => ({...prev, location: '', description: ''}));
              
              if (currentUser?.role === 'employee') {
                  alert("Saat girişi onaya gönderildi.");
              } else {
                  alert("Saat girişi kaydedildi.");
              }
          } catch (e) {
              console.error(e);
              alert("Saat girişi kaydedilemedi.");
          }
      } else {
          alert("Lütfen personel seçiniz ve açıklama giriniz (Tüm alanlar zorunludur).");
      }
  };
  
  const handleSaveAdvance = async () => {
      if (!newAdvance.employeeId || !newAdvance.amount) {
          alert("Lütfen personel ve tutar giriniz.");
          return;
      }
      
      const parsedAmount = parseFloat(newAdvance.amount.toString().replace(',', '.'));
      
      if(isNaN(parsedAmount) || parsedAmount <= 0) {
          alert("Geçersiz tutar! Lütfen doğru bir sayı giriniz.");
          return;
      }

      try {
          const savedData = await saveAdvance({
              employee_id: newAdvance.employeeId,
              amount: parsedAmount,
              date: newAdvance.date,
              description: newAdvance.description
          });
          
          // Update local state immediately
          if(savedData) {
              setAdvances(prev => [mapAdvanceToApp(savedData), ...prev]);
          }
          
          setNewAdvance(prev => ({...prev, amount: '', description: ''}));
          alert("Avans başarıyla kaydedildi.");
      } catch(e: any) {
          console.error("Avans kaydetme hatası:", e);
          const errorMsg = e.message || e.error_description || (typeof e === 'object' ? JSON.stringify(e) : String(e));
          
          if (errorMsg.includes('relation "public.advances" does not exist') || errorMsg.includes('schema cache')) {
              alert("HATA: 'advances' tablosu sistemde bulunamadı. Lütfen sağlanan SQL kodunu Supabase panelinde çalıştırınız.");
          } else {
              alert("Avans kaydedilemedi: " + errorMsg);
          }
      }
  };
  
  const handleDeleteAdvance = async (id: string) => {
      if(window.confirm("Bu avansı silmek istediğinize emin misiniz?")) {
          setAdvances(prev => prev.filter(a => a.id !== id));
          try {
              await deleteAdvance(id);
          } catch(e) { alert("Silinemedi"); }
      }
  };

  const handleApproveLog = async (id: string) => {
      try {
          setWorkLogs(prev => prev.map(log => log.id === id ? { ...log, status: 'approved' } : log));
          await updateWorkLogStatus(id, 'approved');
      } catch (e) {
          console.error(e);
          alert("Onaylanamadı");
      }
  }

  const handleRejectLog = async (id: string) => {
      if (window.confirm("Bu kaydı reddetmek istiyor musunuz?")) {
        try {
            setWorkLogs(prev => prev.map(log => log.id === id ? { ...log, status: 'rejected' } : log));
            await updateWorkLogStatus(id, 'rejected');
        } catch (e) {
            console.error(e);
            alert("Reddedilemedi");
        }
      }
  }

  const handleDeleteWorkLog = async (id: string) => {
      if (window.confirm("Bu çalışma kaydını silmek istediğinize emin misiniz?")) {
          const originalLogs = [...workLogs];
          setWorkLogs(prev => prev.filter(l => l.id !== id));
          try {
              await deleteWorkLog(id);
          } catch (e) {
              console.error(e);
              setWorkLogs(originalLogs);
              alert("Silme işlemi başarısız!");
          }
      }
  }

  // --- IMPLEMENT MISSING HANDLERS ---

  const getUnreadCount = () => {
      if (!currentUser) return 0;
      return messages.filter(m => !m.isRead && m.senderId !== currentUser.id).length;
  };

  const handleSendMessage = () => {
      if(!newMessageForm.subject || !newMessageForm.content) return;
      const newMsg: Message = {
          id: Date.now().toString(),
          senderId: currentUser?.id || 'unknown',
          senderName: currentUser?.name || 'Anonim',
          subject: newMessageForm.subject,
          content: newMessageForm.content,
          timestamp: new Date().toISOString(),
          isRead: false,
          status: 'open',
          replies: []
      };
      setMessages(prev => [newMsg, ...prev]);
      setShowMessageForm(false);
      setNewMessageForm({subject: '', content: ''});
  };

  const handleSendReply = () => {
      if(!selectedMessage || !replyContent) return;
      const reply: MessageReply = {
          id: Date.now().toString(),
          senderId: currentUser?.id || 'unknown',
          senderName: currentUser?.name || 'Anonim',
          content: replyContent,
          timestamp: new Date().toISOString(),
          isAdmin: currentUser?.role === 'admin'
      };
      
      const updatedMessages = messages.map(m => {
          if (m.id === selectedMessage.id) {
              return { ...m, replies: [...m.replies, reply] };
          }
          return m;
      });
      setMessages(updatedMessages);
      setSelectedMessage(prev => prev ? { ...prev, replies: [...prev.replies, reply] } : null);
      setReplyContent('');
  };

  const toggleEmployeeExpand = (id: string) => {
      setExpandedEmployees(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSalaryMonth = (key: string) => {
      setExpandedSalaryMonths(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Task Handlers
  const handleAddTaskStep = () => {
      if (!newStepText.trim()) return;
      setTaskForm(prev => ({
          ...prev,
          steps: [...prev.steps, { id: Date.now().toString(), text: newStepText, completed: false }]
      }));
      setNewStepText('');
  };

  const handleToggleTaskStep = (stepId: string) => {
      setTaskForm(prev => ({
          ...prev,
          steps: prev.steps.map(s => s.id === stepId ? { ...s, completed: !s.completed } : s)
      }));
  };

  const handleDeleteTaskStep = (stepId: string) => {
      setTaskForm(prev => ({
          ...prev,
          steps: prev.steps.filter(s => s.id !== stepId)
      }));
  };

  const handleToggleCardTaskStep = async (taskId: string, stepId: string, currentCompleted: boolean) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      
      const updatedSteps = task.steps.map(s => s.id === stepId ? { ...s, completed: !currentCompleted } : s);
      
      const completedCount = updatedSteps.filter(s => s.completed).length;
      const totalCount = updatedSteps.length;
      const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : task.progress;
      
      let newStatus = task.status;
      if (progress === 100) newStatus = 'completed';
      else if (progress > 0 && task.status === 'pending') newStatus = 'in-progress';
      
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, steps: updatedSteps, progress, status: newStatus } : t));
      
      try {
          await updateTask(taskId, { steps: updatedSteps, progress, status: newStatus });
      } catch (error) {
          console.error("Alt görev güncellenirken hata oluştu:", error);
      }
  };

  const handleSaveTask = async () => {
      if(!taskForm.title) return alert("Başlık zorunludur");
      try {
          // Calculate progress automatically based on checked steps if any
          let progress = 0;
          if (taskForm.steps.length > 0) {
              const completed = taskForm.steps.filter(s => s.completed).length;
              progress = Math.round((completed / taskForm.steps.length) * 100);
          }

          const taskPayload = { ...taskForm, progress };

          if (editingTask) {
               await updateTask(editingTask.id, taskPayload);
               setTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...taskPayload, ...mapTaskToApp({id:editingTask.id, ...taskPayload}) } : t));
          } else {
               const saved = await saveTask(taskPayload);
               if(saved) setTasks(prev => [...prev, mapTaskToApp(saved)]);
          }
          setShowTaskModal(false);
          setEditingTask(null);
          setTaskForm({ title: '', description: '', employeeId: '', startDate: new Date().toISOString().split('T')[0], dueDate: new Date().toISOString().split('T')[0], priority: 'medium', steps: [] });
      } catch (e) {
          alert("Kaydedilemedi");
      }
  };

  // Calendar Handlers
  const toggleAttendee = (empId: string) => {
      setCalendarForm(prev => {
          const attendees = prev.attendees.includes(empId) 
              ? prev.attendees.filter(id => id !== empId)
              : [...prev.attendees, empId];
          return { ...prev, attendees };
      });
  };

  const handleSaveCalendarEvent = async () => {
      if(!calendarForm.title) return alert("Başlık zorunludur");
      try {
          const payload = { ...calendarForm, createdBy: currentUser?.id };
          if (editingEvent) {
               await updateCalendarEvent(editingEvent.id, payload);
               setCalendarEvents(prev => prev.map(e => e.id === editingEvent.id ? { ...e, ...payload } : e));
          } else {
               const saved = await saveCalendarEvent(payload);
               if(saved) setCalendarEvents(prev => [...prev, mapCalendarEventToApp(saved)]);
          }
          setShowCalendarModal(false);
          setEditingEvent(null);
      } catch(e) {
          alert("Kaydedilemedi");
      }
  };

  const handleDeleteCalendarEvent = async (id: string) => {
      if(!window.confirm("Silmek istediğinize emin misiniz?")) return;
      try {
          await deleteCalendarEvent(id);
          setCalendarEvents(prev => prev.filter(e => e.id !== id));
          setShowCalendarModal(false);
      } catch (e) {
          alert("Silinemedi");
      }
  };

  // --- ADDED MISSING DEFINITIONS ---
  const upcomingEvents = useMemo(() => {
    if (!currentUser) return [];
    
    // 1. Filter by permissions
    let accessibleEvents = calendarEvents;
    if (currentUser.role !== 'admin') {
        accessibleEvents = calendarEvents.filter(e => 
            e.createdBy === currentUser.id || 
            (Array.isArray(e.attendees) && e.attendees.includes(currentUser.id))
        );
    }

    // 2. Filter by Date
    if (selectedPanelDate) {
        return accessibleEvents
            .filter(e => e.startTime.startsWith(selectedPanelDate))
            .sort((a,b) => a.startTime.localeCompare(b.startTime));
    } else {
        // Show upcoming 5 events from *now*
        const now = new Date().toISOString();
        return accessibleEvents
            .filter(e => e.startTime >= now)
            .sort((a,b) => a.startTime.localeCompare(b.startTime))
            .slice(0, 5);
    }
  }, [calendarEvents, selectedPanelDate, currentUser]);

  const handleOpenCalendarModal = (event?: CalendarEvent) => {
      if (event) {
          setEditingEvent(event);
          setCalendarForm({
              title: event.title,
              description: event.description,
              location: event.location || '',
              startTime: event.startTime.substring(0, 16),
              endTime: event.endTime.substring(0, 16),
              type: event.type,
              attendees: event.attendees
          });
      } else {
          setEditingEvent(null);
          setCalendarForm({
              title: '',
              description: '',
              location: '',
              startTime: new Date().toISOString().substring(0, 16),
              endTime: new Date(Date.now() + 3600000).toISOString().substring(0, 16),
              type: 'meeting',
              attendees: []
          });
      }
      setShowCalendarModal(true);
      setActiveView('calendar');
  };

  if (isAuthChecking) {
      return (
          <div className="flex items-center justify-center h-screen bg-[#050505]">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
      );
  }

  if (!currentUser) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505] text-zinc-100 overflow-hidden">
              <TubesBackground className="absolute inset-0 w-full h-full" />
              <div className="relative z-10 w-full max-w-md mx-4 flex flex-col items-center">
                  <div className="w-full p-8 bg-[#0a0a0c]/90 backdrop-blur-md border border-zinc-800 rounded-2xl shadow-2xl">
                      <div className="flex justify-center mb-8">
                         <img src="https://smxadfujomneusxclqbu.supabase.co/storage/v1/object/public/resim%20logo/logo_werbung.png" alt="2MCWerbung Logo" className="h-24 object-contain" referrerPolicy="no-referrer" />
                      </div>
                      <h2 className="text-2xl font-bold text-center mb-2">Giriş Yap</h2>
                      <p className="text-zinc-500 text-center text-sm mb-8">2MCWerbung Yönetim Paneli</p>
                      
                      <form onSubmit={handleLogin} className="space-y-4">
                          <div>
                              <label className="block text-xs font-medium text-zinc-400 mb-1">E-posta</label>
                              <input 
                                  type="email" 
                                  value={loginEmail}
                                  onChange={e => setLoginEmail(e.target.value)}
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                  placeholder="ornek@sirket.com"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-medium text-zinc-400 mb-1">Şifre</label>
                              <input 
                                  type="password" 
                                  value={loginPass}
                                  onChange={e => setLoginPass(e.target.value)}
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                  placeholder="••••••••"
                              />
                          </div>
                          
                          <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input 
                                      type="checkbox" 
                                      checked={rememberMe}
                                      onChange={e => setRememberMe(e.target.checked)}
                                      className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-0" 
                                  />
                                  <span className="text-xs text-zinc-400">Beni hatırla</span>
                              </label>
                          </div>

                          {loginError && <div className="text-red-400 text-xs text-center">{loginError}</div>}

                          <button 
                              type="submit" 
                              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-blue-900/20"
                          >
                              Giriş Yap
                          </button>
                      </form>
                  </div>
                  <div className="mt-6 text-zinc-500 text-sm font-medium tracking-wide">
                      Made by 2MC Werbung
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="flex h-screen bg-[#050505] text-zinc-100 font-sans overflow-hidden">
        
        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-32 pt-14 bg-[#0a0a0c] border-b border-zinc-800 flex items-center justify-between px-4 z-50">
            <img src="https://smxadfujomneusxclqbu.supabase.co/storage/v1/object/public/resim%20logo/logo_werbung.png" alt="2MCWerbung Logo" className="h-16 object-contain" referrerPolicy="no-referrer" />
            <div className="flex items-center gap-1">
                <button onClick={() => setActiveView('settings')} className="p-2 text-zinc-400 hover:text-white transition-colors">
                    <Cog6ToothIcon className="w-5 h-5" />
                </button>
                <button onClick={() => setActiveView('messages')} className="p-2 text-blue-400 hover:text-blue-300 transition-colors relative">
                    <ChatBubbleLeftRightIcon className="w-5 h-5" />
                    {getUnreadCount() > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
                </button>
                <button onClick={handleLogout} className="p-2 text-red-400 hover:text-red-300 transition-colors">
                    <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* Sidebar - Desktop Only */}
        <aside className="hidden md:flex w-64 bg-[#0a0a0c] border-r border-zinc-800/60 flex-col">
            {/* Sidebar Content */}
            <div className="p-5 flex items-center justify-center border-b border-zinc-800/60">
                <img src="https://smxadfujomneusxclqbu.supabase.co/storage/v1/object/public/resim%20logo/logo_werbung.png" alt="2MCWerbung Logo" className="h-20 object-contain" referrerPolicy="no-referrer" />
            </div>
            
            <div className="p-4 border-b border-zinc-800/40">
                <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-800">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                            {currentUser.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <div className="text-sm font-medium truncate">{currentUser.email}</div>
                            <div className="text-xs text-blue-400">{currentUser.role === 'admin' ? 'Yönetici' : 'Personel'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 space-y-1 custom-scrollbar">
                <SidebarItem icon={Squares2X2Icon} label="Panel" active={activeView === 'panel'} onClick={() => setActiveView('panel')} />
                <SidebarItem icon={ChatBubbleLeftRightIcon} label="Mesajlar" active={activeView === 'messages'} count={getUnreadCount() > 0 ? String(getUnreadCount()) : undefined} onClick={() => setActiveView('messages')} />
                <SidebarItem icon={CalendarDaysIcon} label="Takvim / Ajanda" active={activeView === 'calendar'} onClick={() => setActiveView('calendar')} />
                <SidebarItem icon={ClipboardDocumentCheckIcon} label="Görev Takip" active={activeView === 'tasks'} onClick={() => setActiveView('tasks')} />
                {showSalaryTab && (
                    <SidebarItem icon={BanknotesIcon} label="Maaş Ödemesi" active={activeView === 'salary'} onClick={() => setActiveView('salary')} />
                )}
                <SidebarItem icon={ArrowLeftOnRectangleIcon} label="Ayarlar" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
            </nav>

            <div className="p-4 border-t border-zinc-800/60">
                <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors w-full px-2 py-2 rounded-lg hover:bg-red-900/10">
                    <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                    Güvenli Çıkış
                </button>
            </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden relative pt-32 pb-16 md:pt-0 md:pb-0">
            {/* Header */}
            <header className="hidden md:flex items-center justify-between px-8 py-5 border-b border-zinc-800/60 bg-[#0a0a0c]/80 backdrop-blur-sm z-10">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-white">
                        Hoşgeldin, <span className="text-blue-500">{currentUser.name}</span>
                    </h2>
                    <p className="text-sm text-zinc-500">
                        {activeView === 'messages' ? 'Mesajlaşma ve Destek Merkezi' : 'Yönetim paneli.'}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 flex items-center gap-2 text-xs font-medium text-zinc-400">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        Sistem çevrimiçi
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-2 bg-red-900/20 hover:bg-red-900/30 text-red-400 px-4 py-2 rounded-lg text-xs font-bold transition-all border border-red-900/30"
                    >
                        <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                        Güvenli Çıkış
                    </button>
                </div>
            </header>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">

                {/* ... (Messages View kept as is) ... */}
                {activeView === 'messages' && ( <div className="h-full flex flex-col md:flex-row gap-6"> <div className={`flex flex-col gap-4 w-full ${selectedMessage ? 'hidden md:flex md:w-1/3' : 'md:w-1/3'} transition-all`}> <div className="flex justify-between items-center bg-[#0e0e11] border border-zinc-800 p-4 rounded-xl"> <h3 className="font-bold flex items-center gap-2 text-zinc-200"> <ChatBubbleLeftRightIcon className="w-5 h-5 text-cyan-400"/> Mesajlar </h3> <button onClick={() => { setSelectedMessage(null); setShowMessageForm(true); }} className="bg-cyan-900/20 text-cyan-400 border border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.5)] transition-all px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" > <PlusIcon className="w-4 h-4"/> Yeni </button> </div> <div className="flex-1 bg-[#0e0e11] border border-zinc-800 rounded-xl overflow-hidden flex flex-col"> <div className="p-2 border-b border-zinc-800 bg-zinc-900/30"> <input placeholder="Mesajlarda ara..." className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none" value={messageSearchQuery} onChange={handleMessageSearchChange} /> </div> <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2"> {messages.map(msg => ( <div key={msg.id} onClick={() => { setSelectedMessage(msg); setShowMessageForm(false); setMessages(prev => prev.map(m => m.id === msg.id ? {...m, isRead: true} : m)); }} className={`p-3 rounded-lg border cursor-pointer transition-all hover:bg-zinc-800/50 group relative ${selectedMessage?.id === msg.id ? 'bg-cyan-900/10 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 'bg-zinc-900/20 border-zinc-800'} `} > {!msg.isRead && <div className="absolute top-3 right-3 w-2 h-2 bg-fuchsia-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(232,121,249,0.8)]"></div>} <div className="flex items-center gap-3 mb-2"> <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700"> <UserCircleIcon className="w-5 h-5 text-zinc-400"/> </div> <div className="overflow-hidden"> <div className="text-sm font-bold text-zinc-200 truncate">{msg.senderName}</div> <div className="text-[10px] text-zinc-500">{new Date(msg.timestamp).toLocaleDateString()}</div> </div> </div> <div className="text-xs text-zinc-400 line-clamp-2">{msg.content}</div> </div> ))} </div> </div> </div> <div className={`flex-1 bg-[#0e0e11] border border-zinc-800 rounded-xl p-6 ${!selectedMessage && !showMessageForm ? 'hidden md:flex items-center justify-center' : 'flex'} flex-col`}> {showMessageForm ? ( <div className="w-full max-w-2xl mx-auto"> <div className="flex justify-between items-center mb-6"> <h3 className="text-lg font-bold text-white">Yeni Mesaj</h3> <button onClick={() => setShowMessageForm(false)} className="text-zinc-500 hover:text-white"><XMarkIcon className="w-6 h-6"/></button> </div> <div className="space-y-4"> <input placeholder="Konu" value={newMessageForm.subject} onChange={e => setNewMessageForm({...newMessageForm, subject: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white focus:border-cyan-500 outline-none" /> <textarea placeholder="Mesajınız..." rows={8} value={newMessageForm.content} onChange={e => setNewMessageForm({...newMessageForm, content: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-white focus:border-cyan-500 outline-none resize-none" /> <div className="flex justify-end gap-3"> <button onClick={() => setShowMessageForm(false)} className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800">İptal</button> <button onClick={handleSendMessage} className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 flex items-center gap-2"> <PaperAirplaneIcon className="w-4 h-4" /> Gönder </button> </div> </div> </div> ) : selectedMessage ? ( <div className="w-full h-full flex flex-col"> <div className="flex justify-between items-start border-b border-zinc-800 pb-4 mb-4"> <div> <h2 className="text-xl font-bold text-white mb-1">{selectedMessage.subject}</h2> <div className="flex items-center gap-2 text-xs text-zinc-400"> <span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">{selectedMessage.senderName}</span> <span>&bull;</span> <span>{new Date(selectedMessage.timestamp).toLocaleString()}</span> </div> </div> <button onClick={() => setSelectedMessage(null)} className="md:hidden p-2 text-zinc-500"><XMarkIcon className="w-6 h-6"/></button> </div> <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 mb-4"> <div className="bg-zinc-900/30 p-4 rounded-lg border border-zinc-800/50"> <p className="text-zinc-300 whitespace-pre-wrap">{selectedMessage.content}</p> </div> {selectedMessage.replies.map(reply => ( <div key={reply.id} className={`flex flex-col ${reply.isAdmin ? 'items-end' : 'items-start'}`}> <div className={`max-w-[80%] p-4 rounded-xl border ${reply.isAdmin ? 'bg-blue-900/20 border-blue-800/50 rounded-tr-none' : 'bg-zinc-800/50 border-zinc-700 rounded-tl-none'}`}> <div className="flex justify-between items-center gap-4 mb-2 text-xs opacity-50"> <span className="font-bold">{reply.senderName}</span> <span>{new Date(reply.timestamp).toLocaleString()}</span> </div> <p className="text-zinc-200 whitespace-pre-wrap">{reply.content}</p> </div> </div> ))} </div> <div className="mt-auto pt-4 border-t border-zinc-800"> <div className="relative"> <textarea placeholder="Yanıt yaz..." rows={3} value={replyContent} onChange={e => setReplyContent(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 pr-12 text-white focus:border-cyan-500 outline-none resize-none" /> <button onClick={handleSendReply} disabled={!replyContent.trim()} className="absolute bottom-3 right-3 p-2 bg-cyan-600 rounded-lg text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed" > <PaperAirplaneIcon className="w-5 h-5" /> </button> </div> </div> </div> ) : ( <div className="flex flex-col items-center justify-center h-full text-zinc-600 p-8 text-center"> <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4"> <EnvelopeIcon className="w-10 h-10 text-zinc-700"/> </div> <h3 className="text-zinc-400 font-bold text-lg mb-2">Mesaj Seçiniz</h3> <p className="text-sm max-w-xs">Soldaki listeden bir mesaj seçerek detayları görüntüleyebilir veya yeni bir mesaj oluşturabilirsiniz.</p> </div> )} </div> </div> )}

                {/* NEW PANEL VIEW (Overview of Tasks, Calendar, Salary) */}
                {activeView === 'panel' && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">Yönetim Paneli</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            
                            {/* Card 1: Tasks Summary */}
                            <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5 relative overflow-hidden flex flex-col">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold flex items-center gap-2 text-zinc-200">
                                        <ClipboardDocumentCheckIcon className="w-5 h-5 text-blue-500"/> Görev Özeti
                                    </h3>
                                    <button onClick={() => setActiveView('tasks')} className="text-xs text-blue-400 hover:text-blue-300">Tümünü Gör</button>
                                </div>
                                
                                <div className="flex-1 space-y-3">
                                    {tasks
                                        .filter(t => currentUser?.role === 'admin' || t.employeeId === currentUser?.id)
                                        .filter(t => t.status !== 'completed') // Show only active tasks
                                        .sort((a,b) => {
                                            const dA = new Date(a.dueDate).getTime();
                                            const dB = new Date(b.dueDate).getTime();
                                            return (isNaN(dA) ? 0 : dA) - (isNaN(dB) ? 0 : dB);
                                        })
                                        .slice(0, 5)
                                        .map(task => (
                                            <div key={task.id} className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 text-sm">
                                                <div className="flex justify-between mb-1">
                                                    <span className="font-medium text-zinc-300 truncate">{task.title}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase ${task.priority === 'high' ? 'bg-red-900/30 text-red-400 border-red-900/50' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                                                        {task.priority === 'high' ? 'Acil' : 'Normal'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                                                    <span>Son: {task.dueDate}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500" style={{width: `${task.progress}%`}}></div>
                                                    </div>
                                                    <span className="text-[10px] text-zinc-500">{task.progress}%</span>
                                                </div>
                                            </div>
                                        ))
                                    }
                                    {tasks.filter(t => currentUser?.role === 'admin' || t.employeeId === currentUser?.id).filter(t => t.status !== 'completed').length === 0 && (
                                        <div className="text-center text-zinc-500 py-6 text-sm">Bekleyen görev yok.</div>
                                    )}
                                </div>
                            </div>

                            {/* Card 2: Calendar/Agenda Summary - MINI CALENDAR */}
                            <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5 relative overflow-hidden flex flex-col">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold flex items-center gap-2 text-zinc-200">
                                        <CalendarDaysIcon className="w-5 h-5 text-orange-500"/> Ajanda
                                    </h3>
                                    <button onClick={() => setActiveView('calendar')} className="text-xs text-orange-400 hover:text-orange-300">Takvime Git</button>
                                </div>
                                <div className="flex-1 space-y-3">
                                    {/* Mini Calendar Header */}
                                    <div className="flex items-center justify-between text-sm mb-2">
                                        <button onClick={() => setPanelCalendarDate(new Date(panelCalendarDate.setMonth(panelCalendarDate.getMonth() - 1)))} className="p-1 hover:bg-zinc-800 rounded"><ChevronDownIcon className="w-4 h-4 rotate-90"/></button>
                                        <span className="font-bold">{panelCalendarDate.toLocaleDateString('tr-TR', {month:'long', year:'numeric'})}</span>
                                        <button onClick={() => setPanelCalendarDate(new Date(panelCalendarDate.setMonth(panelCalendarDate.getMonth() + 1)))} className="p-1 hover:bg-zinc-800 rounded"><ChevronRightIcon className="w-4 h-4"/></button>
                                    </div>
                                    {/* Mini Calendar Grid */}
                                    <div className="grid grid-cols-7 text-center text-[10px] gap-y-2">
                                        <div className="text-zinc-500">Pt</div><div className="text-zinc-500">Sa</div><div className="text-zinc-500">Ça</div>
                                        <div className="text-zinc-500">Pe</div><div className="text-zinc-500">Cu</div><div className="text-zinc-500">Ct</div><div className="text-zinc-500">Pz</div>
                                        {(() => {
                                            const daysInMonth = new Date(panelCalendarDate.getFullYear(), panelCalendarDate.getMonth() + 1, 0).getDate();
                                            const firstDay = new Date(panelCalendarDate.getFullYear(), panelCalendarDate.getMonth(), 1).getDay();
                                            const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon=0, Sun=6
                                            const days = [];
                                            
                                            for(let i=0; i<startOffset; i++) days.push(<div key={`empty-${i}`} className="p-1"></div>);
                                            
                                            for(let d=1; d<=daysInMonth; d++) {
                                                const dateStr = `${panelCalendarDate.getFullYear()}-${(panelCalendarDate.getMonth()+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
                                                const hasEvent = calendarEvents.some(e => {
                                                    try {
                                                        const eStart = new Date(e.startTime).toISOString().split('T')[0];
                                                        // Filter per user permission
                                                        if (currentUser.role !== 'admin' && e.createdBy !== currentUser.email && (!Array.isArray(e.attendees) || !e.attendees.includes(currentUser.id))) return false;
                                                        return eStart === dateStr;
                                                    } catch { return false; }
                                                });
                                                const isToday = new Date().toISOString().split('T')[0] === dateStr;
                                                const isSelected = selectedPanelDate === dateStr;

                                                days.push(
                                                    <div 
                                                        key={d} 
                                                        onClick={() => setSelectedPanelDate(isSelected ? null : dateStr)}
                                                        className={`
                                                            p-1 rounded cursor-pointer relative flex items-center justify-center h-8 w-8 mx-auto text-xs
                                                            ${isSelected ? 'bg-orange-500 text-white font-bold' : isToday ? 'bg-zinc-800 text-white border border-zinc-600' : 'text-zinc-400 hover:bg-zinc-800'}
                                                        `}
                                                    >
                                                        {d}
                                                        {hasEvent && !isSelected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-500"></div>}
                                                    </div>
                                                );
                                            }
                                            return days;
                                        })()}
                                    </div>

                                    {/* List events for selected date or upcoming */}
                                    <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                        <div className="text-xs text-zinc-500 font-bold mb-2">
                                            {selectedPanelDate 
                                                ? `${new Date(selectedPanelDate).toLocaleDateString('tr-TR', {day:'numeric', month:'long'})} Etkinlikleri` 
                                                : "Yaklaşan Etkinlikler"
                                            }
                                        </div>
                                        {upcomingEvents.length > 0 ? (
                                            upcomingEvents.map(evt => (
                                                <div 
                                                    key={evt.id} 
                                                    className="flex justify-between items-center p-2 rounded bg-zinc-900/30 border border-zinc-800 hover:bg-zinc-900 cursor-pointer"
                                                    onClick={() => handleOpenCalendarModal(evt)}
                                                >
                                                    <div className="truncate pr-2">
                                                        <div className="text-xs font-bold text-zinc-300 truncate">{evt.title}</div>
                                                        <div className="text-[10px] text-zinc-500 truncate">
                                                             {new Date(evt.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} 
                                                             {evt.location && ` • ${evt.location}`}
                                                        </div>
                                                    </div>
                                                    <div className={`w-2 h-2 rounded-full ${evt.type === 'meeting' ? 'bg-blue-500' : evt.type === 'montaj' ? 'bg-purple-500' : 'bg-zinc-500'}`}></div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-[10px] text-zinc-600 text-center italic">Etkinlik yok.</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Card 3: Salary & Personnel Stats */}
                            <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5 relative overflow-hidden flex flex-col">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold flex items-center gap-2 text-zinc-200">
                                        <UsersIcon className="w-5 h-5 text-purple-500"/> Personel Finans
                                    </h3>
                                    <button onClick={() => setActiveView('salary')} className="text-xs text-purple-400 hover:text-purple-300">Detaylar</button>
                                </div>
                                
                                <div className="space-y-4">
                                    {currentUser?.role === 'admin' ? (
                                        <>
                                            <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                                                <div className="text-xs text-zinc-500 uppercase font-bold mb-1">Toplam Onaylanan Ödeme</div>
                                                <div className="text-2xl font-bold text-white">{settings.salary_approved} ₺</div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div 
                                                    onClick={() => { setActiveView('salary'); setActiveSalaryTab('hours'); }}
                                                    className="p-3 bg-zinc-900/30 rounded-lg border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors"
                                                >
                                                    <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Onay Bekleyen</div>
                                                    <div className="text-lg font-bold text-yellow-500">{workLogs.filter(l => l.status === 'pending').length} Giriş</div>
                                                </div>
                                                <div className="p-3 bg-zinc-900/30 rounded-lg border border-zinc-800">
                                                    <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Personel Sayısı</div>
                                                    <div className="text-lg font-bold text-blue-400">{employees.length} Kişi</div>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center text-zinc-500 py-10 text-sm">
                                            Finansal özet sadece yöneticiler içindir. Kendi maaş detaylarınız için "Maaş Ödemesi" sekmesine gidiniz.
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                )}
                
                {/* SETTINGS VIEW */}
                {activeView === 'settings' && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        <h2 className="text-2xl font-bold">Ayarlar</h2>
                        
                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-6">
                            <h3 className="text-lg font-bold mb-4">Profil & Güvenlik</h3>
                            <div className="space-y-4">
                                <div className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                                    <div className="text-sm text-zinc-400">Giriş Yapılan Hesap</div>
                                    <div className="text-white font-medium">{currentUser.email}</div>
                                    <div className="text-xs text-blue-500 capitalize">{currentUser.role}</div>
                                </div>
                                
                                <div className="border-t border-zinc-800 pt-4">
                                    <h4 className="text-sm font-bold text-zinc-300 mb-3">Şifre Değiştir</h4>
                                    <div className="space-y-3">
                                        <input 
                                            type="password" 
                                            placeholder="Yeni Şifre"
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                        />
                                        <input 
                                            type="password" 
                                            placeholder="Şifre Tekrar"
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                        />
                                        <button 
                                            onClick={handleChangePassword}
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold"
                                        >
                                            Güncelle
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {currentUser.role === 'admin' && (
                            <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-6">
                                <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> Çalışma Yerleri
                                </h3>
                                <p className="text-xs text-zinc-500 mb-4">Tüm personelin kullandığı ortak proje/iş yeri listesi. Buradan ekleyip silebilirsiniz.</p>
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <input
                                            id="new-location-input"
                                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-sm"
                                            placeholder="Yeni çalışma yeri adı..."
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter') {
                                                    const val = (e.target as HTMLInputElement).value.trim();
                                                    if (!val) return;
                                                    await upsertLocation(val);
                                                    setLocations(prev => {
                                                        if (prev.some(l => l.name.toLowerCase() === val.toLowerCase())) return prev;
                                                        return [...prev, { id: val, name: val }].sort((a, b) => a.name.localeCompare(b.name));
                                                    });
                                                    (e.target as HTMLInputElement).value = '';
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={async () => {
                                                const input = document.getElementById('new-location-input') as HTMLInputElement;
                                                const val = input?.value.trim();
                                                if (!val) return;
                                                await upsertLocation(val);
                                                setLocations(prev => {
                                                    if (prev.some(l => l.name.toLowerCase() === val.toLowerCase())) return prev;
                                                    return [...prev, { id: val, name: val }].sort((a, b) => a.name.localeCompare(b.name));
                                                });
                                                if (input) input.value = '';
                                            }}
                                            className="px-3 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-sm font-bold"
                                        >Ekle</button>
                                    </div>
                                    {locations.length === 0 ? (
                                        <p className="text-zinc-600 text-sm text-center py-4">Henüz kayıtlı çalışma yeri yok.</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {locations.map(loc => (
                                                <div key={loc.id} className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1">
                                                    <span className="text-sm text-zinc-200">{loc.name}</span>
                                                    <button
                                                        onClick={async () => {
                                                            await deleteLocation(loc.id);
                                                            setLocations(prev => prev.filter(l => l.id !== loc.id));
                                                        }}
                                                        className="text-zinc-600 hover:text-red-400 ml-1 transition-colors"
                                                    ><XMarkIcon className="w-3.5 h-3.5"/></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {currentUser.role === 'admin' && (
                            <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-6">
                                <h3 className="text-lg font-bold mb-4">Uygulama Bilgisi</h3>
                                <div className="text-sm text-zinc-500 space-y-2">
                                    <p>Sürüm: 1.0.0 (Beta)</p>
                                    <p>Veritabanı: Supabase</p>
                                    <p>Made By 2MCWerbung</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TASKS VIEW (Card/Grid Style - Reverted) */}
                {activeView === 'tasks' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <ClipboardDocumentCheckIcon className="w-6 h-6 text-blue-500"/> Görev Takip
                            </h2>
                            <button onClick={() => { setEditingTask(null); setShowTaskModal(true); }} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                                <PlusIcon className="w-4 h-4"/> Yeni Görev
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(() => {
                                const visibleTasks = tasks.filter(t => currentUser?.role === 'admin' || t.employeeId === currentUser?.id);
                                const sortedTasks = [...visibleTasks].sort((a, b) => {
                                    if (a.status === 'completed' && b.status !== 'completed') return 1;
                                    if (a.status !== 'completed' && b.status === 'completed') return -1;
                                    return 0;
                                });
                                return sortedTasks.length > 0 ? sortedTasks.map(task => (
                                <div key={task.id} className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5 hover:border-blue-500/50 transition-all group relative flex flex-col">
                                    
                                    <div className="flex justify-between items-start mb-3">
                                        <h3 className="font-bold text-white text-lg truncate pr-2">{task.title}</h3>
                                        <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold border ${
                                            task.priority === 'high' ? 'bg-red-900/20 text-red-400 border-red-900/50' : 
                                            task.priority === 'medium' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-900/50' : 
                                            'bg-green-900/20 text-green-400 border-green-900/50'
                                        }`}>
                                            {task.priority === 'high' ? 'Acil' : task.priority === 'medium' ? 'Orta' : 'Düşük'}
                                        </span>
                                    </div>

                                    <p className="text-sm text-zinc-400 mb-4 line-clamp-2 flex-1">{task.description || 'Açıklama yok.'}</p>

                                    {task.steps && task.steps.length > 0 && (
                                        <div className="mb-4 space-y-2">
                                            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Alt Görevler</h4>
                                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                                                {task.steps.map(step => (
                                                    <div key={step.id} className="flex items-start gap-2 text-sm group/step">
                                                        <button 
                                                            onClick={() => handleToggleCardTaskStep(task.id, step.id, step.completed)}
                                                            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${step.completed ? 'bg-green-500 border-green-500 text-white' : 'border-zinc-600 hover:border-blue-500'}`}
                                                        >
                                                            {step.completed && <CheckIcon className="w-3 h-3" />}
                                                        </button>
                                                        <span className={`text-zinc-300 text-xs ${step.completed ? 'line-through opacity-50' : ''}`}>
                                                            {step.text}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3 mt-auto">
                                        <div className="flex justify-between text-xs text-zinc-500">
                                            <div className="flex items-center gap-1">
                                                <UserCircleIcon className="w-3 h-3"/>
                                                {employees.find(e => e.id === task.employeeId)?.name || 'Atanmamış'}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <CalendarIcon className="w-3 h-3"/>
                                                {task.dueDate}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                                                <span>İlerleme</span>
                                                <span>{task.progress}%</span>
                                            </div>
                                            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`} style={{width: `${task.progress}%`}}></div>
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t border-zinc-800/50 flex justify-end gap-2">
                                            <button 
                                                onClick={() => { setEditingTask(task); setTaskForm({...task}); setShowTaskModal(true); }}
                                                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white transition-colors"
                                            >
                                                <PencilSquareIcon className="w-4 h-4"/>
                                            </button>
                                            <button 
                                                onClick={() => deleteTask(task.id).then(() => setTasks(prev => prev.filter(p => p.id !== task.id)))}
                                                className="p-1.5 hover:bg-red-900/20 rounded text-zinc-500 hover:text-red-500 transition-colors"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-full flex flex-col items-center justify-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                                    <ClipboardDocumentCheckIcon className="w-12 h-12 mb-3 opacity-20"/>
                                    <p>Henüz bir görev eklenmemiş.</p>
                                </div>
                            );
                            })()}
                        </div>
                    </div>
                )}

                {/* CALENDAR VIEW (Previously causing Black Screen) */}
                {activeView === 'calendar' && (
                    <div className="space-y-6 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-2xl font-bold flex items-center gap-2">
                                <CalendarDaysIcon className="w-6 h-6 text-orange-500"/> Takvim
                            </h2>
                            <div className="flex items-center gap-4">
                                <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                                    <button onClick={() => setPanelCalendarDate(new Date(panelCalendarDate.setMonth(panelCalendarDate.getMonth() - 1)))} className="p-2 hover:bg-zinc-800 rounded"><ChevronDownIcon className="w-4 h-4 rotate-90"/></button>
                                    <span className="px-4 py-1 font-bold text-white min-w-[120px] text-center">{panelCalendarDate.toLocaleDateString('tr-TR', {month:'long', year:'numeric'})}</span>
                                    <button onClick={() => setPanelCalendarDate(new Date(panelCalendarDate.setMonth(panelCalendarDate.getMonth() + 1)))} className="p-2 hover:bg-zinc-800 rounded"><ChevronRightIcon className="w-4 h-4"/></button>
                                </div>
                                <button onClick={() => handleOpenCalendarModal()} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                                    <PlusIcon className="w-4 h-4"/> Etkinlik Ekle
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-[#0e0e11] border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
                            {/* Calendar Header */}
                            <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/50">
                                {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map(day => (
                                    <div key={day} className="py-3 text-center text-xs font-bold text-zinc-500 uppercase">{day}</div>
                                ))}
                            </div>
                            
                            {/* Calendar Grid */}
                            <div className="grid grid-cols-7 flex-1 auto-rows-fr bg-zinc-900/20">
                                {(() => {
                                    const year = panelCalendarDate.getFullYear();
                                    const month = panelCalendarDate.getMonth();
                                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                                    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon
                                    // Adjust for Monday start (Mon=0, Sun=6)
                                    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
                                    
                                    const cells = [];
                                    
                                    // Empty cells
                                    for(let i=0; i<startOffset; i++) {
                                        cells.push(<div key={`empty-${i}`} className="border-r border-b border-zinc-800/50 bg-zinc-900/40"></div>);
                                    }

                                    // Days
                                    for(let d=1; d<=daysInMonth; d++) {
                                        const dateStr = `${year}-${(month+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
                                        const isToday = new Date().toISOString().split('T')[0] === dateStr;
                                        
                                        // Filter events for this day
                                        const daysEvents = calendarEvents.filter(e => {
                                            try {
                                                const eDate = new Date(e.startTime).toISOString().split('T')[0];
                                                // Check permissions
                                                const hasAccess = currentUser?.role === 'admin' || e.createdBy === currentUser?.id || (e.attendees && e.attendees.includes(currentUser?.id));
                                                return eDate === dateStr && hasAccess;
                                            } catch { return false; }
                                        }).sort((a,b) => a.startTime.localeCompare(b.startTime));

                                        cells.push(
                                            <div 
                                                key={d} 
                                                onClick={() => {
                                                    setCalendarForm(prev => ({...prev, startTime: `${dateStr}T09:00`, endTime: `${dateStr}T10:00`}));
                                                    setShowCalendarModal(true);
                                                }}
                                                className={`
                                                    min-h-[100px] border-r border-b border-zinc-800/50 p-2 cursor-pointer hover:bg-zinc-800/30 transition-colors relative group
                                                    ${isToday ? 'bg-blue-900/10' : ''}
                                                `}
                                            >
                                                <span className={`text-sm font-bold ${isToday ? 'text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full' : 'text-zinc-400'}`}>
                                                    {d}
                                                </span>
                                                
                                                <div className="mt-2 space-y-1">
                                                    {daysEvents.map(evt => (
                                                        <div 
                                                            key={evt.id}
                                                            onClick={(e) => { e.stopPropagation(); handleOpenCalendarModal(evt); }}
                                                            className={`
                                                                text-[10px] px-1.5 py-1 rounded truncate border border-transparent hover:border-zinc-600
                                                                ${evt.type === 'meeting' ? 'bg-blue-900/40 text-blue-300' : evt.type === 'deadline' ? 'bg-red-900/40 text-red-300' : 'bg-zinc-800 text-zinc-300'}
                                                            `}
                                                        >
                                                            {new Date(evt.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} {evt.title}
                                                        </div>
                                                    ))}
                                                </div>
                                                
                                                {/* Add button on hover */}
                                                <button className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 p-1 bg-zinc-800 rounded text-zinc-400 hover:text-white">
                                                    <PlusIcon className="w-3 h-3"/>
                                                </button>
                                            </div>
                                        );
                                    }
                                    return cells;
                                })()}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* SALARY VIEW */}
                {activeView === 'salary' && (
                    <div className="space-y-6">
                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-bold flex items-center gap-2">
                                    <div className="w-10 h-10 bg-indigo-900/50 rounded-lg flex items-center justify-center text-indigo-400">
                                        <UsersIcon className="w-6 h-6"/>
                                    </div>
                                    Personel & Maaş
                                </h2>
                                <p className="text-sm text-zinc-500 mt-1">Çalışan saatleri, puantaj ve maaş hesaplama modülü.</p>
                            </div>
                            
                            <div className="flex overflow-x-auto bg-zinc-900 p-1 rounded-lg border border-zinc-800 max-w-full">
                                <button 
                                    onClick={() => setActiveSalaryTab('employees')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSalaryTab === 'employees' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-2"><UsersIcon className="w-4 h-4"/> Personel Listesi</div>
                                </button>
                                <button 
                                    onClick={() => setActiveSalaryTab('hours')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSalaryTab === 'hours' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-2"><ClockIcon className="w-4 h-4"/> Saat Girişi</div>
                                </button>
                                <button
                                    onClick={() => setActiveSalaryTab('payroll')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSalaryTab === 'payroll' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-2"><BanknotesIcon className="w-4 h-4"/> Maaş Bordrosu</div>
                                </button>
                                <button
                                    onClick={() => setActiveSalaryTab('costs')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSalaryTab === 'costs' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-2"><ArrowTrendingUpIcon className="w-4 h-4"/> Maliyet Analizi</div>
                                </button>
                                <button
                                    onClick={() => setActiveSalaryTab('records')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeSalaryTab === 'records' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <div className="flex items-center gap-2"><PencilSquareIcon className="w-4 h-4"/> Kayıt Düzenle</div>
                                </button>
                            </div>
                        </div>

                        {/* 1. EMPLOYEES TAB */}
                        {activeSalaryTab === 'employees' && (
                            <div>
                                <div className="flex justify-end mb-4">
                                    {currentUser?.role === 'admin' && (
                                        <button 
                                            onClick={handleOpenAddEmployee}
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                                        >
                                            <PlusIcon className="w-4 h-4" /> Personel Ekle
                                        </button>
                                    )}
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {employees
                                        .filter(e => currentUser?.role === 'admin' || e.id === currentUser?.id)
                                        .map(emp => (
                                        <div key={emp.id} className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5 hover:border-blue-600 transition-colors group relative">
                                            {currentUser?.role === 'admin' && (
                                                <div className="absolute top-4 right-4 flex gap-2">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleEditEmployee(emp); }}
                                                        className="p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-blue-400 transition-colors"
                                                    >
                                                        <PencilSquareIcon className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteEmployee(emp.id); }}
                                                        className="p-2 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-400">
                                                    {emp.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-white">{emp.name}</h3>
                                                    <p className="text-xs text-zinc-500">{emp.role}</p>
                                                    <p className="text-[10px] text-zinc-600">{emp.email}</p>
                                                </div>
                                            </div>

                                            <div className="space-y-2 border-t border-zinc-800/50 pt-3">
                                                <div className="flex justify-between text-sm items-center">
                                                    <span className="text-zinc-500">Saatlik Ücret (Brüt)</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-green-400">{emp.hourlyRate.toFixed(2)} €</span>
                                                        {currentUser?.role === 'admin' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleOpenSalaryUpdate(emp); }}
                                                                className="text-[10px] bg-green-900/20 text-green-400 border border-green-800 px-2 py-0.5 rounded hover:bg-green-900/40 transition-colors flex items-center gap-1"
                                                            >
                                                                <ArrowTrendingUpIcon className="w-3 h-3"/> Zam Yap
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="mt-4 pt-3 border-t border-zinc-800/50">
                                                <div className="bg-zinc-900/50 rounded px-2 py-1 text-[10px] text-zinc-500 font-mono text-center">
                                                    Şifre: 123 (Varsayılan)
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ... (Hours View - Unchanged) ... */}
                        {activeSalaryTab === 'hours' && (
                            <div className="flex flex-col gap-4">
                                {/* Mobile Toggle Button for Hours View */}
                                <div className="flex lg:hidden bg-zinc-900 p-1 rounded-lg border border-zinc-800 self-center">
                                    <button 
                                        onClick={() => setMobileHoursTab('form')}
                                        className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${mobileHoursTab === 'form' ? 'bg-blue-600 text-white' : 'text-zinc-500'}`}
                                    >
                                        Giriş Formu
                                    </button>
                                    <button 
                                        onClick={() => setMobileHoursTab('list')}
                                        className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${mobileHoursTab === 'list' ? 'bg-blue-600 text-white' : 'text-zinc-500'}`}
                                    >
                                        Geçmiş Kayıtlar
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Left: Entry Form (Hidden on mobile if list selected) */}
                                    <div className={`lg:col-span-1 ${mobileHoursTab === 'form' ? 'block' : 'hidden lg:block'}`}>
                                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5 sticky top-4">
                                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                                <ClockIcon className="w-5 h-5 text-blue-500" /> Saat Girişi Ekle
                                            </h3>
                                            
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-xs text-zinc-400 block mb-1">Personel</label>
                                                    <select 
                                                        className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                                        value={hourEntry.employeeId}
                                                        onChange={e => setHourEntry({...hourEntry, employeeId: e.target.value})}
                                                        disabled={currentUser?.role !== 'admin'}
                                                    >
                                                        <option value="">Seçiniz...</option>
                                                        {employees.filter(e => currentUser.role === 'admin' || e.id === currentUser.id).map(e => (
                                                            <option key={e.id} value={e.id}>{e.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-zinc-400 block mb-1">Tarih</label>
                                                    <input 
                                                        type="date"
                                                        className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                                        value={hourEntry.date}
                                                        onChange={e => setHourEntry({...hourEntry, date: e.target.value})}
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-[10px] text-zinc-500 uppercase block mb-1">▷ Başlangıç</label>
                                                        <input 
                                                            type="time"
                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-center"
                                                            value={hourEntry.startTime}
                                                            onChange={e => setHourEntry({...hourEntry, startTime: e.target.value})}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-zinc-500 uppercase block mb-1">□ Bitiş</label>
                                                        <input 
                                                            type="time"
                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-center"
                                                            value={hourEntry.endTime}
                                                            onChange={e => setHourEntry({...hourEntry, endTime: e.target.value})}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                     <div>
                                                        <label className="text-[10px] text-zinc-500 uppercase block mb-1">|| Mola (Dk)</label>
                                                        <input 
                                                            type="number"
                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                                            value={hourEntry.breakMinutes}
                                                            onChange={e => setHourEntry({...hourEntry, breakMinutes: Number(e.target.value)})}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-green-500 uppercase block mb-1">Net Süre (Saat)</label>
                                                        <div className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded p-2 text-green-400 font-bold text-center">
                                                            {calculatedNetHours} s
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-zinc-400 block mb-1">Çalışma Yeri</label>
                                                    <div className="relative">
                                                        <input
                                                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                                            placeholder="Seçin veya yeni yer yazın..."
                                                            value={hourEntry.location}
                                                            onChange={e => {
                                                                setHourEntry({...hourEntry, location: e.target.value});
                                                                setLocationSearch(e.target.value);
                                                                setShowLocationDropdown(true);
                                                            }}
                                                            onFocus={() => setShowLocationDropdown(true)}
                                                            onBlur={() => setTimeout(() => setShowLocationDropdown(false), 150)}
                                                        />
                                                        {showLocationDropdown && (
                                                            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                                                {locations
                                                                    .filter(l => !locationSearch || l.name.toLowerCase().includes(locationSearch.toLowerCase()))
                                                                    .map(l => (
                                                                        <button
                                                                            key={l.id}
                                                                            type="button"
                                                                            className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                                                                            onMouseDown={() => {
                                                                                setHourEntry({...hourEntry, location: l.name});
                                                                                setShowLocationDropdown(false);
                                                                                setLocationSearch('');
                                                                            }}
                                                                        >
                                                                            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block shrink-0"></span>
                                                                            {l.name}
                                                                        </button>
                                                                    ))
                                                                }
                                                                {locationSearch && !locations.some(l => l.name.toLowerCase() === locationSearch.toLowerCase()) && (
                                                                    <div className="px-3 py-2 text-xs text-zinc-500 italic border-t border-zinc-800">
                                                                        "{locationSearch}" — kaydetmek için Kaydet'e bas
                                                                    </div>
                                                                )}
                                                                {locations.length === 0 && !locationSearch && (
                                                                    <div className="px-3 py-2 text-xs text-zinc-600">Henüz kayıtlı yer yok. Yeni yer yazabilirsiniz.</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Quick chips */}
                                                    {locations.length > 0 && !hourEntry.location && (
                                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                                            {locations.slice(0, 8).map(l => (
                                                                <button
                                                                    key={l.id}
                                                                    type="button"
                                                                    onClick={() => setHourEntry({...hourEntry, location: l.name})}
                                                                    className="text-xs bg-zinc-800 hover:bg-purple-900/50 border border-zinc-700 hover:border-purple-600 text-zinc-300 hover:text-purple-300 px-2 py-1 rounded-full transition-colors"
                                                                >
                                                                    {l.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="text-xs text-zinc-400 block mb-1">Açıklama</label>
                                                    <input
                                                        className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                                        placeholder="Mutfak kurma, silikon çekme, elektrik bağlama vb."
                                                        value={hourEntry.description}
                                                        onChange={e => setHourEntry({...hourEntry, description: e.target.value})}
                                                    />
                                                </div>
                                                <button 
                                                    onClick={handleSaveHourEntry}
                                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg mt-2"
                                                >
                                                    Kaydet
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Right: History List Tree View (Hidden on mobile if form selected) */}
                                    <div className={`lg:col-span-2 ${mobileHoursTab === 'list' ? 'block' : 'hidden lg:block'}`}>
                                         <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold">Son Çalışma Kayıtları <span className="text-xs font-normal text-zinc-500 ml-2">{workLogs.filter(l => currentUser?.role === 'admin' || l.employeeId === currentUser?.id).length} Kayıt</span></h3>
                                            <div className="flex items-center bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                                                <button onClick={() => setSelectedSalaryDate(new Date(selectedSalaryDate.setMonth(selectedSalaryDate.getMonth() - 1)))} className="p-1 hover:bg-zinc-800 rounded"><ChevronDownIcon className="w-4 h-4 rotate-90" /></button>
                                                <span className="px-3 text-sm font-mono uppercase">{selectedSalaryDate.toLocaleString('tr-TR', { month: 'long', year: 'numeric' })}</span>
                                                <button onClick={() => setSelectedSalaryDate(new Date(selectedSalaryDate.setMonth(selectedSalaryDate.getMonth() + 1)))} className="p-1 hover:bg-zinc-800 rounded"><ChevronRightIcon className="w-4 h-4" /></button>
                                            </div>
                                         </div>

                                         <div className="space-y-4">
                                            {/* Group by Employee */}
                                            {employees
                                                .filter(e => currentUser?.role === 'admin' || e.id === currentUser?.id)
                                                .map(emp => {
                                                    const empLogs = workLogs.filter(l => l.employeeId === emp.id);
                                                    if(empLogs.length === 0) return null;

                                                    const logsByMonth: Record<string, WorkLog[]> = {};
                                                    empLogs.forEach(l => {
                                                        const date = new Date(l.date);
                                                        const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                                                        if (!logsByMonth[key]) logsByMonth[key] = [];
                                                        logsByMonth[key].push(l);
                                                    });

                                                    // Sort months descending
                                                    const sortedMonths = Object.keys(logsByMonth).sort().reverse();
                                                    
                                                    return (
                                                        <div key={emp.id} className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-3">
                                                            <div 
                                                                className="flex justify-between items-center cursor-pointer mb-2"
                                                                onClick={() => toggleEmployeeExpand(emp.id)}
                                                            >
                                                                <div className="font-bold text-zinc-300">{emp.name}</div>
                                                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${expandedEmployees[emp.id] ? 'rotate-180' : ''}`} />
                                                            </div>
                                                            
                                                            {expandedEmployees[emp.id] && (
                                                                <div className="space-y-3 pl-2 border-l border-zinc-800">
                                                                    {sortedMonths.map(monthKey => {
                                                                        const expandKey = `${emp.id}-${monthKey}`;
                                                                        const isExpanded = expandedSalaryMonths[expandKey];
                                                                        
                                                                        return (
                                                                        <div key={monthKey} className="mb-4 last:mb-0">
                                                                             {/* Month Header / "Tab" */}
                                                                             <div 
                                                                                onClick={() => toggleSalaryMonth(expandKey)}
                                                                                className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 px-3 py-2 rounded-lg mb-2 cursor-pointer hover:bg-zinc-800 transition-colors"
                                                                             >
                                                                                 <div className="flex items-center gap-2">
                                                                                     <ChevronDownIcon className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                                                     <CalendarDaysIcon className="w-4 h-4 text-blue-500" />
                                                                                     <span className="font-bold text-sm text-zinc-200 tracking-wide font-mono">{monthKey}</span>
                                                                                 </div>
                                                                                 <div className="text-[10px] text-zinc-500 font-mono">
                                                                                     Toplam: <span className="text-zinc-300">{logsByMonth[monthKey].reduce((sum, l) => sum + l.netHours, 0)}s</span>
                                                                                 </div>
                                                                             </div>

                                                                             {/* Logs List */}
                                                                             {isExpanded && (
                                                                                 <div className="space-y-1 pl-1 animate-fadeIn">
                                                                                     {logsByMonth[monthKey].map(log => (
                                                                                         <div key={log.id} className="flex justify-between items-center text-xs bg-black/20 p-2 rounded border border-zinc-800/30 hover:border-zinc-700 transition-colors group">
                                                                                             <div className="flex flex-col gap-1">
                                                                                                 <div className="flex items-center gap-2 flex-wrap">
                                                                                                     <span className="text-zinc-500 font-mono text-[10px]">{log.date}</span>
                                                                                                     {log.location && (
                                                                                                         <span className="text-[10px] bg-purple-900/40 text-purple-300 border border-purple-800/50 px-1.5 py-0.5 rounded-full font-medium">
                                                                                                             📍 {log.location}
                                                                                                         </span>
                                                                                                     )}
                                                                                                 </div>
                                                                                                 <span className="text-zinc-500 text-[9px] flex items-center gap-1 font-mono">
                                                                                                     <ClockIcon className="w-3 h-3 text-zinc-600"/>
                                                                                                     {log.startTime} - {log.endTime}
                                                                                                     <span className="text-zinc-700">|</span>
                                                                                                     Mola: {log.breakMinutes}dk
                                                                                                 </span>
                                                                                                 <span className="text-zinc-300 font-medium">{log.description || 'Çalışma'}</span>
                                                                                             </div>
                                                                                             <div className="flex items-center gap-3">
                                                                                                 <span className="font-bold text-blue-400 font-mono text-sm">{log.netHours}s</span>
                                                                                                 {currentUser?.role === 'admin' && (
                                                                                                     <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                                                        {log.status === 'pending' && (
                                                                                                            <>
                                                                                                            <button onClick={() => handleApproveLog(log.id)} className="p-1 hover:bg-green-900/30 rounded text-green-500"><CheckIcon className="w-3 h-3"/></button>
                                                                                                            <button onClick={() => handleRejectLog(log.id)} className="p-1 hover:bg-red-900/30 rounded text-red-500"><XMarkIcon className="w-3 h-3"/></button>
                                                                                                            </>
                                                                                                        )}
                                                                                                        <button onClick={() => handleDeleteWorkLog(log.id)} className="p-1 hover:bg-zinc-800 rounded text-zinc-600 hover:text-red-400"><TrashIcon className="w-3 h-3"/></button>
                                                                                                     </div>
                                                                                                 )}
                                                                                                 {log.status === 'approved' && <CheckIcon className="w-3 h-3 text-green-500"/>}
                                                                                                 {log.status === 'rejected' && <XCircleIcon className="w-3 h-3 text-red-500"/>}
                                                                                             </div>
                                                                                         </div>
                                                                                     ))}
                                                                                 </div>
                                                                             )}
                                                                        </div>
                                                                    )})}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            {workLogs.filter(l => currentUser?.role === 'admin' || l.employeeId === currentUser?.id).length === 0 && (
                                                <div className="text-center text-zinc-500 text-sm py-4">Kayıt bulunamadı.</div>
                                            )}
                                            </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 4. COSTS TAB */}
                        {activeSalaryTab === 'costs' && (() => {
                            const costsMonthStr = `${costsMonth.getFullYear()}-${(costsMonth.getMonth() + 1).toString().padStart(2, '0')}`;
                            const filteredLogs = workLogs.filter(l => {
                                const monthMatch = l.date.substring(0, 7) === costsMonthStr;
                                const statusMatch = costsStatusFilter === 'all' || l.status === 'approved';
                                return monthMatch && statusMatch;
                            });
                            const logsWithCost = filteredLogs.map(l => {
                                const emp = employees.find(e => e.id === l.employeeId);
                                const rate = emp ? getHourlyRateForDate(emp, l.date) : 0;
                                return { ...l, empName: emp?.name ?? 'Bilinmeyen', rate, cost: l.netHours * rate };
                            });
                            const hourlyTotalCost = logsWithCost.reduce((s, l) => s + l.cost, 0);
                            const totalHours = logsWithCost.reduce((s, l) => s + l.netHours, 0);
                            const activeDays = new Set(logsWithCost.map(l => l.date));
                            const activeLocations = new Set(logsWithCost.map(l => l.location).filter(Boolean));

                            // Monthly salary employees (fixed monthly salary)
                            const salariedEmps = employees.filter(e => (e.monthly_net_salary || 0) > 0);
                            const totalMonthlySalaries = salariedEmps.reduce((s, e) => s + (e.monthly_net_salary || 0), 0);

                            // Working days in the selected month (Mon-Fri)
                            const daysInMonth = new Date(costsMonth.getFullYear(), costsMonth.getMonth() + 1, 0).getDate();
                            let workingDaysInMonth = 0;
                            for (let d = 1; d <= daysInMonth; d++) {
                                const dow = new Date(costsMonth.getFullYear(), costsMonth.getMonth(), d).getDay();
                                if (dow !== 0 && dow !== 6) workingDaysInMonth++;
                            }
                            const dailySalaryCost = workingDaysInMonth > 0 ? totalMonthlySalaries / workingDaysInMonth : 0;

                            const totalCost = hourlyTotalCost + totalMonthlySalaries;
                            const avgCostPerDay = activeDays.size > 0 ? (hourlyTotalCost / activeDays.size) + dailySalaryCost : 0;

                            const byDate: Record<string, typeof logsWithCost> = {};
                            logsWithCost.forEach(l => { if (!byDate[l.date]) byDate[l.date] = []; byDate[l.date].push(l); });
                            const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

                            const byLocation: Record<string, { hours: number; cost: number }> = {};
                            logsWithCost.forEach(l => {
                                const loc = l.location || '(Belirtilmemiş)';
                                if (!byLocation[loc]) byLocation[loc] = { hours: 0, cost: 0 };
                                byLocation[loc].hours += l.netHours;
                                byLocation[loc].cost += l.cost;
                            });
                            const sortedLocations = Object.entries(byLocation).sort((a, b) => b[1].cost - a[1].cost);

                            // Hourly employees monthly average
                            const byEmployee: Record<string, { name: string; hours: number; cost: number; rate: number; monthly_net_salary: number }> = {};
                            logsWithCost.forEach(l => {
                                const emp = employees.find(e => e.id === l.employeeId);
                                if (!byEmployee[l.employeeId]) byEmployee[l.employeeId] = { name: l.empName, hours: 0, cost: 0, rate: l.rate, monthly_net_salary: emp?.monthly_net_salary || 0 };
                                byEmployee[l.employeeId].hours += l.netHours;
                                byEmployee[l.employeeId].cost += l.cost;
                            });
                            // Also add salaried employees who may not have hourly logs this month
                            salariedEmps.forEach(e => {
                                if (!byEmployee[e.id]) {
                                    byEmployee[e.id] = { name: e.name, hours: 0, cost: 0, rate: e.hourlyRate, monthly_net_salary: e.monthly_net_salary || 0 };
                                }
                            });
                            const sortedEmployees = Object.entries(byEmployee).sort((a, b) => {
                                const totalA = a[1].cost + a[1].monthly_net_salary;
                                const totalB = b[1].cost + b[1].monthly_net_salary;
                                return totalB - totalA;
                            });

                            return (
                                <div className="space-y-6">
                                    {/* Header */}
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0e0e11] border border-zinc-800 p-4 rounded-xl">
                                        <div>
                                            <h3 className="font-bold text-white flex items-center gap-2">
                                                <ArrowTrendingUpIcon className="w-5 h-5 text-emerald-400"/> Maliyet Analizi
                                            </h3>
                                            <p className="text-xs text-zinc-500 mt-0.5">İş yeri ve personel bazlı maliyet dağılımı</p>
                                        </div>
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1">
                                                <button onClick={() => setCostsMonth(new Date(costsMonth.getFullYear(), costsMonth.getMonth() - 1, 1))} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white">
                                                    <ChevronDownIcon className="w-4 h-4 rotate-90"/>
                                                </button>
                                                <span className="text-sm font-mono text-white w-36 text-center">
                                                    {costsMonth.toLocaleString('tr-TR', { month: 'long', year: 'numeric' })}
                                                </span>
                                                <button onClick={() => setCostsMonth(new Date(costsMonth.getFullYear(), costsMonth.getMonth() + 1, 1))} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white">
                                                    <ChevronRightIcon className="w-4 h-4"/>
                                                </button>
                                            </div>
                                            <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg p-0.5">
                                                <button onClick={() => setCostsStatusFilter('approved')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${costsStatusFilter === 'approved' ? 'bg-emerald-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Onaylı</button>
                                                <button onClick={() => setCostsStatusFilter('all')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${costsStatusFilter === 'all' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Tümü</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* KPI Cards */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-4">
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Toplam Maliyet</div>
                                            <div className="text-2xl font-mono font-bold text-emerald-400">{totalCost.toFixed(2)} €</div>
                                            <div className="text-[10px] text-zinc-600 mt-1">saat ({hourlyTotalCost.toFixed(0)}€) + maaş ({totalMonthlySalaries.toFixed(0)}€)</div>
                                        </div>
                                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-4">
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Toplam Saat</div>
                                            <div className="text-2xl font-mono font-bold text-blue-400">{totalHours.toFixed(1)} s</div>
                                            <div className="text-[10px] text-zinc-600 mt-1">{activeDays.size} aktif gün</div>
                                        </div>
                                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-4">
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Ort. Günlük Maliyet</div>
                                            <div className="text-2xl font-mono font-bold text-yellow-400">{avgCostPerDay.toFixed(2)} €</div>
                                            <div className="text-[10px] text-zinc-600 mt-1">saatlik + maaş payı</div>
                                        </div>
                                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-4">
                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Aylık Sabit Maaş</div>
                                            <div className="text-2xl font-mono font-bold text-pink-400">{totalMonthlySalaries.toFixed(2)} €</div>
                                            <div className="text-[10px] text-zinc-600 mt-1">{salariedEmps.length} maaşlı personel · {activeLocations.size} lokasyon</div>
                                        </div>
                                    </div>

                                    {/* Per-Location + Per-Employee */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5">
                                            <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm">
                                                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> İş Yeri Bazlı Maliyet
                                            </h4>
                                            {sortedLocations.length === 0 ? (
                                                <p className="text-zinc-600 text-sm text-center py-6">Bu ay için kayıt yok.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {sortedLocations.map(([loc, data]) => {
                                                        const pct = totalCost > 0 ? (data.cost / totalCost) * 100 : 0;
                                                        return (
                                                            <div key={loc}>
                                                                <div className="flex justify-between items-center text-sm mb-1">
                                                                    <span className="text-zinc-300 font-medium truncate max-w-[55%]">{loc}</span>
                                                                    <div className="flex items-center gap-3 shrink-0">
                                                                        <span className="text-zinc-500 text-xs">{data.hours.toFixed(1)} s</span>
                                                                        <span className="text-emerald-400 font-mono font-bold">{data.cost.toFixed(2)} €</span>
                                                                    </div>
                                                                </div>
                                                                <div className="w-full bg-zinc-800 rounded-full h-1.5">
                                                                    <div className="bg-purple-500 h-1.5 rounded-full transition-all" style={{ width: `${pct.toFixed(1)}%` }}/>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5">
                                            <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm">
                                                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> Personel Bazlı Maliyet
                                            </h4>
                                            {sortedEmployees.length === 0 ? (
                                                <p className="text-zinc-600 text-sm text-center py-6">Bu ay için kayıt yok.</p>
                                            ) : (
                                                <div className="space-y-3">
                                                    {sortedEmployees.map(([empId, data]) => {
                                                        const empTotal = data.cost + data.monthly_net_salary;
                                                        const pct = totalCost > 0 ? (empTotal / totalCost) * 100 : 0;
                                                        return (
                                                            <div key={empId}>
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300">{data.name.charAt(0).toUpperCase()}</div>
                                                                        <div>
                                                                            <div className="text-sm text-zinc-200 font-medium leading-none">{data.name}</div>
                                                                            {data.monthly_net_salary > 0
                                                                                ? <div className="text-[10px] text-pink-500">aylık {data.monthly_net_salary.toFixed(0)} € · {data.hours.toFixed(1)} s</div>
                                                                                : <div className="text-[10px] text-zinc-600">{data.rate.toFixed(2)} €/s · {data.hours.toFixed(1)} s</div>
                                                                            }
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <div className="text-emerald-400 font-mono font-bold text-sm">{empTotal.toFixed(2)} €</div>
                                                                        {data.cost > 0 && data.monthly_net_salary > 0 && (
                                                                            <div className="text-[10px] text-zinc-500">{data.cost.toFixed(0)}€ saat + {data.monthly_net_salary.toFixed(0)}€ maaş</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="w-full bg-zinc-800 rounded-full h-1.5">
                                                                    <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pct.toFixed(1)}%` }}/>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Daily Breakdown */}
                                    <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5">
                                        <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm">
                                            <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block"></span> Günlük Maliyet Dökümü
                                        </h4>
                                        {sortedDates.length === 0 ? (
                                            <p className="text-zinc-600 text-sm text-center py-6">Bu ay için kayıt yok.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {sortedDates.map(date => {
                                                    const dayLogs = byDate[date];
                                                    const dayHourlyCost = dayLogs.reduce((s, l) => s + l.cost, 0);
                                                    const dayHours = dayLogs.reduce((s, l) => s + l.netHours, 0);
                                                    // Add prorated daily salary cost (only for weekdays)
                                                    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
                                                    const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;
                                                    const dayTotal = dayHourlyCost + (isWeekday ? dailySalaryCost : 0);
                                                    const dayDate = new Date(date + 'T00:00:00');
                                                    return (
                                                        <details key={date} className="group">
                                                            <summary className="flex items-center justify-between cursor-pointer list-none select-none bg-zinc-900/50 hover:bg-zinc-800/50 rounded-lg px-4 py-3 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <ChevronRightIcon className="w-4 h-4 text-zinc-500 group-open:rotate-90 transition-transform shrink-0"/>
                                                                    <div>
                                                                        <span className="text-white text-sm font-medium">
                                                                            {dayDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                                        </span>
                                                                        <span className="text-zinc-500 text-xs ml-2">({dayLogs.length} kayıt · {dayHours.toFixed(1)} s)</span>
                                                                    </div>
                                                                </div>
                                                                <span className="text-emerald-400 font-mono font-bold text-sm shrink-0">{dayTotal.toFixed(2)} €</span>
                                                            </summary>
                                                            <div className="mt-1 ml-4 border-l-2 border-zinc-800 pl-4 space-y-1 pb-2">
                                                                {dayLogs.map(l => (
                                                                    <div key={l.id} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800/40 last:border-0">
                                                                        <div className="flex items-center gap-3 min-w-0">
                                                                            <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-300 shrink-0">{l.empName.charAt(0).toUpperCase()}</div>
                                                                            <div className="min-w-0">
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    <span className="text-zinc-200 font-medium">{l.empName}</span>
                                                                                    {l.location && <span className="text-[10px] bg-purple-900/30 text-purple-400 border border-purple-800/50 px-1.5 py-0.5 rounded">{l.location}</span>}
                                                                                </div>
                                                                                <div className="text-[10px] text-zinc-600">{l.startTime} – {l.endTime} · {l.netHours.toFixed(1)} s · {l.rate.toFixed(2)} €/s</div>
                                                                                {l.description && <div className="text-[10px] text-zinc-500 italic truncate max-w-xs">{l.description}</div>}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right shrink-0 ml-3">
                                                                            <div className="text-emerald-400 font-mono font-bold">{l.cost.toFixed(2)} €</div>
                                                                            <div className={`text-[9px] ${l.status === 'approved' ? 'text-green-500' : l.status === 'rejected' ? 'text-red-500' : 'text-yellow-500'}`}>
                                                                                {l.status === 'approved' ? 'Onaylı' : l.status === 'rejected' ? 'Reddedildi' : 'Bekliyor'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {isWeekday && salariedEmps.length > 0 && salariedEmps.map(e => (
                                                                    <div key={`sal-${e.id}`} className="flex items-center justify-between text-sm py-1.5 border-b border-zinc-800/40 last:border-0">
                                                                        <div className="flex items-center gap-3 min-w-0">
                                                                            <div className="w-5 h-5 rounded-full bg-pink-900 flex items-center justify-center text-[9px] font-bold text-pink-300 shrink-0">{e.name.charAt(0).toUpperCase()}</div>
                                                                            <div className="min-w-0">
                                                                                <span className="text-zinc-300 font-medium">{e.name}</span>
                                                                                <div className="text-[10px] text-zinc-600">Aylık maaş günlük payı ({workingDaysInMonth} iş günü)</div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right shrink-0 ml-3">
                                                                            <div className="text-pink-400 font-mono font-bold">{((e.monthly_net_salary || 0) / workingDaysInMonth).toFixed(2)} €</div>
                                                                            <div className="text-[9px] text-pink-700">Sabit Maaş</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Salary Entry Table */}
                                    {currentUser?.role === 'admin' && (
                                        <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5">
                                            <h4 className="font-bold text-white mb-1 flex items-center gap-2 text-sm">
                                                <span className="w-2 h-2 rounded-full bg-pink-500 inline-block"></span> Personel Maaş Tablosu
                                            </h4>
                                            <p className="text-[11px] text-zinc-500 mb-4">Saatlik çalışanlar için aylık ortalama gösterilir. Aylık net maaş girilmiş olanlar toplam maliyete dahil edilir.</p>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                                                            <th className="text-left pb-2">Personel</th>
                                                            <th className="text-right pb-2">Saatlik Ücret</th>
                                                            <th className="text-right pb-2">Bu Ay Saatlik Toplam</th>
                                                            <th className="text-right pb-2">Aylık Net Maaş</th>
                                                            <th className="text-right pb-2"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-zinc-800/50">
                                                        {employees.map(emp => {
                                                            const empLogs = logsWithCost.filter(l => l.employeeId === emp.id);
                                                            const empHourlyTotal = empLogs.reduce((s, l) => s + l.cost, 0);
                                                            const empHours = empLogs.reduce((s, l) => s + l.netHours, 0);
                                                            const isEditing = editingSalaryEmpId === emp.id;
                                                            return (
                                                                <tr key={emp.id} className="group">
                                                                    <td className="py-2.5 pr-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300">{emp.name.charAt(0).toUpperCase()}</div>
                                                                            <span className="text-zinc-200 font-medium">{emp.name}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-2.5 text-right text-zinc-400 font-mono">{emp.hourlyRate > 0 ? `${emp.hourlyRate.toFixed(2)} €/s` : <span className="text-zinc-700">—</span>}</td>
                                                                    <td className="py-2.5 text-right">
                                                                        {empHourlyTotal > 0
                                                                            ? <span className="text-emerald-400 font-mono">{empHourlyTotal.toFixed(2)} €<span className="text-zinc-600 text-[10px] ml-1">({empHours.toFixed(1)} s)</span></span>
                                                                            : <span className="text-zinc-700">—</span>
                                                                        }
                                                                    </td>
                                                                    <td className="py-2.5 text-right">
                                                                        {isEditing ? (
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                step="0.01"
                                                                                className="bg-zinc-900 border border-pink-700 rounded px-2 py-1 text-white font-mono text-sm w-28 text-right"
                                                                                value={editingSalaryValue}
                                                                                onChange={e => setEditingSalaryValue(e.target.value)}
                                                                                onKeyDown={e => { if (e.key === 'Enter') handleSaveMonthlyNetSalary(emp.id); if (e.key === 'Escape') setEditingSalaryEmpId(null); }}
                                                                                autoFocus
                                                                            />
                                                                        ) : (
                                                                            <span className={`font-mono ${(emp.monthly_net_salary || 0) > 0 ? 'text-pink-400 font-bold' : 'text-zinc-700'}`}>
                                                                                {(emp.monthly_net_salary || 0) > 0 ? `${emp.monthly_net_salary!.toFixed(2)} €` : '—'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2.5 text-right">
                                                                        {isEditing ? (
                                                                            <div className="flex items-center justify-end gap-1">
                                                                                <button onClick={() => handleSaveMonthlyNetSalary(emp.id)} className="px-2 py-1 bg-pink-700 hover:bg-pink-600 text-white rounded text-xs">Kaydet</button>
                                                                                <button onClick={() => setEditingSalaryEmpId(null)} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-xs">İptal</button>
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => { setEditingSalaryEmpId(emp.id); setEditingSalaryValue(String(emp.monthly_net_salary || '')); }}
                                                                                className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs"
                                                                            >Düzenle</button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* 3. PAYROLL TAB (WITH ADVANCE & NEW LOGIC) */}
                        {activeSalaryTab === 'payroll' && (
                             <div className="space-y-4">
                                 {/* Date Selector */}
                                 <div className="flex items-center justify-between bg-[#0e0e11] border border-zinc-800 p-4 rounded-xl">
                                     <h3 className="font-bold">Maaş Hesaplama</h3>
                                     <div className="flex items-center gap-2">
                                         <button onClick={() => setPayrollDate(new Date(payrollDate.setMonth(payrollDate.getMonth() - 1)))} className="p-1 hover:bg-zinc-800 rounded"><ChevronDownIcon className="w-4 h-4 rotate-90"/></button>
                                         <span className="font-mono">{payrollDate.toLocaleString('tr-TR', { month: 'long', year: 'numeric' })}</span>
                                         <button onClick={() => setPayrollDate(new Date(payrollDate.setMonth(payrollDate.getMonth() + 1)))} className="p-1 hover:bg-zinc-800 rounded"><ChevronRightIcon className="w-4 h-4"/></button>
                                     </div>
                                 </div>
                                 
                                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                     {/* Left: Advance Management */}
                                     {currentUser?.role === 'admin' && (
                                         <div className="lg:col-span-1 bg-[#0e0e11] border border-zinc-800 rounded-xl p-5 h-fit">
                                             <h3 className="font-bold mb-4 flex items-center gap-2 text-zinc-200">
                                                 <CurrencyDollarIcon className="w-5 h-5 text-orange-500"/> Avans Ekle
                                             </h3>
                                             <div className="space-y-3">
                                                 <select 
                                                     className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-sm"
                                                     value={newAdvance.employeeId}
                                                     onChange={e => setNewAdvance({...newAdvance, employeeId: e.target.value})}
                                                 >
                                                     <option value="">Personel Seçiniz...</option>
                                                     {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                                 </select>
                                                 <input 
                                                     type="number"
                                                     placeholder="Tutar (€)"
                                                     className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-sm"
                                                     value={newAdvance.amount}
                                                     onChange={e => setNewAdvance({...newAdvance, amount: e.target.value})}
                                                 />
                                                 <input 
                                                     type="date"
                                                     className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-sm"
                                                     value={newAdvance.date}
                                                     onChange={e => setNewAdvance({...newAdvance, date: e.target.value})}
                                                 />
                                                 <input 
                                                     placeholder="Açıklama"
                                                     className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-sm"
                                                     value={newAdvance.description}
                                                     onChange={e => setNewAdvance({...newAdvance, description: e.target.value})}
                                                 />
                                                 <button 
                                                     onClick={handleSaveAdvance}
                                                     className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 rounded-lg text-sm"
                                                 >
                                                     Avans Kaydet
                                                 </button>
                                             </div>
                                         </div>
                                     )}

                                     {/* Right: Payroll Cards */}
                                     <div className="lg:col-span-2 space-y-4">
                                         {employees
                                             .filter(e => currentUser?.role === 'admin' || e.id === currentUser?.id)
                                             .map(emp => {
                                             
                                             // Calculate stats for selected month
                                             const monthKey = `${emp.id}-${payrollDate.getFullYear()}-${payrollDate.getMonth()}`;
                                             
                                             // ROBUST DATE COMPARISON (String based for accuracy)
                                             // Target Format: "YYYY-MM"
                                             const targetMonthStr = `${payrollDate.getFullYear()}-${(payrollDate.getMonth() + 1).toString().padStart(2, '0')}`;
                                             
                                             const currentMonthLogs = workLogs.filter(l => {
                                                 if (l.employeeId !== emp.id) return false;
                                                 const logMonthStr = l.date.substring(0, 7); // Extracts "YYYY-MM"
                                                 return logMonthStr === targetMonthStr;
                                             });

                                             const currentMonthAdvances = advances.filter(a => {
                                                 if (a.employeeId !== emp.id) return false;
                                                 // Ensure we handle date strings safely
                                                 try {
                                                     const advMonthStr = a.date.substring(0, 7); // Extracts "YYYY-MM"
                                                     return advMonthStr === targetMonthStr;
                                                 } catch {
                                                     return false;
                                                 }
                                             });

                                             const approvedLogs = currentMonthLogs.filter(l => l.status === 'approved');
                                             const totalHours = approvedLogs.reduce((sum, l) => sum + l.netHours, 0);
                                             
                                             // Determine effective hourly rate for THIS month
                                             // We check the rate valid at the end of the month
                                             const monthEndDate = new Date(payrollDate.getFullYear(), payrollDate.getMonth() + 1, 0);
                                             const effectiveRate = getHourlyRateForDate(emp, monthEndDate);

                                             // Payroll Logic from Image
                                             // Default official hours to 65 if not set
                                             const officialHours = officialPayrollHours[monthKey] !== undefined ? officialPayrollHours[monthKey] : 65;
                                             
                                             const diffHours = Math.max(0, totalHours - officialHours);
                                             const calculatedEarnings = diffHours * effectiveRate;
                                             const totalAdvances = currentMonthAdvances.reduce((sum, a) => sum + a.amount, 0);
                                             const remaining = calculatedEarnings - totalAdvances;

                                             return (
                                                 <div key={emp.id} className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-4">
                                                     <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
                                                         <div className="flex items-center gap-4">
                                                             <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xl text-zinc-400">
                                                                 {emp.name.charAt(0)}
                                                             </div>
                                                             <div>
                                                                 <div className="font-bold text-lg text-white">{emp.name}</div>
                                                                 <div className="text-xs text-zinc-500 flex items-center gap-2">
                                                                     {emp.role} • 
                                                                     <span className={effectiveRate !== emp.hourlyRate ? 'text-yellow-500 font-bold' : ''}>
                                                                         {effectiveRate.toFixed(2)} €/s
                                                                     </span>
                                                                     {effectiveRate !== emp.hourlyRate && <span className="text-[9px] bg-yellow-900/30 text-yellow-500 px-1 rounded border border-yellow-800">Geçmiş Tarife</span>}
                                                                     {currentUser?.role === 'admin' && (
                                                                         <button 
                                                                             onClick={(e) => { e.stopPropagation(); handleOpenSalaryUpdate(emp, new Date(payrollDate.getFullYear(), payrollDate.getMonth(), 1)); }}
                                                                             className="text-[10px] bg-green-900/20 text-green-400 border border-green-800 px-2 py-0.5 rounded hover:bg-green-900/40 transition-colors flex items-center gap-1"
                                                                         >
                                                                             <ArrowTrendingUpIcon className="w-3 h-3"/> Zam Yap
                                                                         </button>
                                                                     )}
                                                                 </div>
                                                             </div>
                                                         </div>
                                                         
                                                         <div className="text-right">
                                                             <div className="text-[10px] text-zinc-500 uppercase">Kalan Ödeme</div>
                                                             <div className={`font-mono font-bold text-2xl ${remaining < 0 ? 'text-red-500' : 'text-green-400'}`}>
                                                                 {remaining.toFixed(2)} €
                                                             </div>
                                                         </div>
                                                     </div>

                                                     {/* Calculation Table */}
                                                     <div className="bg-zinc-900/30 rounded-lg p-4 border border-zinc-800 space-y-2 text-sm">
                                                         <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                                                             <span className="text-zinc-400">Çalışma Saati (Toplam)</span>
                                                             <span className="font-mono text-white font-bold">{totalHours.toFixed(1)}</span>
                                                         </div>
                                                         <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                                                             <span className="text-zinc-400">Maaş Bordrosu (Saat)</span>
                                                             <input 
                                                                 type="number"
                                                                 className="w-20 bg-zinc-900 border border-zinc-700 rounded p-1 text-right text-white font-mono text-xs"
                                                                 value={officialHours}
                                                                 onChange={(e) => setOfficialPayrollHours(prev => ({...prev, [monthKey]: Number(e.target.value)}))}
                                                                 placeholder="65"
                                                             />
                                                         </div>
                                                         <div className="flex justify-between items-start py-2 border-b border-zinc-800/50">
                                                             <span className="text-zinc-400 mt-1">Fark (Hakediş Bazı)</span>
                                                             <div className="flex flex-col items-end">
                                                                 <div className="text-[10px] text-zinc-500 font-mono mb-1">
                                                                     {totalHours.toFixed(1)} - {officialHours} = <span className={(totalHours - officialHours) < 0 ? 'text-red-400' : 'text-zinc-300'}>{(totalHours - officialHours).toFixed(1)}</span>
                                                                 </div>
                                                                 <div className="flex items-center gap-2">
                                                                     <span className="text-xs text-zinc-600 font-mono">
                                                                         (x {effectiveRate})
                                                                     </span>
                                                                     <span className="font-mono text-blue-400 font-bold">{calculatedEarnings.toFixed(2)} €</span>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                         
                                                         {/* Advances List */}
                                                         {currentMonthAdvances.length > 0 && (
                                                             <div className="py-2">
                                                                 <div className="text-xs text-orange-500 font-bold mb-1 uppercase">Avanslar</div>
                                                                 {currentMonthAdvances.map(adv => (
                                                                     <div key={adv.id} className="flex justify-between text-xs text-zinc-500 pl-2 border-l-2 border-orange-900/30 mb-1">
                                                                         <span>{adv.date} - {adv.description}</span>
                                                                         <div className="flex items-center gap-2">
                                                                             <span className="text-orange-400 font-mono">-{adv.amount.toFixed(2)} €</span>
                                                                             {currentUser?.role === 'admin' && (
                                                                                 <button onClick={() => handleDeleteAdvance(adv.id)} className="text-zinc-600 hover:text-red-500"><XMarkIcon className="w-3 h-3"/></button>
                                                                             )}
                                                                         </div>
                                                                     </div>
                                                                 ))}
                                                             </div>
                                                         )}
                                                     </div>
                                                 </div>
                                             );
                                         })}
                                     </div>
                                 </div>
                             </div>
                        )}

                        {/* 5. RECORDS EDIT TAB */}
                        {activeSalaryTab === 'records' && currentUser?.role === 'admin' && (() => {
                            const recMonthStr = `${recordsMonth.getFullYear()}-${(recordsMonth.getMonth()+1).toString().padStart(2,'0')}`;
                            const allLogs = workLogs
                                .filter(l => l.date.startsWith(recMonthStr) && (recordsEmpFilter === 'all' || l.employeeId === recordsEmpFilter))
                                .sort((a,b) => b.date.localeCompare(a.date) || a.startTime.localeCompare(b.startTime));

                            // Location performance: cost & hours per location (all time)
                            const byLoc: Record<string, { hours: number; cost: number; days: Set<string>; emps: Set<string> }> = {};
                            workLogs.forEach(l => {
                                const loc = (l.location || '').trim() || '(Belirtilmemiş)';
                                const emp = employees.find(e => e.id === l.employeeId);
                                const rate = emp ? getHourlyRateForDate(emp, l.date) : 0;
                                if (!byLoc[loc]) byLoc[loc] = { hours: 0, cost: 0, days: new Set(), emps: new Set() };
                                byLoc[loc].hours += l.netHours;
                                byLoc[loc].cost += l.netHours * rate;
                                byLoc[loc].days.add(l.date);
                                byLoc[loc].emps.add(l.employeeId);
                            });
                            const locPerf = Object.entries(byLoc)
                                .map(([name, d]) => ({ name, hours: d.hours, cost: d.cost, days: d.days.size, emps: d.emps.size, avgPerDay: d.days.size > 0 ? d.cost / d.days.size : 0 }))
                                .sort((a,b) => b.cost - a.cost);
                            const maxCost = locPerf[0]?.cost || 1;

                            return (
                                <div className="space-y-6">
                                    {/* Location Performance Analysis */}
                                    <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5">
                                        <h3 className="font-bold text-white mb-1 flex items-center gap-2">
                                            <ArrowTrendingUpIcon className="w-5 h-5 text-emerald-400"/> İş Yeri Fiyat & Performans Analizi
                                        </h3>
                                        <p className="text-xs text-zinc-500 mb-4">Tüm zamanlara ait kayıtlar. Çalışma yeri boş olan kayıtlar "(Belirtilmemiş)" olarak gösterilir.</p>
                                        {locPerf.length === 0 ? (
                                            <p className="text-zinc-600 text-sm text-center py-6">Kayıt yok.</p>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                                                            <th className="text-left pb-2 pr-4">İş Yeri</th>
                                                            <th className="text-right pb-2 pr-4">Toplam Saat</th>
                                                            <th className="text-right pb-2 pr-4">Toplam Maliyet</th>
                                                            <th className="text-right pb-2 pr-4">Ort. Günlük</th>
                                                            <th className="text-right pb-2 pr-4">Gün</th>
                                                            <th className="text-right pb-2">Personel</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-zinc-800/50">
                                                        {locPerf.map(loc => (
                                                            <tr key={loc.name} className="group">
                                                                <td className="py-2.5 pr-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className={`font-medium ${loc.name === '(Belirtilmemiş)' ? 'text-zinc-600 italic' : 'text-zinc-200'}`}>{loc.name}</span>
                                                                            </div>
                                                                            <div className="mt-1 w-32 bg-zinc-800 rounded-full h-1">
                                                                                <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${(loc.cost / maxCost * 100).toFixed(1)}%` }}/>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 pr-4 text-right font-mono text-blue-400">{loc.hours.toFixed(1)} s</td>
                                                                <td className="py-2.5 pr-4 text-right font-mono font-bold text-emerald-400">{loc.cost.toFixed(2)} €</td>
                                                                <td className="py-2.5 pr-4 text-right font-mono text-yellow-400">{loc.avgPerDay.toFixed(2)} €</td>
                                                                <td className="py-2.5 pr-4 text-right text-zinc-400">{loc.days}</td>
                                                                <td className="py-2.5 text-right text-zinc-400">{loc.emps}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {/* Editable Records Table */}
                                    <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                            <div>
                                                <h3 className="font-bold text-white flex items-center gap-2"><PencilSquareIcon className="w-4 h-4 text-blue-400"/> Kayıt Düzenle</h3>
                                                <p className="text-xs text-zinc-500 mt-0.5">Herhangi bir alana tıklayarak düzenleyin. Çalışma yeri boş olanları doldurun.</p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1">
                                                    <button onClick={() => setRecordsMonth(new Date(recordsMonth.getFullYear(), recordsMonth.getMonth()-1, 1))} className="p-1 hover:bg-zinc-800 rounded text-zinc-400"><ChevronDownIcon className="w-4 h-4 rotate-90"/></button>
                                                    <span className="text-sm font-mono text-white w-32 text-center">{recordsMonth.toLocaleString('tr-TR', { month: 'long', year: 'numeric' })}</span>
                                                    <button onClick={() => setRecordsMonth(new Date(recordsMonth.getFullYear(), recordsMonth.getMonth()+1, 1))} className="p-1 hover:bg-zinc-800 rounded text-zinc-400"><ChevronRightIcon className="w-4 h-4"/></button>
                                                </div>
                                                <select
                                                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-white text-sm"
                                                    value={recordsEmpFilter}
                                                    onChange={e => setRecordsEmpFilter(e.target.value)}
                                                >
                                                    <option value="all">Tüm Personel</option>
                                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {allLogs.length === 0 ? (
                                            <p className="text-zinc-600 text-sm text-center py-6">Bu ay için kayıt yok.</p>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm min-w-[700px]">
                                                    <thead>
                                                        <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                                                            <th className="text-left pb-2 pr-3">Tarih</th>
                                                            <th className="text-left pb-2 pr-3">Personel</th>
                                                            <th className="text-left pb-2 pr-3">Saat</th>
                                                            <th className="text-left pb-2 pr-3">Net Saat</th>
                                                            <th className="text-left pb-2 pr-3">Çalışma Yeri</th>
                                                            <th className="text-left pb-2">Açıklama</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-zinc-800/40">
                                                        {allLogs.map(log => {
                                                            const isEditing = editingLogId === log.id;
                                                            const emp = employees.find(e => e.id === log.employeeId);
                                                            const hasLocation = log.location?.trim();

                                                            const startEdit = () => {
                                                                setEditingLogId(log.id);
                                                                setEditingLogField({
                                                                    date: log.date,
                                                                    startTime: log.startTime,
                                                                    endTime: log.endTime,
                                                                    location: log.location || '',
                                                                    description: log.description || ''
                                                                });
                                                            };

                                                            const saveEdit = async () => {
                                                                try {
                                                                    await updateWorkLog(log.id, {
                                                                        date: editingLogField.date,
                                                                        start_time: editingLogField.startTime,
                                                                        end_time: editingLogField.endTime,
                                                                        location: editingLogField.location,
                                                                        description: editingLogField.description
                                                                    });
                                                                    // Auto-save location
                                                                    if (editingLogField.location.trim()) {
                                                                        await upsertLocation(editingLogField.location.trim());
                                                                        setLocations(prev => {
                                                                            const n = editingLogField.location.trim();
                                                                            if (prev.some(l => l.name.toLowerCase() === n.toLowerCase())) return prev;
                                                                            return [...prev, { id: n, name: n }].sort((a,b) => a.name.localeCompare(b.name));
                                                                        });
                                                                    }
                                                                    setWorkLogs(prev => prev.map(l => l.id === log.id ? {
                                                                        ...l,
                                                                        date: editingLogField.date,
                                                                        startTime: editingLogField.startTime,
                                                                        endTime: editingLogField.endTime,
                                                                        location: editingLogField.location,
                                                                        description: editingLogField.description
                                                                    } : l));
                                                                    setEditingLogId(null);
                                                                } catch { alert('Kayıt güncellenemedi.'); }
                                                            };

                                                            if (isEditing) {
                                                                return (
                                                                    <tr key={log.id} className="bg-zinc-900/60">
                                                                        <td className="py-2 pr-3">
                                                                            <input type="date" className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-white text-xs w-32"
                                                                                value={editingLogField.date} onChange={e => setEditingLogField(f => ({...f, date: e.target.value}))}/>
                                                                        </td>
                                                                        <td className="py-2 pr-3 text-zinc-300">{emp?.name ?? '—'}</td>
                                                                        <td className="py-2 pr-3">
                                                                            <div className="flex items-center gap-1">
                                                                                <input type="time" className="bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-white text-xs w-20"
                                                                                    value={editingLogField.startTime} onChange={e => setEditingLogField(f => ({...f, startTime: e.target.value}))}/>
                                                                                <span className="text-zinc-600">–</span>
                                                                                <input type="time" className="bg-zinc-800 border border-zinc-600 rounded px-1 py-1 text-white text-xs w-20"
                                                                                    value={editingLogField.endTime} onChange={e => setEditingLogField(f => ({...f, endTime: e.target.value}))}/>
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-2 pr-3 text-zinc-400 text-xs">{log.netHours.toFixed(1)} s</td>
                                                                        <td className="py-2 pr-3">
                                                                            <div className="relative">
                                                                                <input
                                                                                    className="bg-zinc-800 border border-purple-600 rounded px-1.5 py-1 text-white text-xs w-36"
                                                                                    list={`loc-list-${log.id}`}
                                                                                    value={editingLogField.location}
                                                                                    onChange={e => setEditingLogField(f => ({...f, location: e.target.value}))}
                                                                                    placeholder="İş yeri..."
                                                                                />
                                                                                <datalist id={`loc-list-${log.id}`}>
                                                                                    {locations.map(l => <option key={l.id} value={l.name}/>)}
                                                                                </datalist>
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-2">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <input className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-white text-xs w-40"
                                                                                    value={editingLogField.description} onChange={e => setEditingLogField(f => ({...f, description: e.target.value}))}
                                                                                    placeholder="Açıklama..."/>
                                                                                <button onClick={saveEdit} className="p-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-white"><CheckIcon className="w-3.5 h-3.5"/></button>
                                                                                <button onClick={() => setEditingLogId(null)} className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-white"><XMarkIcon className="w-3.5 h-3.5"/></button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            }

                                                            return (
                                                                <tr key={log.id} onClick={startEdit} className={`cursor-pointer group transition-colors ${!hasLocation ? 'bg-yellow-950/20 hover:bg-yellow-950/40' : 'hover:bg-zinc-800/40'}`}>
                                                                    <td className="py-2.5 pr-3 text-zinc-300 text-xs whitespace-nowrap">
                                                                        {new Date(log.date + 'T00:00:00').toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'2-digit' })}
                                                                    </td>
                                                                    <td className="py-2.5 pr-3">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-300 shrink-0">{(emp?.name ?? '?').charAt(0).toUpperCase()}</div>
                                                                            <span className="text-zinc-200 text-xs">{emp?.name ?? '—'}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-2.5 pr-3 text-zinc-400 text-xs whitespace-nowrap">{log.startTime} – {log.endTime}</td>
                                                                    <td className="py-2.5 pr-3 text-blue-400 font-mono text-xs">{log.netHours.toFixed(1)} s</td>
                                                                    <td className="py-2.5 pr-3">
                                                                        {hasLocation
                                                                            ? <span className="text-xs bg-purple-900/30 text-purple-300 border border-purple-800/50 px-2 py-0.5 rounded-full">{log.location}</span>
                                                                            : <span className="text-xs text-yellow-600 italic flex items-center gap-1"><PencilSquareIcon className="w-3 h-3"/>Eksik — tıkla</span>
                                                                        }
                                                                    </td>
                                                                    <td className="py-2.5 text-zinc-500 text-xs truncate max-w-[140px]">{log.description || <span className="italic text-zinc-700">—</span>}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* ... (Settings and Tasks unchanged) ... */}
                {/* ... (Calendar View unchanged) ... */}

            </div>
        </main>

        {/* Mobile Bottom Navigation - Outside main to avoid overflow-hidden clipping */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0a0a0c] border-t border-zinc-800 flex items-center justify-around z-50 px-2">
            <button onClick={() => setActiveView('panel')} className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-lg transition-colors ${activeView === 'panel' ? 'text-blue-400' : 'text-zinc-500'}`}>
                <Squares2X2Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">Panel</span>
            </button>
            <button onClick={() => setActiveView('calendar')} className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-lg transition-colors ${activeView === 'calendar' ? 'text-blue-400' : 'text-zinc-500'}`}>
                <CalendarDaysIcon className="w-5 h-5" />
                <span className="text-[10px] font-medium">Takvim</span>
            </button>
            <button onClick={() => setActiveView('tasks')} className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-lg transition-colors ${activeView === 'tasks' ? 'text-blue-400' : 'text-zinc-500'}`}>
                <ClipboardDocumentCheckIcon className="w-5 h-5" />
                <span className="text-[10px] font-medium">Görevler</span>
            </button>
            {showSalaryTab && (
                <button onClick={() => setActiveView('salary')} className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-lg transition-colors ${activeView === 'salary' ? 'text-blue-400' : 'text-zinc-500'}`}>
                    <BanknotesIcon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">Maaş</span>
                </button>
            )}
        </nav>

        {/* --- MODALS --- */}
        
        {/* ADD EMPLOYEE MODAL */}
        {showAddEmployeeModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-6 w-full max-w-md">
                    <h3 className="text-xl font-bold mb-4">{editingEmployee ? 'Personel Düzenle' : 'Yeni Personel Ekle'}</h3>
                    <div className="space-y-3">
                        <input className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" placeholder="Ad Soyad" value={newEmployee.name || ''} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})} />
                        <input className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" placeholder="E-posta" value={newEmployee.email || ''} onChange={e => setNewEmployee({...newEmployee, email: e.target.value})} />
                        <input className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" placeholder="Rol / Görev" value={newEmployee.role || ''} onChange={e => setNewEmployee({...newEmployee, role: e.target.value})} />
                        <input className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" placeholder="IBAN" value={newEmployee.iban || ''} onChange={e => setNewEmployee({...newEmployee, iban: e.target.value})} />
                        <div className="grid grid-cols-1 gap-3">
                            <input type="number" className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" placeholder="Saatlik Ücret (₺)" value={newEmployee.hourlyRate || ''} onChange={e => setNewEmployee({...newEmployee, hourlyRate: Number(e.target.value)})} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setShowAddEmployeeModal(false)} className="px-4 py-2 text-zinc-400 hover:text-white">İptal</button>
                        <button onClick={handleSaveEmployee} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Kaydet</button>
                    </div>
                </div>
            </div>
        )}

        {/* SALARY UPDATE MODAL */}
        {showSalaryUpdateModal && salaryUpdateTarget && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <BanknotesIcon className="w-6 h-6 text-green-500"/> Ücret Güncelle
                        </h3>
                        <button onClick={() => setShowSalaryUpdateModal(false)}><XMarkIcon className="w-6 h-6 text-zinc-500 hover:text-white"/></button>
                    </div>
                    <div className="bg-zinc-900/50 p-3 rounded-lg mb-4 border border-zinc-800 text-sm">
                        <div className="text-zinc-400">Personel: <span className="text-white font-bold">{salaryUpdateTarget.name}</span></div>
                        <div className="text-zinc-400">Mevcut Ücret: <span className="text-white font-mono">{salaryUpdateTarget.hourlyRate} €/s</span></div>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-zinc-500 block mb-1">Yeni Saatlik Ücret (€)</label>
                            <input 
                                type="number" 
                                className="w-full bg-zinc-900 border border-green-900/50 rounded p-2 text-white font-bold text-lg text-center focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none" 
                                placeholder="0.00" 
                                value={salaryUpdateForm.newRate} 
                                onChange={e => setSalaryUpdateForm({...salaryUpdateForm, newRate: e.target.value})} 
                            />
                        </div>
                        <div>
                            <label className="text-xs text-zinc-500 block mb-1">Geçerlilik Tarihi</label>
                            <input 
                                type="date" 
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-sm" 
                                value={salaryUpdateForm.effectiveDate} 
                                onChange={e => setSalaryUpdateForm({...salaryUpdateForm, effectiveDate: e.target.value})} 
                            />
                            <p className="text-[10px] text-zinc-600 mt-1">Bu tarihten önceki hesaplamalar eski fiyattan yapılmaya devam edecektir.</p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setShowSalaryUpdateModal(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">İptal</button>
                        <button onClick={handleSaveSalaryUpdate} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2">
                            <CheckIcon className="w-4 h-4"/> Onayla
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* TASK MODAL */}
        {showTaskModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
                <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-6 w-full max-w-lg my-8">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <ClipboardDocumentCheckIcon className="w-6 h-6 text-blue-500"/> 
                            {editingTask ? 'Görevi Düzenle' : 'Yeni Görev'}
                        </h3>
                        <button onClick={() => setShowTaskModal(false)}><XMarkIcon className="w-6 h-6 text-zinc-500 hover:text-white"/></button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-zinc-500 block mb-1">Görev Başlığı</label>
                            <input 
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" 
                                placeholder="Örn: Yeni Tasarım Revizyonu" 
                                value={taskForm.title} 
                                onChange={e => setTaskForm({...taskForm, title: e.target.value})} 
                            />
                        </div>
                        
                        <div>
                            <label className="text-xs text-zinc-500 block mb-1">Açıklama</label>
                            <textarea 
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white h-24 resize-none" 
                                placeholder="Görev detayları..." 
                                value={taskForm.description} 
                                onChange={e => setTaskForm({...taskForm, description: e.target.value})} 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Atanan Personel</label>
                                <select 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                    value={taskForm.employeeId}
                                    onChange={e => setTaskForm({...taskForm, employeeId: e.target.value})}
                                >
                                    <option value="">Seçiniz...</option>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Öncelik</label>
                                <select 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                                    value={taskForm.priority}
                                    onChange={e => setTaskForm({...taskForm, priority: e.target.value as any})}
                                >
                                    <option value="low">Düşük</option>
                                    <option value="medium">Orta</option>
                                    <option value="high">Acil</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Başlangıç</label>
                                <input 
                                    type="date"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" 
                                    value={taskForm.startDate} 
                                    onChange={e => setTaskForm({...taskForm, startDate: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Bitiş (Teslim)</label>
                                <input 
                                    type="date"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" 
                                    value={taskForm.dueDate} 
                                    onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})} 
                                />
                            </div>
                        </div>

                        {/* Alt Görevler (Steps) */}
                        <div className="pt-4 border-t border-zinc-800">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs text-zinc-500">Alt Görevler / Adımlar</label>
                                <button onClick={handleAddTaskStep} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                                    <PlusIcon className="w-3 h-3"/> Adım Ekle
                                </button>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                {taskForm.steps.map(step => (
                                    <div key={step.id} className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded border border-zinc-800">
                                        <input 
                                            type="checkbox" 
                                            checked={step.completed}
                                            onChange={e => {
                                                const newSteps = taskForm.steps.map(s => s.id === step.id ? {...s, completed: e.target.checked} : s);
                                                setTaskForm({...taskForm, steps: newSteps});
                                            }}
                                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
                                        />
                                        <input 
                                            type="text"
                                            value={step.text}
                                            onChange={e => {
                                                const newSteps = taskForm.steps.map(s => s.id === step.id ? {...s, text: e.target.value} : s);
                                                setTaskForm({...taskForm, steps: newSteps});
                                            }}
                                            placeholder="Adım açıklaması..."
                                            className="flex-1 bg-transparent border-none text-sm text-white focus:ring-0 p-0"
                                        />
                                        <button onClick={() => handleRemoveTaskStep(step.id)} className="text-zinc-600 hover:text-red-500">
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    </div>
                                ))}
                                {taskForm.steps.length === 0 && (
                                    <div className="text-center text-zinc-600 text-xs py-2">Henüz alt görev eklenmedi.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
                        <button onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">İptal</button>
                        <button onClick={handleSaveTask} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                            <CheckIcon className="w-4 h-4"/> Kaydet
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* CALENDAR MODAL */}
        {showCalendarModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
                <div className="bg-[#0e0e11] border border-zinc-800 rounded-xl p-6 w-full max-w-md my-8">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                            <CalendarDaysIcon className="w-6 h-6 text-orange-500"/> 
                            {editingEvent ? 'Etkinlik Düzenle' : 'Yeni Etkinlik'}
                        </h3>
                        <button onClick={() => setShowCalendarModal(false)}><XMarkIcon className="w-6 h-6 text-zinc-500 hover:text-white"/></button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-zinc-500 block mb-1">Başlık</label>
                            <input 
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white" 
                                placeholder="Örn: Müşteri Toplantısı" 
                                value={calendarForm.title} 
                                onChange={e => setCalendarForm({...calendarForm, title: e.target.value})} 
                            />
                        </div>
                        
                        <div>
                            <label className="text-xs text-zinc-500 block mb-1">Açıklama</label>
                            <textarea 
                                className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white h-20 resize-none" 
                                placeholder="Detaylar..." 
                                value={calendarForm.description} 
                                onChange={e => setCalendarForm({...calendarForm, description: e.target.value})} 
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Başlangıç</label>
                                <input 
                                    type="datetime-local"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-sm" 
                                    value={calendarForm.startTime} 
                                    onChange={e => setCalendarForm({...calendarForm, startTime: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Bitiş</label>
                                <input 
                                    type="datetime-local"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white text-sm" 
                                    value={calendarForm.endTime} 
                                    onChange={e => setCalendarForm({...calendarForm, endTime: e.target.value})} 
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-zinc-500 block mb-1">Etiket Rengi</label>
                            <div className="flex gap-2">
                                {['blue', 'red', 'green', 'yellow', 'purple', 'orange'].map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setCalendarForm({...calendarForm, color: color as any})}
                                        className={`w-8 h-8 rounded-full border-2 ${calendarForm.color === color ? 'border-white' : 'border-transparent'}`}
                                        style={{ backgroundColor: color === 'blue' ? '#3b82f6' : color === 'red' ? '#ef4444' : color === 'green' ? '#22c55e' : color === 'yellow' ? '#eab308' : color === 'purple' ? '#a855f7' : '#f97316' }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
                        <button onClick={() => setShowCalendarModal(false)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">İptal</button>
                        <button onClick={handleSaveCalendarEvent} className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                            <CheckIcon className="w-4 h-4"/> Kaydet
                        </button>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};

export default App;