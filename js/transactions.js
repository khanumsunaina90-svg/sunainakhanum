/**
 * Transactions Module — Pure Financial Calculations, Validation & History View
 * ---------------------------------------------------------------------------
 * Calculations and filters are pure functions independent of LocalStorage.
 */

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transportation',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Gift',
  'Refund',
  'Other',
];

export const ALL_CATEGORIES = Array.from(
  new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
);

export const CATEGORY_COLORS = {
  Food: '#2563EB',
  Housing: '#0F172A',
  Transportation: '#0891B2',
  Utilities: '#D97706',
  Healthcare: '#DC2626',
  Entertainment: '#7C3AED',
  Shopping: '#DB2777',
  Education: '#059669',
  Salary: '#16A34A',
  Freelance: '#15803D',
  Investments: '#0D9488',
  Gift: '#4F46E5',
  Refund: '#0284C7',
  Other: '#64748B',
};

/**
 * Escapes HTML special characters to prevent XSS in template strings.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a numeric value as USD currency with tabular consistency.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return num < 0 ? `-${formatted}` : formatted;
}

/**
 * Formats YYYY-MM-DD into a concise readable date (e.g. "Nov 13, 2026").
 * @param {string} isoDate
 * @returns {string}
 */
export function formatDateShort(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateObj);
}

/**
 * Formats YYYY-MM into a month label (e.g. "November 2026").
 * @param {string} monthKey
 * @returns {string}
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '—';
  const [y, m] = monthKey.split('-').map(Number);
  const dateObj = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(dateObj);
}

/**
 * Returns current local YYYY-MM key.
 * @returns {string}
 */
export function getCurrentMonthKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

/**
 * Returns current local YYYY-MM-DD date string.
 * @returns {string}
 */
export function getTodayISO() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Pure calculation of dynamic financial totals independent of storage.
 * Total Balance = Total Income - Total Expenses.
 * @param {Array<object>} transactions
 * @param {string} targetMonth YYYY-MM
 * @returns {object}
 */
export function calculateSummary(transactions, targetMonth = getCurrentMonthKey()) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let monthlyIncome = 0;
  let monthlySpending = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let monthlyExpenseCount = 0;
  const monthSet = new Set([getCurrentMonthKey()]);

  for (const txn of transactions) {
    const amount = Number(txn.amount) || 0;
    const txnMonth = typeof txn.date === 'string' ? txn.date.slice(0, 7) : '';
    if (/^\d{4}-\d{2}$/.test(txnMonth)) {
      monthSet.add(txnMonth);
    }

    if (txn.type === 'income') {
      totalIncome += amount;
      incomeCount += 1;
      if (txnMonth === targetMonth) {
        monthlyIncome += amount;
      }
    } else {
      totalExpenses += amount;
      expenseCount += 1;
      if (txnMonth === targetMonth) {
        monthlySpending += amount;
        monthlyExpenseCount += 1;
      }
    }
  }

  const totalBalance = totalIncome - totalExpenses;
  const availableMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

  return {
    totalBalance,
    totalIncome,
    totalExpenses,
    monthlyIncome,
    monthlySpending,
    incomeCount,
    expenseCount,
    monthlyExpenseCount,
    availableMonths,
  };
}

/**
 * Validates transaction form input before saving.
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateTransactionInput(data) {
  const errors = {};
  const title = String(data.title || '').trim();
  const amount = Number(data.amount);
  const type = data.type;
  const category = String(data.category || '').trim();
  const date = String(data.date || '').trim();
  const description = String(data.description || '').trim();

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length > 80) {
    errors.title = 'Title must be 80 characters or fewer.';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than $0.00.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount exceeds the maximum allowed entry.';
  }

  if (type !== 'income' && type !== 'expense') {
    errors.type = 'Select either Income or Expense.';
  }

  if (!category) {
    errors.category = 'Please choose a category.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Select a valid date.';
  } else {
    const [y, m, d] = date.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    if (
      parsed.getFullYear() !== y ||
      parsed.getMonth() !== m - 1 ||
      parsed.getDate() !== d
    ) {
      errors.date = 'Please enter a valid calendar date.';
    }
  }

  if (description.length > 240) {
    errors.description = 'Description must be 240 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Pure filter and sort pipeline for transaction history.
 * @param {Array<object>} transactions
 * @param {{ search?: string, category?: string, type?: string, sortBy?: string }} filters
 * @returns {Array<object>}
 */
export function filterAndSortTransactions(transactions, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const category = filters.category || 'all';
  const type = filters.type || 'all';
  const sortBy = filters.sortBy || 'date-desc';

  const filtered = transactions.filter((txn) => {
    if (type !== 'all' && txn.type !== type) return false;
    if (category !== 'all' && txn.category !== category) return false;
    if (search) {
      const haystack = `${txn.title} ${txn.description} ${txn.category} ${txn.amount}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
      case 'amount-desc':
        return b.amount - a.amount || b.date.localeCompare(a.date);
      case 'amount-asc':
        return a.amount - b.amount || b.date.localeCompare(a.date);
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
    }
  });
}

/**
 * Renders a transaction table into a target container with Edit/Delete handlers.
 * @param {HTMLElement} container
 * @param {Array<object>} transactions
 * @param {{ showActions?: boolean, emptyTitle?: string, emptyText?: string, emptyCtaLabel?: string, onEmptyCta?: Function, onEdit?: Function, onDelete?: Function }} options
 */
export function renderTransactionsTable(container, transactions, options = {}) {
  const {
    showActions = true,
    emptyTitle = 'No transactions recorded',
    emptyText = 'Add your first income or expense entry to begin tracking.',
    emptyCtaLabel = 'Add Transaction',
    onEmptyCta = null,
    onEdit = null,
    onDelete = null,
  } = options;

  if (!container) return;

  if (!transactions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <i data-lucide="receipt"></i>
        </div>
        <h3 class="empty-state-title">${escapeHtml(emptyTitle)}</h3>
        <p class="empty-state-text">${escapeHtml(emptyText)}</p>
        ${
          onEmptyCta
            ? `<button type="button" class="btn btn-primary btn-sm" data-empty-cta>${escapeHtml(
                emptyCtaLabel
              )}</button>`
            : ''
        }
      </div>
    `;
    const ctaBtn = container.querySelector('[data-empty-cta]');
    if (ctaBtn && onEmptyCta) {
      ctaBtn.addEventListener('click', onEmptyCta);
    }
    if (window.lucide) window.lucide.createIcons({ root: container });
    return;
  }

  const rowsHtml = transactions
    .map((txn) => {
      const isIncome = txn.type === 'income';
      const signedAmount = `${isIncome ? '+' : '-'}${formatCurrency(txn.amount)}`;
      const amountClass = isIncome ? 'text-income' : 'text-primary';
      const typeLabel = isIncome ? 'Income' : 'Expense';
      const typeClass = isIncome ? 'type-label-income' : 'type-label-expense';

      return `
        <tr data-txn-id="${escapeHtml(txn.id)}">
          <td>
            <div class="txn-title-cell">
              <span class="txn-title">${escapeHtml(txn.title)}</span>
              ${
                txn.description
                  ? `<span class="txn-desc">${escapeHtml(txn.description)}</span>`
                  : ''
              }
            </div>
          </td>
          <td class="txn-meta-inline">${escapeHtml(txn.category)}</td>
          <td>
            <span class="type-label ${typeClass}">${typeLabel}</span>
          </td>
          <td class="txn-meta-inline tabular-nums">${escapeHtml(formatDateShort(txn.date))}</td>
          <td class="col-right amount-cell tabular-nums ${amountClass}">${signedAmount}</td>
          ${
            showActions
              ? `<td class="col-right">
                  <div class="row-actions">
                    <button
                      type="button"
                      class="icon-btn"
                      data-action="edit"
                      data-id="${escapeHtml(txn.id)}"
                      aria-label="Edit ${escapeHtml(txn.title)}"
                      title="Edit transaction"
                    >
                      <i data-lucide="pencil"></i>
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-btn-danger"
                      data-action="delete"
                      data-id="${escapeHtml(txn.id)}"
                      aria-label="Delete ${escapeHtml(txn.title)}"
                      title="Delete transaction"
                    >
                      <i data-lucide="trash-2"></i>
                    </button>
                  </div>
                </td>`
              : ''
          }
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th scope="col">Transaction</th>
          <th scope="col">Category</th>
          <th scope="col">Type</th>
          <th scope="col">Date</th>
          <th scope="col" class="col-right">Amount</th>
          ${showActions ? '<th scope="col" class="col-right">Actions</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;

  if (showActions) {
    container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (onEdit) onEdit(btn.dataset.id);
      });
    });

    container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (onDelete) onDelete(btn.dataset.id);
      });
    });
  }

  if (window.lucide) window.lucide.createIcons({ root: container });
}

/**
 * Controller for Transaction History View and Add/Edit Transaction Modal.
 */
export function createTransactionsController({
  getTransactions,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteRequest,
}) {
  // Filter state
  const filterState = {
    search: '',
    category: 'all',
    type: 'all',
    sortBy: 'date-desc',
  };

  // History view DOM elements
  const searchInput = document.getElementById('filter-search');
  const categorySelect = document.getElementById('filter-category');
  const sortSelect = document.getElementById('sort-transactions');
  const typeButtons = document.querySelectorAll('[data-type-filter]');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  const countLabel = document.getElementById('transactions-count-label');
  const netLabel = document.getElementById('transactions-filtered-net');
  const tableContainer = document.getElementById('transactions-table-container');

  // Modal DOM elements
  const modal = document.getElementById('transaction-modal');
  const modalTitle = document.getElementById('transaction-modal-title');
  const form = document.getElementById('transaction-form');
  const idInput = document.getElementById('txn-id');
  const titleInput = document.getElementById('txn-title');
  const amountInput = document.getElementById('txn-amount');
  const categoryInput = document.getElementById('txn-category');
  const dateInput = document.getElementById('txn-date');
  const descInput = document.getElementById('txn-description');
  const saveBtn = document.getElementById('save-transaction-btn');
  const closeModalBtn = document.getElementById('close-transaction-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-transaction-btn');
  const typeRadios = document.querySelectorAll('input[name="txn-type"]');

  function populateFilterCategories() {
    const options = ['<option value="all">All Categories</option>'];
    ALL_CATEGORIES.forEach((cat) => {
      options.push(`<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`);
    });
    categorySelect.innerHTML = options.join('');
    categorySelect.value = filterState.category;
  }

  function populateFormCategories(type, selectedCategory = '') {
    const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    categoryInput.innerHTML = list
      .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
      .join('');

    if (selectedCategory && list.includes(selectedCategory)) {
      categoryInput.value = selectedCategory;
    } else {
      categoryInput.value = list[0];
    }
  }

  function clearValidationErrors() {
    ['type', 'title', 'amount', 'category', 'date', 'description'].forEach((field) => {
      const errEl = document.getElementById(`err-txn-${field}`);
      if (errEl) {
        errEl.textContent = '';
        errEl.hidden = true;
      }
    });
    [titleInput, amountInput, categoryInput, dateInput, descInput].forEach((input) => {
      input.classList.remove('is-invalid');
    });
  }

  function showValidationErrors(errors) {
    clearValidationErrors();
    const fieldMap = {
      title: titleInput,
      amount: amountInput,
      category: categoryInput,
      date: dateInput,
      description: descInput,
    };

    Object.entries(errors).forEach(([field, message]) => {
      const errEl = document.getElementById(`err-txn-${field}`);
      if (errEl) {
        errEl.textContent = message;
        errEl.hidden = false;
      }
      if (fieldMap[field]) {
        fieldMap[field].classList.add('is-invalid');
      }
    });
  }

  function openAddModal() {
    clearValidationErrors();
    idInput.value = '';
    modalTitle.textContent = 'Add Transaction';
    saveBtn.textContent = 'Save Transaction';

    const expenseRadio = document.querySelector('input[name="txn-type"][value="expense"]');
    if (expenseRadio) expenseRadio.checked = true;

    populateFormCategories('expense');
    titleInput.value = '';
    amountInput.value = '';
    dateInput.value = getTodayISO();
    descInput.value = '';

    modal.hidden = false;
    titleInput.focus();
  }

  function openEditModal(id) {
    const txn = getTransactions().find((item) => item.id === id);
    if (!txn) return;

    clearValidationErrors();
    idInput.value = txn.id;
    modalTitle.textContent = 'Edit Transaction';
    saveBtn.textContent = 'Update Transaction';

    const radio = document.querySelector(`input[name="txn-type"][value="${txn.type}"]`);
    if (radio) radio.checked = true;

    populateFormCategories(txn.type, txn.category);
    titleInput.value = txn.title;
    amountInput.value = txn.amount;
    dateInput.value = txn.date;
    descInput.value = txn.description || '';

    modal.hidden = false;
    titleInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
    clearValidationErrors();
  }

  function render() {
    const allTransactions = getTransactions();
    const filtered = filterAndSortTransactions(allTransactions, filterState);

    const hasActiveFilters =
      Boolean(filterState.search) ||
      filterState.category !== 'all' ||
      filterState.type !== 'all';

    // Update summary bar
    const countText = filtered.length === 1 ? '1 entry' : `${filtered.length} entries`;
    countLabel.textContent = hasActiveFilters
      ? `${countText} matching filters (of ${allTransactions.length})`
      : countText;

    const net = filtered.reduce((acc, item) => {
      return acc + (item.type === 'income' ? item.amount : -item.amount);
    }, 0);
    netLabel.textContent = filtered.length
      ? `Net total: ${net >= 0 ? '+' : ''}${formatCurrency(net)}`
      : '';

    renderTransactionsTable(tableContainer, filtered, {
      showActions: true,
      emptyTitle: hasActiveFilters ? 'No matching transactions' : 'No transactions recorded',
      emptyText: hasActiveFilters
        ? 'Try clearing or adjusting your search query and category filters.'
        : 'Add your first income or expense entry to start tracking.',
      emptyCtaLabel: hasActiveFilters ? 'Reset Filters' : 'Add Transaction',
      onEmptyCta: () => {
        if (hasActiveFilters) {
          resetFilters();
        } else {
          openAddModal();
        }
      },
      onEdit: (id) => openEditModal(id),
      onDelete: (id) => onDeleteRequest(id),
    });
  }

  function resetFilters() {
    filterState.search = '';
    filterState.category = 'all';
    filterState.type = 'all';
    filterState.sortBy = 'date-desc';

    searchInput.value = '';
    categorySelect.value = 'all';
    sortSelect.value = 'date-desc';
    typeButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.typeFilter === 'all');
    });
    render();
  }

  // Event bindings
  populateFilterCategories();

  searchInput.addEventListener('input', (e) => {
    filterState.search = e.target.value;
    render();
  });

  categorySelect.addEventListener('change', (e) => {
    filterState.category = e.target.value;
    render();
  });

  sortSelect.addEventListener('change', (e) => {
    filterState.sortBy = e.target.value;
    render();
  });

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterState.type = btn.dataset.typeFilter || 'all';
      typeButtons.forEach((item) => {
        item.classList.toggle('is-active', item === btn);
      });
      render();
    });
  });

  clearFiltersBtn.addEventListener('click', resetFilters);

  typeRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      populateFormCategories(e.target.value);
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedType =
      document.querySelector('input[name="txn-type"]:checked')?.value || 'expense';

    const payload = {
      title: titleInput.value.trim(),
      amount: Number(amountInput.value),
      type: selectedType,
      category: categoryInput.value,
      date: dateInput.value,
      description: descInput.value.trim(),
    };

    const validation = validateTransactionInput(payload);
    if (!validation.valid) {
      showValidationErrors(validation.errors);
      return;
    }

    const existingId = idInput.value.trim();
    if (existingId) {
      onUpdateTransaction(existingId, payload);
    } else {
      onAddTransaction(payload);
    }
    closeModal();
  });

  closeModalBtn.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  return {
    render,
    openAddModal,
    openEditModal,
    closeModal,
    isModalOpen: () => !modal.hidden,
  };
}
