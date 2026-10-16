const CATEGORIES = {
  expense: [
    { name: "Food", icon: "🍜" }, { name: "Transport", icon: "🚗" },
    { name: "Education", icon: "📚" }, { name: "Shopping", icon: "🛍️" },
    { name: "Bills", icon: "🧾" }, { name: "Health", icon: "💊" },
    { name: "Entertainment", icon: "🎬" }, { name: "Home", icon: "🏠" },
    { name: "Other", icon: "✦" }
  ],
  income: [
    { name: "Salary", icon: "💼" }, { name: "Freelance", icon: "💻" },
    { name: "Business", icon: "🏪" }, { name: "Gift", icon: "🎁" },
    { name: "Investment", icon: "📈" }, { name: "Other", icon: "✦" }
  ]
};

const CATEGORY_COLORS = ["#6558e8", "#18ad82", "#f5a044", "#4a9ce7", "#e76c9c", "#8b75d7", "#e56d62", "#56b6c8", "#9da2b8"];
const STORAGE_KEY = "spendsmart_transactions_v1";
const BUDGET_KEY = "spendsmart_budgets_v1";
let transactions = loadTransactions();
let budgets = loadBudgets();
let spendingChart = null;
let editingId = null;
let toastTimeout;

const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat("en-PK", {
  style: "currency", currency: "PKR", maximumFractionDigits: 0
}).format(Number(amount) || 0);
const localDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const currentMonth = () => $("#monthFilter").value || localDateString().slice(0, 7);
const makeId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function loadTransactions() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter(t => t && t.id && t.description && Number.isFinite(Number(t.amount))) : [];
  } catch { return []; }
}
function loadBudgets() {
  const defaults = { Food: 15000, Transport: 8000, Education: 10000, Shopping: 10000, Bills: 12000, Health: 5000 };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(BUDGET_KEY) || "{}") }; }
  catch { return defaults; }
}
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets));
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}
function getCategoryIcon(category, type = "expense") {
  return (CATEGORIES[type] || CATEGORIES.expense).find(item => item.name === category)?.icon
    || [...CATEGORIES.expense, ...CATEGORIES.income].find(item => item.name === category)?.icon || "✦";
}
function monthTransactions() {
  return transactions.filter(t => String(t.date).startsWith(currentMonth()));
}
function getTotals(items) {
  return items.reduce((totals, t) => {
    totals[t.type] += Number(t.amount);
    return totals;
  }, { income: 0, expense: 0 });
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add("hidden"), 2800);
}

function renderDashboard() {
  const monthItems = monthTransactions();
  const totals = getTotals(monthItems);
  const balance = totals.income - totals.expense;
  const savingsRate = totals.income > 0 ? Math.round((balance / totals.income) * 100) : 0;
  $("#balanceValue").textContent = money(balance);
  $("#incomeValue").textContent = money(totals.income);
  $("#expenseValue").textContent = money(totals.expense);
  $("#savingsValue").textContent = `${savingsRate}%`;
  renderChart(monthItems);
  renderBudgets(monthItems);
  renderTransactions();
}

function renderChart(items) {
  const totalsByCategory = {};
  items.filter(t => t.type === "expense").forEach(t => {
    totalsByCategory[t.category] = (totalsByCategory[t.category] || 0) + Number(t.amount);
  });
  const labels = Object.keys(totalsByCategory);
  const values = labels.map(label => totalsByCategory[label]);
  $("#chartEmpty").classList.toggle("hidden", labels.length > 0);
  const canvas = $("#spendingChart");
  if (spendingChart) spendingChart.destroy();
  spendingChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: labels.length ? labels : ["No expenses yet"],
      datasets: [{
        data: values.length ? values : [1],
        backgroundColor: labels.length ? labels.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]) : ["#eff0f6"],
        borderWidth: 0,
        hoverOffset: 5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "70%",
      plugins: {
        legend: { position: "right", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 7, boxHeight: 7, padding: 16, color: "#858aa3", font: { family: "DM Sans", size: 11 } } },
        tooltip: { callbacks: { label: (context) => `${context.label}: ${money(labels.length ? context.raw : 0)}` } }
      }
    }
  });
}

function renderBudgets(items) {
  const expenseByCategory = {};
  items.filter(t => t.type === "expense").forEach(t => {
    expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + Number(t.amount);
  });
  const categories = Object.keys(budgets).filter(category => Number(budgets[category]) > 0);
  const container = $("#budgetList");
  if (!categories.length) {
    container.innerHTML = '<div class="empty-state"><strong>No budgets set</strong><p>Choose Manage to create a monthly budget.</p></div>';
    return;
  }
  container.innerHTML = categories.map((category, index) => {
    const spent = expenseByCategory[category] || 0;
    const limit = Number(budgets[category]) || 0;
    const percent = limit > 0 ? Math.round(spent / limit * 100) : 0;
    const fillClass = percent >= 100 ? "over" : percent >= 80 ? "warning" : "";
    return `<div class="budget-item">
      <div class="budget-title"><span class="budget-category"><span class="category-dot">${getCategoryIcon(category)}</span>${escapeHTML(category)}</span><span class="budget-amount">${money(spent)} / ${money(limit)}</span></div>
      <div class="progress-track"><div class="progress-fill ${fillClass}" style="width:${Math.min(percent, 100)}%;background:${fillClass ? "" : CATEGORY_COLORS[index % CATEGORY_COLORS.length]}"></div></div>
      <div class="budget-caption"><span>${percent >= 100 ? "Budget exceeded" : percent >= 80 ? "Almost at limit" : "Remaining: " + money(Math.max(limit - spent, 0))}</span><span>${percent}%</span></div>
    </div>`;
  }).join("");
}

function renderTransactions() {
  const search = $("#searchInput").value.trim().toLowerCase();
  const type = $("#typeFilter").value;
  const filtered = monthTransactions().filter(t => {
    const matchesType = type === "all" || t.type === type;
    const matchesSearch = `${t.description} ${t.category} ${t.note || ""}`.toLowerCase().includes(search);
    return matchesType && matchesSearch;
  }).sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  $("#transactionRows").innerHTML = filtered.map(t => {
    const isIncome = t.type === "income";
    return `<tr>
      <td><div class="transaction-name"><span class="transaction-icon">${getCategoryIcon(t.category, t.type)}</span><span><strong>${escapeHTML(t.description)}</strong><small>${escapeHTML(t.note || (isIncome ? "Money received" : "Expense recorded"))}</small></span></div></td>
      <td>${escapeHTML(t.category)}</td><td>${formatDate(t.date)}</td>
      <td class="amount-cell ${isIncome ? "income" : ""}">${isIncome ? "+" : "−"}${money(t.amount)}</td>
      <td><span class="type-badge ${isIncome ? "income" : ""}">${isIncome ? "Income" : "Expense"}</span></td>
      <td><div class="row-actions"><button class="icon-button" data-action="edit" data-id="${escapeHTML(t.id)}" aria-label="Edit transaction">✎</button><button class="icon-button" data-action="delete" data-id="${escapeHTML(t.id)}" aria-label="Delete transaction">×</button></div></td>
    </tr>`;
  }).join("");
  $("#emptyState").classList.toggle("hidden", filtered.length > 0);
}
function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return Number.isNaN(date.getTime()) ? escapeHTML(dateString) : date.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

function populateCategories(selected = "Food") {
  const type = document.querySelector('input[name="transactionType"]:checked').value;
  $("#category").innerHTML = CATEGORIES[type].map(c => `<option value="${escapeHTML(c.name)}">${c.icon} ${escapeHTML(c.name)}</option>`).join("");
  if (CATEGORIES[type].some(c => c.name === selected)) $("#category").value = selected;
}
function openTransactionModal(transaction = null) {
  editingId = transaction?.id || null;
  $("#transactionForm").reset();
  $("#formError").classList.add("hidden");
  $("#modalTitle").textContent = transaction ? "Edit transaction" : "Add transaction";
  const typeInput = document.querySelector(`input[name="transactionType"][value="${transaction?.type || "expense"}"]`);
  typeInput.checked = true;
  populateCategories(transaction?.category || (transaction?.type === "income" ? "Salary" : "Food"));
  $("#transactionId").value = transaction?.id || "";
  $("#description").value = transaction?.description || "";
  $("#amount").value = transaction?.amount || "";
  $("#transactionDate").value = transaction?.date || localDateString();
  $("#note").value = transaction?.note || "";
  $("#transactionModal").classList.remove("hidden");
  $("#description").focus();
}
function closeTransactionModal() { $("#transactionModal").classList.add("hidden"); }
function handleTransactionSubmit(event) {
  event.preventDefault();
  const type = document.querySelector('input[name="transactionType"]:checked').value;
  const description = $("#description").value.trim();
  const amount = Number($("#amount").value);
  const date = $("#transactionDate").value;
  if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
    $("#formError").textContent = "Please enter a description, a positive amount, and a date.";
    $("#formError").classList.remove("hidden");
    return;
  }
  const existing = transactions.find(t => t.id === editingId);
  const transaction = {
    id: editingId || makeId(), type, description, amount,
    category: $("#category").value, date, note: $("#note").value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString()
  };
  if (editingId) transactions = transactions.map(t => t.id === editingId ? transaction : t);
  else transactions.push(transaction);
  saveData();
  closeTransactionModal();
  renderDashboard();
  showToast(editingId ? "Transaction updated successfully." : "Transaction added successfully.");
}
function deleteTransaction(id) {
  const transaction = transactions.find(t => t.id === id);
  if (!transaction) return;
  if (!confirm(`Delete "${transaction.description}"? This cannot be undone.`)) return;
  transactions = transactions.filter(t => t.id !== id);
  saveData();
  renderDashboard();
  showToast("Transaction deleted.");
}

function openBudgetModal() {
  const allCategories = [...new Set([...CATEGORIES.expense.map(c => c.name), ...Object.keys(budgets)])].filter(c => c !== "Other");
  $("#budgetInputs").innerHTML = allCategories.map(category => `<label>${getCategoryIcon(category)} ${escapeHTML(category)}<input type="number" min="0" step="100" data-budget-category="${escapeHTML(category)}" value="${Number(budgets[category]) || 0}" /></label>`).join("");
  $("#budgetModal").classList.remove("hidden");
}
function closeBudgetModal() { $("#budgetModal").classList.add("hidden"); }
function handleBudgetSubmit(event) {
  event.preventDefault();
  const updated = {};
  $("#budgetInputs").querySelectorAll("[data-budget-category]").forEach(input => {
    const value = Number(input.value);
    if (Number.isFinite(value) && value > 0) updated[input.dataset.budgetCategory] = value;
  });
  budgets = updated;
  saveData();
  closeBudgetModal();
  renderDashboard();
  showToast("Monthly budgets saved.");
}

function exportCSV() {
  const items = monthTransactions().slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) { showToast("No transactions for this month to export."); return; }
  const headers = ["Date", "Description", "Type", "Category", "Amount (PKR)", "Note"];
  const rows = items.map(t => [t.date, t.description, t.type, t.category, t.amount, t.note || ""]);
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `spendsmart-transactions-${currentMonth()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("CSV export downloaded.");
}

function setInitialDate() {
  const now = new Date();
  $("#monthFilter").value = localDateString(now).slice(0, 7);
  $("#todayLabel").textContent = now.toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase();
}

$("#addTopButton").addEventListener("click", () => openTransactionModal());
$("#addTransactionButton").addEventListener("click", () => openTransactionModal());
$("#closeModal").addEventListener("click", closeTransactionModal);
$("#cancelModal").addEventListener("click", closeTransactionModal);
$("#transactionModal").addEventListener("click", e => { if (e.target === $("#transactionModal")) closeTransactionModal(); });
$("#transactionForm").addEventListener("submit", handleTransactionSubmit);
document.querySelectorAll('input[name="transactionType"]').forEach(input => input.addEventListener("change", () => populateCategories()));
$("#transactionRows").addEventListener("click", e => {
  const button = e.target.closest("button[data-action]");
  if (!button) return;
  const transaction = transactions.find(t => t.id === button.dataset.id);
  if (!transaction) return;
  if (button.dataset.action === "edit") openTransactionModal(transaction);
  if (button.dataset.action === "delete") deleteTransaction(transaction.id);
});
$("#monthFilter").addEventListener("change", renderDashboard);
$("#searchInput").addEventListener("input", renderTransactions);
$("#typeFilter").addEventListener("change", renderTransactions);
$("#exportButton").addEventListener("click", exportCSV);
$("#manageBudgetsButton").addEventListener("click", openBudgetModal);
$("#closeBudgetModal").addEventListener("click", closeBudgetModal);
$("#cancelBudgetModal").addEventListener("click", closeBudgetModal);
$("#budgetModal").addEventListener("click", e => { if (e.target === $("#budgetModal")) closeBudgetModal(); });
$("#budgetForm").addEventListener("submit", handleBudgetSubmit);
$("#menuButton").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-link").forEach(link => link.addEventListener("click", () => $("#sidebar").classList.remove("open")));
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeTransactionModal();
    closeBudgetModal();
    $("#sidebar").classList.remove("open");
  }
});

setInitialDate();
renderDashboard();
