/**
 * Expense Analytics Module
 * ---------------------------------------------------------------------------
 * Computes category-wise breakdowns, monthly income vs. expenses, savings,
 * highest spending category, and dynamic Chart.js visualizations.
 */

import {
  CATEGORY_COLORS,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthKey,
} from './transactions.js';

/**
 * Filters transactions by analytics timeframe ('month' | '3m' | 'all').
 * @param {Array<object>} transactions
 * @param {string} range
 * @returns {Array<object>}
 */
function filterByTimeframe(transactions, range) {
  if (range === 'all') return transactions;

  const currentMonth = getCurrentMonthKey();
  if (range === 'month') {
    return transactions.filter((txn) => txn.date && txn.date.startsWith(currentMonth));
  }

  if (range === '3m') {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    return transactions.filter(
      (txn) => txn.date && txn.date.slice(0, 7) >= cutoffKey
    );
  }

  return transactions;
}

/**
 * Pure analytics calculation independent of storage.
 * @param {Array<object>} allTransactions
 * @param {string} range
 * @returns {object}
 */
export function computeAnalytics(allTransactions, range = 'all') {
  const transactions = filterByTimeframe(allTransactions, range);

  let totalIncome = 0;
  let totalExpenses = 0;
  let expenseCount = 0;

  const monthlyMap = new Map();
  const categoryMap = new Map();

  for (const txn of transactions) {
    const amount = Number(txn.amount) || 0;
    const monthKey = txn.date ? txn.date.slice(0, 7) : '';

    if (/^\d{4}-\d{2}$/.test(monthKey)) {
      const mEntry = monthlyMap.get(monthKey) || {
        monthKey,
        income: 0,
        expenses: 0,
      };
      if (txn.type === 'income') {
        mEntry.income += amount;
      } else {
        mEntry.expenses += amount;
      }
      monthlyMap.set(monthKey, mEntry);
    }

    if (txn.type === 'income') {
      totalIncome += amount;
    } else {
      totalExpenses += amount;
      expenseCount += 1;

      const cEntry = categoryMap.get(txn.category) || {
        category: txn.category,
        total: 0,
        count: 0,
      };
      cEntry.total += amount;
      cEntry.count += 1;
      categoryMap.set(txn.category, cEntry);
    }
  }

  const totalSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;
  const avgExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;
  const incomeExpenseRatio =
    totalExpenses > 0 ? totalIncome / totalExpenses : totalIncome > 0 ? Infinity : 0;

  const monthlySeries = Array.from(monthlyMap.values())
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map((entry) => ({
      ...entry,
      label: formatShortMonth(entry.monthKey),
    }));

  const categorySeries = Array.from(categoryMap.values())
    .sort((a, b) => b.total - a.total)
    .map((entry) => ({
      ...entry,
      percent: totalExpenses > 0 ? (entry.total / totalExpenses) * 100 : 0,
      color: CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.Other,
    }));

  const highestCategory = categorySeries.length ? categorySeries[0] : null;

  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate,
    avgExpense,
    expenseCount,
    incomeExpenseRatio,
    highestCategory,
    monthlySeries,
    categorySeries,
  };
}

function formatShortMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: '2-digit',
  }).format(d);
}

/**
 * Controller for the Expense Analytics view.
 */
export function createAnalyticsController({ getTransactions }) {
  let activeRange = 'all';
  let incomeExpenseChart = null;
  let distributionChart = null;
  let categoryBarChart = null;

  const rangeButtons = document.querySelectorAll('[data-analytics-range]');

  const totalSavingsEl = document.getElementById('analytics-total-savings');
  const savingsRateEl = document.getElementById('analytics-savings-rate');
  const topCategoryEl = document.getElementById('analytics-top-category');
  const topCategoryMetaEl = document.getElementById('analytics-top-category-meta');
  const avgExpenseEl = document.getElementById('analytics-avg-expense');
  const avgExpenseMetaEl = document.getElementById('analytics-avg-expense-meta');
  const ratioEl = document.getElementById('analytics-ratio');
  const ratioMetaEl = document.getElementById('analytics-ratio-meta');

  const incomeExpenseCanvas = document.getElementById('analytics-income-expense-chart');
  const incomeExpenseEmpty = document.getElementById('analytics-income-expense-empty');
  const distributionCanvas = document.getElementById('analytics-distribution-chart');
  const distributionEmpty = document.getElementById('analytics-distribution-empty');
  const categoryBarCanvas = document.getElementById('analytics-category-bar-chart');
  const categoryBarEmpty = document.getElementById('analytics-category-bar-empty');
  const categoryTableEl = document.getElementById('analytics-category-table');

  function renderIncomeExpenseChart(monthlySeries) {
    if (incomeExpenseChart) {
      incomeExpenseChart.destroy();
      incomeExpenseChart = null;
    }

    if (!monthlySeries.length || typeof window.Chart === 'undefined') {
      incomeExpenseCanvas.hidden = true;
      incomeExpenseEmpty.hidden = false;
      return;
    }

    incomeExpenseCanvas.hidden = false;
    incomeExpenseEmpty.hidden = true;

    incomeExpenseChart = new window.Chart(incomeExpenseCanvas, {
      type: 'bar',
      data: {
        labels: monthlySeries.map((m) => m.label),
        datasets: [
          {
            label: 'Income',
            data: monthlySeries.map((m) => m.income),
            backgroundColor: '#16A34A',
            borderRadius: 4,
            maxBarThickness: 28,
          },
          {
            label: 'Expenses',
            data: monthlySeries.map((m) => m.expenses),
            backgroundColor: '#0F172A',
            borderRadius: 4,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: false,
              color: '#475569',
              font: { family: "'DM Sans', sans-serif", size: 12 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#64748B',
              font: { family: "'DM Sans', sans-serif", size: 12 },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#F1F5F9' },
            border: { display: false },
            ticks: {
              color: '#64748B',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (v) => `$${v}`,
            },
          },
        },
      },
    });
  }

  function renderDistributionChart(categorySeries) {
    if (distributionChart) {
      distributionChart.destroy();
      distributionChart = null;
    }

    if (!categorySeries.length || typeof window.Chart === 'undefined') {
      distributionCanvas.hidden = true;
      distributionEmpty.hidden = false;
      return;
    }

    distributionCanvas.hidden = false;
    distributionEmpty.hidden = true;

    distributionChart = new window.Chart(distributionCanvas, {
      type: 'doughnut',
      data: {
        labels: categorySeries.map((c) => c.category),
        datasets: [
          {
            data: categorySeries.map((c) => c.total),
            backgroundColor: categorySeries.map((c) => c.color),
            borderWidth: 2,
            borderColor: '#FFFFFF',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              color: '#475569',
              font: { family: "'DM Sans', sans-serif", size: 12 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const item = categorySeries[ctx.dataIndex];
                return ` ${item.category}: ${formatCurrency(item.total)} (${item.percent.toFixed(
                  1
                )}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderCategoryBarChart(categorySeries) {
    if (categoryBarChart) {
      categoryBarChart.destroy();
      categoryBarChart = null;
    }

    if (!categorySeries.length || typeof window.Chart === 'undefined') {
      categoryBarCanvas.hidden = true;
      categoryBarEmpty.hidden = false;
      return;
    }

    categoryBarCanvas.hidden = false;
    categoryBarEmpty.hidden = true;

    categoryBarChart = new window.Chart(categoryBarCanvas, {
      type: 'bar',
      data: {
        labels: categorySeries.map((c) => c.category),
        datasets: [
          {
            label: 'Total Spent',
            data: categorySeries.map((c) => c.total),
            backgroundColor: categorySeries.map((c) => c.color),
            borderRadius: 4,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${formatCurrency(ctx.parsed.x)}`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: '#F1F5F9' },
            border: { display: false },
            ticks: {
              color: '#64748B',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (v) => `$${v}`,
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: '#334155',
              font: { family: "'DM Sans', sans-serif", size: 12 },
            },
          },
        },
      },
    });
  }

  function renderCategoryTable(categorySeries) {
    if (!categorySeries.length) {
      categoryTableEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="pie-chart"></i></div>
          <h3 class="empty-state-title">No expense breakdown available</h3>
          <p class="empty-state-text">Record expense transactions within this timeframe to view category metrics.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ root: categoryTableEl });
      return;
    }

    const rows = categorySeries
      .map(
        (item) => `
          <tr>
            <td>
              <span class="legend-label">
                <span class="legend-swatch" style="background-color: ${item.color};"></span>
                <span>${escapeHtml(item.category)}</span>
              </span>
            </td>
            <td class="col-right tabular-nums">${item.count}</td>
            <td class="col-right tabular-nums">${item.percent.toFixed(1)}%</td>
            <td class="col-right amount-cell tabular-nums">${escapeHtml(
              formatCurrency(item.total)
            )}</td>
          </tr>
        `
      )
      .join('');

    categoryTableEl.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" class="col-right">Entries</th>
            <th scope="col" class="col-right">Share</th>
            <th scope="col" class="col-right">Total Spent</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function render() {
    const transactions = getTransactions();
    const data = computeAnalytics(transactions, activeRange);

    // KPI 1: Total Savings
    totalSavingsEl.textContent = formatCurrency(data.totalSavings);
    totalSavingsEl.className = `kpi-value tabular-nums ${
      data.totalSavings > 0
        ? 'text-income'
        : data.totalSavings < 0
        ? 'text-expense'
        : ''
    }`;
    savingsRateEl.textContent =
      data.totalIncome > 0
        ? `${data.savingsRate.toFixed(1)}% of ${formatCurrency(data.totalIncome)} income`
        : 'No income recorded in range';

    // KPI 2: Highest Spending Category
    if (data.highestCategory) {
      topCategoryEl.textContent = data.highestCategory.category;
      topCategoryMetaEl.textContent = `${formatCurrency(
        data.highestCategory.total
      )} (${data.highestCategory.percent.toFixed(1)}% of spending)`;
    } else {
      topCategoryEl.textContent = '—';
      topCategoryMetaEl.textContent = 'No expense entries in range';
    }

    // KPI 3: Avg Expense Size
    avgExpenseEl.textContent = formatCurrency(data.avgExpense);
    avgExpenseMetaEl.textContent =
      data.expenseCount === 1
        ? 'Across 1 expense entry'
        : `Across ${data.expenseCount} expense entries`;

    // KPI 4: Income-to-Expense Ratio
    if (data.incomeExpenseRatio === Infinity) {
      ratioEl.textContent = '∞';
      ratioMetaEl.textContent = 'Income recorded with zero expenses';
    } else {
      ratioEl.textContent = `${data.incomeExpenseRatio.toFixed(2)}x`;
      ratioMetaEl.textContent =
        data.totalExpenses > 0
          ? `${formatCurrency(data.totalIncome)} in / ${formatCurrency(
              data.totalExpenses
            )} out`
          : 'No data recorded in range';
    }

    // Charts & Table
    renderIncomeExpenseChart(data.monthlySeries);
    renderDistributionChart(data.categorySeries);
    renderCategoryBarChart(data.categorySeries);
    renderCategoryTable(data.categorySeries);
  }

  rangeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRange = btn.dataset.analyticsRange || 'all';
      rangeButtons.forEach((item) => {
        item.classList.toggle('is-active', item === btn);
      });
      render();
    });
  });

  return {
    render,
  };
}
