/**
 * Application Entry & Coordinator Module
 * ---------------------------------------------------------------------------
 * Wires navigation, modals, CSV export, notifications, and coordinates
 * Dashboard, Transactions, Analytics, and Budget modules.
 */

import * as Storage from './storage.js';
import {
  createTransactionsController,
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthKey,
} from './transactions.js';
import { createDashboardController } from './dashboard.js';
import { createAnalyticsController } from './analytics.js';
import { createBudgetController } from './budget.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Analytics',
  budget: 'Budget',
};

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}

function exportTransactionsToCSV(transactions) {
  if (!transactions.length) {
    showToast('No transactions available to export.');
    return;
  }

  const headers = ['ID', 'Title', 'Type', 'Category', 'Amount', 'Date', 'Description'];
  const escapeCSV = (val) => {
    const str = String(val ?? '');
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(','),
    ...transactions.map((txn) =>
      [
        txn.id,
        txn.title,
        txn.type,
        txn.category,
        Number(txn.amount).toFixed(2),
        txn.date,
        txn.description,
      ]
        .map(escapeCSV)
        .join(',')
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ledger-transactions-${getCurrentMonthKey()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Exported transactions to CSV.');
}

function initApp() {
  // 1. Ensure initial demo data is seeded only on first launch
  Storage.seedInitialDataIfEmpty();

  // 2. Active view state
  let activeView = 'dashboard';

  // DOM References
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const openSidebarBtn = document.getElementById('open-sidebar-btn');
  const closeSidebarBtn = document.getElementById('close-sidebar-btn');
  const navButtons = document.querySelectorAll('.nav-item[data-view]');
  const brandLink = document.querySelector('.brand[data-nav]');
  const viewTitleEl = document.getElementById('current-view-title');
  const periodLabelEl = document.getElementById('topbar-period-label');
  const openAddModalBtn = document.getElementById('open-add-modal-btn');
  const transactionsAddBtn = document.getElementById('transactions-add-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');
  const resetDemoBtn = document.getElementById('reset-demo-btn');

  // Confirmation Modal References
  const confirmModal = document.getElementById('confirm-modal');
  const confirmTitleEl = document.getElementById('confirm-modal-title');
  const confirmMessageEl = document.getElementById('confirm-modal-message');
  const confirmAcceptBtn = document.getElementById('confirm-accept-btn');
  const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  const closeConfirmBtn = document.getElementById('close-confirm-modal-btn');
  let pendingConfirmAction = null;

  periodLabelEl.textContent = formatMonthLabel(getCurrentMonthKey());

  function openConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm }) {
    confirmTitleEl.textContent = title;
    confirmMessageEl.textContent = message;
    confirmAcceptBtn.textContent = confirmLabel;
    pendingConfirmAction = onConfirm;
    confirmModal.hidden = false;
    confirmAcceptBtn.focus();
  }

  function closeConfirmModal() {
    confirmModal.hidden = true;
    pendingConfirmAction = null;
  }

  confirmAcceptBtn.addEventListener('click', () => {
    const action = pendingConfirmAction;
    closeConfirmModal();
    if (typeof action === 'function') action();
  });
  confirmCancelBtn.addEventListener('click', closeConfirmModal);
  closeConfirmBtn.addEventListener('click', closeConfirmModal);
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmModal();
  });

  // Mobile sidebar controls
  function openSidebar() {
    sidebar.classList.add('is-open');
    sidebarBackdrop.classList.add('is-open');
    openSidebarBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    sidebarBackdrop.classList.remove('is-open');
    openSidebarBtn.setAttribute('aria-expanded', 'false');
  }

  openSidebarBtn.addEventListener('click', openSidebar);
  closeSidebarBtn.addEventListener('click', closeSidebar);
  sidebarBackdrop.addEventListener('click', closeSidebar);

  // Module Controllers
  let transactionsCtrl;
  let dashboardCtrl;
  let analyticsCtrl;
  let budgetCtrl;

  function renderAllViews() {
    dashboardCtrl.render();
    transactionsCtrl.render();
    analyticsCtrl.render();
    budgetCtrl.render();
  }

  function requestDeleteTransaction(id) {
    const txn = Storage.getTransactions().find((item) => item.id === id);
    if (!txn) return;
    openConfirmModal({
      title: 'Delete Transaction',
      message: `Delete "${txn.title}" (${formatCurrency(
        txn.amount
      )})? This action cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        if (Storage.deleteTransaction(id)) {
          renderAllViews();
          showToast('Transaction deleted.');
        }
      },
    });
  }

  function navigateToView(viewName) {
    if (!VIEW_TITLES[viewName]) return;
    activeView = viewName;

    document.querySelectorAll('.view-panel').forEach((panel) => {
      const isMatch = panel.id === `view-${viewName}`;
      panel.hidden = !isMatch;
      panel.classList.toggle('is-active', isMatch);
    });

    navButtons.forEach((btn) => {
      const isMatch = btn.dataset.view === viewName;
      btn.classList.toggle('is-active', isMatch);
      if (isMatch) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    viewTitleEl.textContent = VIEW_TITLES[viewName];
    closeSidebar();

    // Re-render target view so charts resize cleanly when becoming visible
    if (viewName === 'dashboard') dashboardCtrl.render();
    if (viewName === 'transactions') transactionsCtrl.render();
    if (viewName === 'analytics') analyticsCtrl.render();
    if (viewName === 'budget') budgetCtrl.render();
  }

  transactionsCtrl = createTransactionsController({
    getTransactions: Storage.getTransactions,
    onAddTransaction: (payload) => {
      Storage.addTransaction(payload);
      renderAllViews();
      showToast('Transaction added.');
    },
    onUpdateTransaction: (id, payload) => {
      Storage.updateTransaction(id, payload);
      renderAllViews();
      showToast('Transaction updated.');
    },
    onDeleteRequest: requestDeleteTransaction,
  });

  dashboardCtrl = createDashboardController({
    getTransactions: Storage.getTransactions,
    getBudget: Storage.getBudget,
    onNavigateView: navigateToView,
    onOpenAddModal: () => transactionsCtrl.openAddModal(),
    onEditTransaction: (id) => transactionsCtrl.openEditModal(id),
    onDeleteRequest: requestDeleteTransaction,
  });

  analyticsCtrl = createAnalyticsController({
    getTransactions: Storage.getTransactions,
  });

  budgetCtrl = createBudgetController({
    getTransactions: Storage.getTransactions,
    getBudget: Storage.getBudget,
    onSaveBudget: (monthlyLimit) => {
      Storage.saveBudget(monthlyLimit);
      renderAllViews();
      showToast(`Monthly budget set to ${formatCurrency(monthlyLimit)}.`);
    },
  });

  // Navigation event bindings
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateToView(btn.dataset.view);
    });
  });

  if (brandLink) {
    brandLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToView('dashboard');
    });
  }

  // Global add buttons
  openAddModalBtn.addEventListener('click', () => transactionsCtrl.openAddModal());
  transactionsAddBtn.addEventListener('click', () => transactionsCtrl.openAddModal());

  // Utility actions
  exportCsvBtn.addEventListener('click', () => {
    exportTransactionsToCSV(Storage.getTransactions());
  });

  resetDemoBtn.addEventListener('click', () => {
    openConfirmModal({
      title: 'Reset Sample Data',
      message:
        'This will replace your current transactions and budget with the default sample dataset.',
      confirmLabel: 'Reset Data',
      onConfirm: () => {
        Storage.resetSampleData();
        renderAllViews();
        showToast('Sample dataset restored.');
      },
    });
  });

  // Global Escape handler for modals & mobile drawer
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!confirmModal.hidden) {
      closeConfirmModal();
      return;
    }
    if (transactionsCtrl.isModalOpen()) {
      transactionsCtrl.closeModal();
      return;
    }
    if (sidebar.classList.contains('is-open')) {
      closeSidebar();
    }
  });

  // Initial render
  navigateToView(activeView);
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

document.addEventListener('DOMContentLoaded', initApp);
