/**
 * Dashboard Module
 * ---------------------------------------------------------------------------
 * Renders dynamic financial summary cards, monthly spending overview chart,
 * expense category breakdown chart, budget status strip, and recent entries.
 */

import { calculateBudgetStatus, renderBudgetAlertBanner } from './budget.js';
import {
  CATEGORY_COLORS,
  calculateSummary,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthKey,
  renderTransactionsTable,
} from './transactions.js';

/**
 * Computes daily spending series for a given month (YYYY-MM).
 * @param {Array<object>} transactions
 * @param {string} monthKey
 * @returns {{ labels: Array<string>, values: Array<number>, hasData: boolean }}
 */
function buildDailySpendingSeries(transactions, monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dailyTotals = new Array(daysInMonth).fill(0);
  let hasData = false;

  for (const txn of transactions) {
    if (txn.type !== 'expense' || !txn.date || !txn.date.startsWith(monthKey)) continue;
    const day = Number(txn.date.slice(8, 10));
    if (day >= 1 && day <= daysInMonth) {
      dailyTotals[day - 1] += Number(txn.amount) || 0;
      hasData = true;
    }
  }

  const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
  return { labels, values: dailyTotals, hasData };
}

/**
 * Aggregates expense totals by category for a given month (or all if none in month).
 * @param {Array<object>} transactions
 * @param {string} monthKey
 * @returns {Array<{ category: string, total: number, percent: number, color: string }>}
 */
function buildCategorySeries(transactions, monthKey) {
  const monthlyExpenses = transactions.filter(
    (txn) => txn.type === 'expense' && txn.date && txn.date.startsWith(monthKey)
  );
  const totalSpend = monthlyExpenses.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const map = new Map();
  for (const txn of monthlyExpenses) {
    map.set(txn.category, (map.get(txn.category) || 0) + (Number(txn.amount) || 0));
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => ({
      category,
      total,
      percent: totalSpend > 0 ? (total / totalSpend) * 100 : 0,
      color: CATEGORY_COLORS[category] || CATEGORY_COLORS.Other,
    }));
}

export function createDashboardController({
  getTransactions,
  getBudget,
  onNavigateView,
  onOpenAddModal,
  onEditTransaction,
  onDeleteRequest,
}) {
  let selectedMonth = getCurrentMonthKey();
  let spendingChart = null;
  let categoryChart = null;

  const monthSelect = document.getElementById('dashboard-month-select');
  const budgetAlertEl = document.getElementById('dashboard-budget-alert');

  const kpiBalance = document.getElementById('kpi-total-balance');
  const kpiBalanceMeta = document.getElementById('kpi-balance-meta');
  const kpiIncome = document.getElementById('kpi-total-income');
  const kpiIncomeMeta = document.getElementById('kpi-income-meta');
  const kpiExpenses = document.getElementById('kpi-total-expenses');
  const kpiExpensesMeta = document.getElementById('kpi-expenses-meta');
  const kpiMonthlySpending = document.getElementById('kpi-monthly-spending');
  const kpiMonthlyMeta = document.getElementById('kpi-monthly-meta');

  const spendingCanvas = document.getElementById('dashboard-spending-chart');
  const spendingEmpty = document.getElementById('dashboard-spending-empty');
  const categoryCanvas = document.getElementById('dashboard-category-chart');
  const categoryEmpty = document.getElementById('dashboard-category-empty');
  const categoryLegend = document.getElementById('dashboard-category-legend');

  const recentContainer = document.getElementById('recent-transactions-container');
  const viewAllBtn = document.getElementById('view-all-transactions-btn');

  function syncMonthSelector(availableMonths) {
    if (!availableMonths.includes(selectedMonth)) {
      selectedMonth = availableMonths[0] || getCurrentMonthKey();
    }
    monthSelect.innerHTML = availableMonths
      .map(
        (key) =>
          `<option value="${escapeHtml(key)}">${escapeHtml(formatMonthLabel(key))}</option>`
      )
      .join('');
    monthSelect.value = selectedMonth;
  }

  function renderSpendingChart(transactions) {
    const { labels, values, hasData } = buildDailySpendingSeries(transactions, selectedMonth);

    if (spendingChart) {
      spendingChart.destroy();
      spendingChart = null;
    }

    if (!hasData || typeof window.Chart === 'undefined') {
      spendingCanvas.hidden = true;
      spendingEmpty.hidden = false;
      spendingEmpty.textContent = hasData
        ? 'Chart visualization unavailable offline.'
        : `No expense entries recorded for ${formatMonthLabel(selectedMonth)}.`;
      return;
    }

    spendingCanvas.hidden = false;
    spendingEmpty.hidden = true;

    spendingChart = new window.Chart(spendingCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Daily Spending',
            data: values,
            backgroundColor: '#2563EB',
            borderRadius: 4,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `${formatMonthLabel(selectedMonth)} — Day ${items[0].label}`,
              label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#64748B',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              maxTicksLimit: 12,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#F1F5F9' },
            border: { display: false },
            ticks: {
              color: '#64748B',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (value) => `$${value}`,
            },
          },
        },
      },
    });
  }

  function renderCategoryChart(transactions) {
    const series = buildCategorySeries(transactions, selectedMonth);

    if (categoryChart) {
      categoryChart.destroy();
      categoryChart = null;
    }

    if (!series.length) {
      categoryCanvas.hidden = true;
      categoryEmpty.hidden = false;
      categoryLegend.innerHTML = '';
      return;
    }

    categoryLegend.innerHTML = series
      .slice(0, 6)
      .map(
        (item) => `
          <li class="legend-row">
            <span class="legend-label">
              <span class="legend-swatch" style="background-color: ${item.color};"></span>
              <span class="legend-name">${escapeHtml(item.category)}</span>
            </span>
            <span class="legend-value tabular-nums">
              ${escapeHtml(formatCurrency(item.total))} (${item.percent.toFixed(0)}%)
            </span>
          </li>
        `
      )
      .join('');

    if (typeof window.Chart === 'undefined') {
      categoryCanvas.hidden = true;
      categoryEmpty.hidden = false;
      categoryEmpty.textContent = 'Chart visualization unavailable offline.';
      return;
    }

    categoryCanvas.hidden = false;
    categoryEmpty.hidden = true;

    categoryChart = new window.Chart(categoryCanvas, {
      type: 'doughnut',
      data: {
        labels: series.map((s) => s.category),
        datasets: [
          {
            data: series.map((s) => s.total),
            backgroundColor: series.map((s) => s.color),
            borderWidth: 2,
            borderColor: '#FFFFFF',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }

  function render() {
    const transactions = getTransactions();
    const budget = getBudget();
    const summary = calculateSummary(transactions, selectedMonth);

    syncMonthSelector(summary.availableMonths);

    // Recalculate for synchronized selectedMonth
    const activeSummary = calculateSummary(transactions, selectedMonth);
    const budgetStatus = calculateBudgetStatus(transactions, budget.monthlyLimit, selectedMonth);

    // Budget warning/exceeded strip on dashboard
    renderBudgetAlertBanner(budgetAlertEl, budgetStatus, () => onNavigateView('budget'));

    // KPI Cards
    kpiBalance.textContent = formatCurrency(activeSummary.totalBalance);
    kpiBalance.className = `kpi-value tabular-nums ${
      activeSummary.totalBalance < 0 ? 'text-expense' : ''
    }`;
    kpiBalanceMeta.textContent = `${
      activeSummary.incomeCount + activeSummary.expenseCount
    } total transactions`;

    kpiIncome.textContent = formatCurrency(activeSummary.totalIncome);
    kpiIncomeMeta.textContent =
      activeSummary.incomeCount === 1
        ? '1 income entry'
        : `${activeSummary.incomeCount} income entries`;

    kpiExpenses.textContent = formatCurrency(activeSummary.totalExpenses);
    kpiExpensesMeta.textContent =
      activeSummary.expenseCount === 1
        ? '1 expense entry'
        : `${activeSummary.expenseCount} expense entries`;

    kpiMonthlySpending.textContent = formatCurrency(activeSummary.monthlySpending);
    kpiMonthlyMeta.textContent =
      budget.monthlyLimit > 0
        ? `${budgetStatus.utilizationPercent.toFixed(0)}% of ${formatCurrency(
            budget.monthlyLimit
          )} budget`
        : `${formatMonthLabel(selectedMonth)} · ${activeSummary.monthlyExpenseCount} expenses`;

    // Charts
    renderSpendingChart(transactions);
    renderCategoryChart(transactions);

    // Recent Transactions (top 6 sorted by date desc)
    const recent = [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 6);

    renderTransactionsTable(recentContainer, recent, {
      showActions: true,
      emptyTitle: 'No transactions yet',
      emptyText: 'Record your first income or expense to populate your financial dashboard.',
      emptyCtaLabel: 'Add Transaction',
      onEmptyCta: onOpenAddModal,
      onEdit: onEditTransaction,
      onDelete: onDeleteRequest,
    });
  }

  monthSelect.addEventListener('change', (e) => {
    selectedMonth = e.target.value;
    render();
  });

  viewAllBtn.addEventListener('click', () => {
    onNavigateView('transactions');
  });

  return {
    render,
  };
}
