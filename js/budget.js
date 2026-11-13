/**
 * Budget Management Module
 * ---------------------------------------------------------------------------
 * Handles monthly budget calculations, 80% warning & exceeded alerts,
 * and category-level budget impact analysis.
 */

import {
  CATEGORY_COLORS,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthKey,
} from './transactions.js';

/**
 * Pure calculation of monthly budget status independent of storage.
 * @param {Array<object>} transactions
 * @param {number} monthlyLimit
 * @param {string} targetMonth YYYY-MM
 * @returns {object}
 */
export function calculateBudgetStatus(
  transactions,
  monthlyLimit,
  targetMonth = getCurrentMonthKey()
) {
  const limit = Number(monthlyLimit) || 0;
  const monthlyExpenses = transactions.filter(
    (txn) => txn.type === 'expense' && txn.date && txn.date.startsWith(targetMonth)
  );

  const spent = monthlyExpenses.reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0);
  const remaining = limit - spent;
  const utilizationPercent = limit > 0 ? (spent / limit) * 100 : 0;

  let status = 'unset';
  if (limit > 0) {
    if (utilizationPercent > 100) {
      status = 'exceeded';
    } else if (utilizationPercent >= 80) {
      status = 'warning';
    } else {
      status = 'healthy';
    }
  }

  // Category breakdown for target month
  const categoryMap = new Map();
  for (const txn of monthlyExpenses) {
    const prev = categoryMap.get(txn.category) || { category: txn.category, total: 0, count: 0 };
    prev.total += Number(txn.amount) || 0;
    prev.count += 1;
    categoryMap.set(txn.category, prev);
  }

  const categoryBreakdown = Array.from(categoryMap.values())
    .sort((a, b) => b.total - a.total)
    .map((entry) => ({
      ...entry,
      percentOfBudget: limit > 0 ? (entry.total / limit) * 100 : 0,
      percentOfSpend: spent > 0 ? (entry.total / spent) * 100 : 0,
    }));

  return {
    targetMonth,
    limit,
    spent,
    remaining,
    utilizationPercent,
    status,
    expenseCount: monthlyExpenses.length,
    categoryBreakdown,
  };
}

/**
 * Renders a reusable alert banner when budget reaches 80% or is exceeded.
 * @param {HTMLElement} container
 * @param {object} budgetStatus
 * @param {Function|null} onNavigateToBudget
 */
export function renderBudgetAlertBanner(container, budgetStatus, onNavigateToBudget = null) {
  if (!container) return;

  if (budgetStatus.status !== 'warning' && budgetStatus.status !== 'exceeded') {
    container.hidden = true;
    container.innerHTML = '';
    container.className = 'alert-banner';
    return;
  }

  const isExceeded = budgetStatus.status === 'exceeded';
  const pctText = `${budgetStatus.utilizationPercent.toFixed(1)}%`;
  const monthText = formatMonthLabel(budgetStatus.targetMonth);

  container.className = `alert-banner ${isExceeded ? 'is-exceeded' : 'is-warning'}`;
  container.hidden = false;

  const messageHtml = isExceeded
    ? `<strong>Budget Exceeded (${escapeHtml(pctText)})</strong> — Expenses in ${escapeHtml(
        monthText
      )} are <span class="tabular-nums">${escapeHtml(
        formatCurrency(Math.abs(budgetStatus.remaining))
      )}</span> over your <span class="tabular-nums">${escapeHtml(
        formatCurrency(budgetStatus.limit)
      )}</span> limit.`
    : `<strong>Budget Warning (${escapeHtml(pctText)})</strong> — You have used ${escapeHtml(
        pctText
      )} of your ${escapeHtml(monthText)} budget with <span class="tabular-nums">${escapeHtml(
        formatCurrency(budgetStatus.remaining)
      )}</span> remaining.`;

  container.innerHTML = `
    <div class="alert-banner-content">
      <i data-lucide="${isExceeded ? 'alert-octagon' : 'alert-triangle'}"></i>
      <span>${messageHtml}</span>
    </div>
    ${
      onNavigateToBudget
        ? '<button type="button" class="btn btn-secondary btn-sm" data-goto-budget>Manage Budget</button>'
        : ''
    }
  `;

  const actionBtn = container.querySelector('[data-goto-budget]');
  if (actionBtn && onNavigateToBudget) {
    actionBtn.addEventListener('click', onNavigateToBudget);
  }

  if (window.lucide) window.lucide.createIcons({ root: container });
}

/**
 * Controller for the Budget Management view.
 */
export function createBudgetController({ getTransactions, getBudget, onSaveBudget }) {
  let selectedMonth = getCurrentMonthKey();

  const monthSelect = document.getElementById('budget-month-select');
  const statusBanner = document.getElementById('budget-status-banner');
  const budgetForm = document.getElementById('budget-form');
  const limitInput = document.getElementById('budget-limit-input');
  const formError = document.getElementById('budget-form-error');

  const kpiLimit = document.getElementById('budget-kpi-limit');
  const kpiMonth = document.getElementById('budget-kpi-month');
  const kpiSpent = document.getElementById('budget-kpi-spent');
  const kpiCount = document.getElementById('budget-kpi-count');
  const remainingLabel = document.getElementById('budget-remaining-label');
  const kpiRemaining = document.getElementById('budget-kpi-remaining');
  const kpiUtilization = document.getElementById('budget-kpi-utilization');

  const percentBadge = document.getElementById('budget-percent-badge');
  const progressSubtitle = document.getElementById('budget-progress-subtitle');
  const progressBarWrap = document.getElementById('budget-progress-bar-wrap');
  const progressFill = document.getElementById('budget-progress-fill');
  const categoryTable = document.getElementById('budget-category-table');

  function syncMonthOptions(transactions) {
    const monthSet = new Set([getCurrentMonthKey(), selectedMonth]);
    transactions.forEach((txn) => {
      if (txn.date && /^\d{4}-\d{2}/.test(txn.date)) {
        monthSet.add(txn.date.slice(0, 7));
      }
    });
    const sorted = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

    monthSelect.innerHTML = sorted
      .map(
        (key) =>
          `<option value="${escapeHtml(key)}">${escapeHtml(formatMonthLabel(key))}</option>`
      )
      .join('');
    monthSelect.value = selectedMonth;
  }

  function renderCategoryImpact(statusData) {
    if (!statusData.categoryBreakdown.length) {
      categoryTable.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="layers"></i></div>
          <h3 class="empty-state-title">No expenses for ${escapeHtml(
            formatMonthLabel(statusData.targetMonth)
          )}</h3>
          <p class="empty-state-text">Expenses recorded in this month will appear here with their share of your budget.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ root: categoryTable });
      return;
    }

    const rows = statusData.categoryBreakdown
      .map((item) => {
        const swatch = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;
        const budgetShare =
          statusData.limit > 0 ? `${item.percentOfBudget.toFixed(1)}%` : '—';
        return `
          <tr>
            <td>
              <span class="legend-label">
                <span class="legend-swatch" style="background-color: ${swatch};"></span>
                <span>${escapeHtml(item.category)}</span>
              </span>
            </td>
            <td class="col-right tabular-nums">${item.count}</td>
            <td class="col-right tabular-nums">${item.percentOfSpend.toFixed(1)}%</td>
            <td class="col-right tabular-nums">${budgetShare}</td>
            <td class="col-right amount-cell tabular-nums">${escapeHtml(
              formatCurrency(item.total)
            )}</td>
          </tr>
        `;
      })
      .join('');

    categoryTable.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col" class="col-right">Entries</th>
            <th scope="col" class="col-right">Share of Spend</th>
            <th scope="col" class="col-right">Budget Used</th>
            <th scope="col" class="col-right">Total Spent</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function render() {
    const transactions = getTransactions();
    const budget = getBudget();

    syncMonthOptions(transactions);

    if (document.activeElement !== limitInput) {
      limitInput.value = budget.monthlyLimit > 0 ? budget.monthlyLimit : '';
    }

    const data = calculateBudgetStatus(transactions, budget.monthlyLimit, selectedMonth);

    // KPIs
    kpiLimit.textContent = data.limit > 0 ? formatCurrency(data.limit) : 'Not set';
    kpiMonth.textContent = formatMonthLabel(data.targetMonth);
    kpiSpent.textContent = formatCurrency(data.spent);
    kpiCount.textContent =
      data.expenseCount === 1 ? '1 expense entry' : `${data.expenseCount} expense entries`;

    if (data.limit <= 0) {
      remainingLabel.textContent = 'Remaining Budget';
      kpiRemaining.textContent = '—';
      kpiRemaining.className = 'kpi-value tabular-nums';
      kpiUtilization.textContent = 'Set a budget limit to track';
    } else if (data.remaining < 0) {
      remainingLabel.textContent = 'Over Budget By';
      kpiRemaining.textContent = formatCurrency(Math.abs(data.remaining));
      kpiRemaining.className = 'kpi-value tabular-nums text-expense';
      kpiUtilization.textContent = `${data.utilizationPercent.toFixed(1)}% utilized`;
    } else {
      remainingLabel.textContent = 'Remaining Budget';
      kpiRemaining.textContent = formatCurrency(data.remaining);
      kpiRemaining.className =
        data.status === 'warning'
          ? 'kpi-value tabular-nums text-warning'
          : 'kpi-value tabular-nums text-income';
      kpiUtilization.textContent = `${data.utilizationPercent.toFixed(1)}% utilized`;
    }

    // Progress Bar
    const clampedPct = Math.min(100, Math.max(0, data.utilizationPercent));
    percentBadge.textContent =
      data.limit > 0 ? `${data.utilizationPercent.toFixed(1)}%` : '0%';
    percentBadge.className = `utilization-value tabular-nums ${
      data.status === 'exceeded'
        ? 'text-expense'
        : data.status === 'warning'
        ? 'text-warning'
        : ''
    }`;

    progressFill.style.width = `${clampedPct.toFixed(2)}%`;
    progressFill.className = 'progress-fill';
    if (data.status === 'exceeded') {
      progressFill.classList.add('is-exceeded');
    } else if (data.status === 'warning') {
      progressFill.classList.add('is-warning');
    }

    progressBarWrap.setAttribute('aria-valuenow', String(Math.round(clampedPct)));
    progressSubtitle.textContent =
      data.limit > 0
        ? `${formatCurrency(data.spent)} spent of ${formatCurrency(data.limit)} limit`
        : 'Enter a monthly budget target on the left to activate progress tracking';

    // Banner (show healthy banner on Budget page too if < 80% and limit set, or warning/exceeded)
    if (data.status === 'healthy') {
      statusBanner.hidden = false;
      statusBanner.className = 'alert-banner is-healthy';
      statusBanner.innerHTML = `
        <div class="alert-banner-content">
          <i data-lucide="check-circle-2"></i>
          <span><strong>On Track (${data.utilizationPercent.toFixed(
            1
          )}%)</strong> — Your ${escapeHtml(
            formatMonthLabel(data.targetMonth)
          )} spending is within budget with <span class="tabular-nums">${escapeHtml(
            formatCurrency(data.remaining)
          )}</span> remaining.</span>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ root: statusBanner });
    } else {
      renderBudgetAlertBanner(statusBanner, data, null);
    }

    renderCategoryImpact(data);
  }

  monthSelect.addEventListener('change', (e) => {
    selectedMonth = e.target.value;
    render();
  });

  budgetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = Number(limitInput.value);
    if (!Number.isFinite(val) || val <= 0) {
      formError.textContent = 'Please enter a valid monthly budget greater than $0.00.';
      formError.hidden = false;
      limitInput.classList.add('is-invalid');
      return;
    }
    if (val > 100000000) {
      formError.textContent = 'Budget amount exceeds the maximum allowed limit.';
      formError.hidden = false;
      limitInput.classList.add('is-invalid');
      return;
    }

    formError.textContent = '';
    formError.hidden = true;
    limitInput.classList.remove('is-invalid');
    onSaveBudget(val);
  });

  return {
    render,
    getSelectedMonth: () => selectedMonth,
  };
}
