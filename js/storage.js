/**
 * Centralized Data Persistence Module (LocalStorage)
 * ---------------------------------------------------------------------------
 * All storage reads and writes are isolated here so that replacing LocalStorage
 * with Node.js / Express / SQL REST API calls requires changing only this file.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledger_transactions_v1',
  BUDGET: 'ledger_budget_v1',
  INITIALIZED: 'ledger_initialized_v1',
};

/**
 * Generates a collision-resistant unique transaction identifier.
 * @returns {string}
 */
export function generateTransactionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `txn_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Returns local YYYY-MM-DD date string shifted by offsetDays.
 * Avoids UTC midnight off-by-one errors.
 * @param {number} offsetDays
 * @returns {string}
 */
function getLocalISODate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns local YYYY-MM-DD for a specific month offset (0 = current month).
 * @param {number} monthOffset
 * @param {number} dayOfMonth
 * @returns {string}
 */
function getMonthOffsetISODate(monthOffset, dayOfMonth) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(Math.max(1, dayOfMonth), lastDay);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Normalizes a transaction object to the canonical schema.
 * @param {object} raw
 * @returns {object}
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateTransactionId()),
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || getLocalISODate(0)),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Retrieves all transactions from LocalStorage.
 * @returns {Array<object>}
 */
export function getTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransaction);
  } catch (err) {
    console.error('Failed to read transactions from LocalStorage:', err);
    return [];
  }
}

/**
 * Saves the complete transaction list to LocalStorage.
 * @param {Array<object>} transactions
 * @returns {Array<object>}
 */
export function saveTransactions(transactions) {
  const normalized = Array.isArray(transactions)
    ? transactions.map(normalizeTransaction)
    : [];
  try {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(normalized));
  } catch (err) {
    console.error('Failed to save transactions to LocalStorage:', err);
  }
  return normalized;
}

/**
 * Creates and persists a new transaction record.
 * @param {object} transactionInput
 * @returns {object}
 */
export function addTransaction(transactionInput) {
  const transactions = getTransactions();
  const created = normalizeTransaction({
    ...transactionInput,
    id: generateTransactionId(),
  });
  transactions.unshift(created);
  saveTransactions(transactions);
  return created;
}

/**
 * Updates an existing transaction by ID.
 * @param {string} id
 * @param {object} updates
 * @returns {object|null}
 */
export function updateTransaction(id, updates) {
  const transactions = getTransactions();
  const index = transactions.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const updated = normalizeTransaction({
    ...transactions[index],
    ...updates,
    id,
  });
  transactions[index] = updated;
  saveTransactions(transactions);
  return updated;
}

/**
 * Deletes a transaction by ID.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const filtered = transactions.filter((item) => item.id !== id);
  if (filtered.length === transactions.length) return false;
  saveTransactions(filtered);
  return true;
}

/**
 * Retrieves saved monthly budget settings.
 * @returns {{ monthlyLimit: number, updatedAt: string }}
 */
export function getBudget() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGET);
    if (!raw) {
      return { monthlyLimit: 0, updatedAt: '' };
    }
    const parsed = JSON.parse(raw);
    const limit = Number(parsed?.monthlyLimit);
    return {
      monthlyLimit: Number.isFinite(limit) && limit >= 0 ? Number(limit.toFixed(2)) : 0,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch (err) {
    console.error('Failed to read budget from LocalStorage:', err);
    return { monthlyLimit: 0, updatedAt: '' };
  }
}

/**
 * Persists monthly budget configuration.
 * @param {number} monthlyLimit
 * @returns {{ monthlyLimit: number, updatedAt: string }}
 */
export function saveBudget(monthlyLimit) {
  const payload = {
    monthlyLimit: Number(Number(monthlyLimit).toFixed(2)),
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to save budget to LocalStorage:', err);
  }
  return payload;
}

/**
 * Builds grounded sample data relative to the current calendar month.
 * @returns {{ transactions: Array<object>, budgetLimit: number }}
 */
function buildSampleData() {
  const currentDay = new Date().getDate();
  const d1 = Math.max(1, currentDay);
  const d2 = Math.max(1, currentDay - 2);
  const d3 = Math.max(1, currentDay - 4);
  const d4 = Math.max(1, currentDay - 6);
  const d5 = Math.max(1, currentDay - 8);
  const d6 = Math.max(1, currentDay - 10);

  const transactions = [
    // Current month
    {
      id: 'txn_seed_01',
      title: 'Monthly Salary',
      amount: 4850,
      category: 'Salary',
      type: 'income',
      date: getMonthOffsetISODate(0, 1),
      description: 'Primary payroll direct deposit',
    },
    {
      id: 'txn_seed_02',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: getMonthOffsetISODate(0, 2),
      description: 'Monthly apartment lease',
    },
    {
      id: 'txn_seed_03',
      title: 'Grocery Shopping',
      amount: 245.5,
      category: 'Food',
      type: 'expense',
      date: getMonthOffsetISODate(0, d1),
      description: 'Weekly groceries and produce',
    },
    {
      id: 'txn_seed_04',
      title: 'Electric & Fiber Internet',
      amount: 168.4,
      category: 'Utilities',
      type: 'expense',
      date: getMonthOffsetISODate(0, d2),
      description: 'Monthly utility and broadband bill',
    },
    {
      id: 'txn_seed_05',
      title: 'UI Consulting Milestone',
      amount: 720,
      category: 'Freelance',
      type: 'income',
      date: getMonthOffsetISODate(0, d3),
      description: 'Client design system audit',
    },
    {
      id: 'txn_seed_06',
      title: 'Commuter Rail & Fuel',
      amount: 134,
      category: 'Transportation',
      type: 'expense',
      date: getMonthOffsetISODate(0, d4),
      description: 'Transit pass and highway fuel',
    },
    {
      id: 'txn_seed_07',
      title: 'Pharmacy & Dental Checkup',
      amount: 185,
      category: 'Healthcare',
      type: 'expense',
      date: getMonthOffsetISODate(0, d5),
      description: 'Preventive visit co-pay and prescriptions',
    },
    {
      id: 'txn_seed_08',
      title: 'Team Dinner & Coffee',
      amount: 112.8,
      category: 'Food',
      type: 'expense',
      date: getMonthOffsetISODate(0, d6),
      description: 'Lunch and coffee meetings',
    },
    {
      id: 'txn_seed_09',
      title: 'Home Office Supplies',
      amount: 289,
      category: 'Shopping',
      type: 'expense',
      date: getMonthOffsetISODate(0, Math.max(1, currentDay - 1)),
      description: 'Ergonomic keyboard and desk lamp',
    },
    // Prior month (-1)
    {
      id: 'txn_seed_10',
      title: 'Monthly Salary',
      amount: 4850,
      category: 'Salary',
      type: 'income',
      date: getMonthOffsetISODate(-1, 1),
      description: 'Primary payroll direct deposit',
    },
    {
      id: 'txn_seed_11',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: getMonthOffsetISODate(-1, 2),
      description: 'Monthly apartment lease',
    },
    {
      id: 'txn_seed_12',
      title: 'Supermarket & Pantry',
      amount: 420.75,
      category: 'Food',
      type: 'expense',
      date: getMonthOffsetISODate(-1, 9),
      description: 'Groceries and household staples',
    },
    {
      id: 'txn_seed_13',
      title: 'Electric & Water Utilities',
      amount: 162,
      category: 'Utilities',
      type: 'expense',
      date: getMonthOffsetISODate(-1, 14),
      description: 'Monthly municipal utilities',
    },
    {
      id: 'txn_seed_14',
      title: 'Online Course Subscription',
      amount: 149,
      category: 'Education',
      type: 'expense',
      date: getMonthOffsetISODate(-1, 19),
      description: 'Annual technical workshop pass',
    },
    {
      id: 'txn_seed_15',
      title: 'Concert & Streaming',
      amount: 124,
      category: 'Entertainment',
      type: 'expense',
      date: getMonthOffsetISODate(-1, 23),
      description: 'Live show tickets and subscriptions',
    },
    // Two months ago (-2)
    {
      id: 'txn_seed_16',
      title: 'Monthly Salary',
      amount: 4650,
      category: 'Salary',
      type: 'income',
      date: getMonthOffsetISODate(-2, 1),
      description: 'Primary payroll direct deposit',
    },
    {
      id: 'txn_seed_17',
      title: 'Dividend Distribution',
      amount: 310,
      category: 'Investments',
      type: 'income',
      date: getMonthOffsetISODate(-2, 15),
      description: 'Quarterly index fund dividend',
    },
    {
      id: 'txn_seed_18',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: getMonthOffsetISODate(-2, 2),
      description: 'Monthly apartment lease',
    },
    {
      id: 'txn_seed_19',
      title: 'Groceries & Dining',
      amount: 398.2,
      category: 'Food',
      type: 'expense',
      date: getMonthOffsetISODate(-2, 11),
      description: 'Weekly food shopping',
    },
    {
      id: 'txn_seed_20',
      title: 'Train Pass & Rideshare',
      amount: 158,
      category: 'Transportation',
      type: 'expense',
      date: getMonthOffsetISODate(-2, 18),
      description: 'Regional rail and local transit',
    },
  ];

  return {
    transactions,
    budgetLimit: 3100,
  };
}

/**
 * Seeds sample transactions and budget once on initial browser visit.
 */
export function seedInitialDataIfEmpty() {
  if (localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
    return;
  }
  const { transactions, budgetLimit } = buildSampleData();
  saveTransactions(transactions);
  saveBudget(budgetLimit);
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}

/**
 * Restores default sample transactions and budget.
 */
export function resetSampleData() {
  const { transactions, budgetLimit } = buildSampleData();
  saveTransactions(transactions);
  saveBudget(budgetLimit);
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}
