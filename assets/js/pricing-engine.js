const SETTINGS = window.SubscriptionPricingSettings;

let effectiveSettings = null;
let selectedProgram = '';
let selectedMeals = 0;
let selectedDays = 20;

const programSelect = document.getElementById('programSelect');
const mealsSelect = document.getElementById('mealsSelect');
const daysRange = document.getElementById('daysRange');
const daysInput = document.getElementById('daysInput');
const daysHelper = document.getElementById('daysHelper');
const totalPriceEl = document.getElementById('totalPrice');
const perDayEl = document.getElementById('perDay');
const perMealEl = document.getElementById('perMeal');
const factorEl = document.getElementById('factor');
const msg20 = document.getElementById('msg20');
const msg24 = document.getElementById('msg24');
const msg30 = document.getElementById('msg30');
const bestBadge = document.getElementById('bestBadge');

document.addEventListener('DOMContentLoaded', async () => {
  try {
    effectiveSettings = await SETTINGS.loadEffectiveSettings();
    applyUiSettings();
    initSelectors();
    attachEvents();
    renderTable();
    update();
  } catch (err) {
    console.error('Failed to initialize pricing engine', err);
    totalPriceEl.textContent = 'Error loading settings';
  }
});

function applyUiSettings() {
  const ui = effectiveSettings.ui || {};
  const labels = ui.labels || {};
  const colors = ui.colors || {};

  if (labels.bestValue) bestBadge.textContent = labels.bestValue;
  document.querySelectorAll('[data-label="perDay"]').forEach((el) => {
    el.textContent = labels.perDay || 'Per Day Price';
  });
  document.querySelectorAll('[data-label="perMeal"]').forEach((el) => {
    el.textContent = labels.perMeal || 'Per Meal Price';
  });
  document.querySelectorAll('[data-col="perDay"]').forEach((el) => {
    const day = el.getAttribute('data-day');
    const base = labels.perDay || 'Per Day Price';
    el.textContent = day ? `${base} (${day})` : base;
  });
  document.querySelectorAll('[data-col="perMeal"]').forEach((el) => {
    const day = el.getAttribute('data-day');
    const base = labels.perMeal || 'Per Meal Price';
    el.textContent = day ? `${base} (${day})` : base;
  });

  if (colors.best) document.documentElement.style.setProperty('--cell-best', colors.best);
  if (colors.medium) document.documentElement.style.setProperty('--cell-medium', colors.medium);
  if (colors.worst) document.documentElement.style.setProperty('--cell-worst', colors.worst);
}

function initSelectors() {
  const programs = Array.from(new Set(effectiveSettings.programs.map((p) => p.program)));
  programSelect.innerHTML = programs.map((p) => `<option value="${p}">${p}</option>`).join('');
  selectedProgram = programSelect.value || programs[0] || '';
  updateMealsOptions();
  daysRange.value = selectedDays;
  daysInput.value = selectedDays;
  daysHelper.textContent = `${selectedDays} days selected`;
}

function attachEvents() {
  programSelect.addEventListener('change', () => {
    selectedProgram = programSelect.value;
    updateMealsOptions();
    update();
  });
  mealsSelect.addEventListener('change', () => {
    selectedMeals = Number(mealsSelect.value);
    update();
  });
  daysRange.addEventListener('input', () => handleDayChange(Number(daysRange.value)));
  daysInput.addEventListener('change', () => handleDayChange(Number(daysInput.value)));
  daysInput.addEventListener('input', () => {
    const val = Number(daysInput.value);
    if (!Number.isNaN(val)) daysRange.value = clampDays(val);
  });
}

function updateMealsOptions() {
  const mealsOptions = Array.from(
    new Set(
      effectiveSettings.programs
        .filter((p) => p.program === selectedProgram)
        .map((p) => p.meals)
    )
  ).sort((a, b) => a - b);

  mealsSelect.innerHTML = mealsOptions.map((m) => `<option value="${m}">${m} meals</option>`).join('');
  if (!mealsOptions.includes(selectedMeals)) {
    selectedMeals = mealsOptions[0] || 0;
  }
  mealsSelect.value = String(selectedMeals);
}

function clampDays(days) {
  if (days < 3) return 3;
  if (days > 30) return 30;
  return Math.round(days);
}

function handleDayChange(val) {
  selectedDays = clampDays(val);
  daysRange.value = selectedDays;
  daysInput.value = selectedDays;
  update();
}

function getPlan() {
  return effectiveSettings.programs.find(
    (p) => p.program === selectedProgram && p.meals === selectedMeals
  );
}

function getAdjustmentFactor(days) {
  const rule = effectiveSettings.pricingCurve.find(
    (r) => days >= r.minDays && days <= r.maxDays
  );
  return rule ? Number(rule.factor) : 1;
}

function getBasePerDay(plan) {
  const price20 = plan.prices && plan.prices['20'];
  if (typeof price20 === 'number' && !Number.isNaN(price20)) return price20 / 20;
  return 0;
}

function getBasePrice(plan, days) {
  const priceKey = String(days);
  const direct = plan.prices && plan.prices[priceKey];
  if (typeof direct === 'number' && !Number.isNaN(direct)) return direct;

  const basePerDay = getBasePerDay(plan);
  return Math.round(basePerDay * days * getAdjustmentFactor(days));
}

function formatCurrency(val) {
  return `AED ${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatSmall(val) {
  return `AED ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function savingsText(label, diff) {
  const normalized = Number(diff.toFixed(2));
  const amount = Math.abs(normalized).toFixed(2);
  if (normalized > 0) return `You <span class="text-save">SAVE ${amount} AED</span> vs ${label} rate.`;
  if (normalized < 0) return `You pay <span class="text-more">${amount} AED MORE</span> than ${label} rate.`;
  return `<span class="text-even">Same cost as ${label} rate.</span>`;
}

function update() {
  const plan = getPlan();
  if (!plan) return;

  const basePerDay = getBasePerDay(plan);
  const factor = getAdjustmentFactor(selectedDays);
  const rawTotal = basePerDay * selectedDays * factor;
  const finalPrice = Math.round(rawTotal);

  const pricePerDay = finalPrice / selectedDays;
  const pricePerMeal = finalPrice / (selectedDays * selectedMeals);

  const price20 = getBasePrice(plan, 20);
  const price24 = getBasePrice(plan, 24);
  const price30 = getBasePrice(plan, 30);

  const diffVs20 = (price20 / 20 - pricePerDay) * selectedDays;
  const diffVs24 = (price24 / 24 - pricePerDay) * selectedDays;
  const diffVs30 = (price30 / 30 - pricePerDay) * selectedDays;

  totalPriceEl.textContent = formatCurrency(finalPrice);
  perDayEl.textContent = formatSmall(pricePerDay);
  perMealEl.textContent = formatSmall(pricePerMeal);
  factorEl.textContent = `${factor.toFixed(2)}×`;

  msg20.innerHTML = savingsText('20-day', diffVs20);
  msg24.innerHTML = savingsText('24-day', diffVs24);
  msg30.innerHTML = savingsText('30-day', diffVs30);

  const threshold = effectiveSettings.ui?.bestValueThreshold || 24;
  bestBadge.style.display = selectedDays >= threshold ? 'inline-flex' : 'none';
  daysHelper.textContent = `${selectedDays} day${selectedDays === 1 ? '' : 's'} selected`;
}

function getCellClass(value, minVal, maxVal) {
  if (value === minVal) return 'cell-best';
  if (value === maxVal) return 'cell-worst';
  return 'cell-medium';
}

function calcPlanForDays(plan, days) {
  const basePerDay = getBasePerDay(plan);
  const factor = getAdjustmentFactor(days);
  const total = Math.round(basePerDay * days * factor);
  const perDay = total / days;
  const perMeal = total / (days * plan.meals);
  return { total, perDay, perMeal };
}

function renderTable() {
  const tbody = document.querySelector('#planTable tbody');
  tbody.innerHTML = '';

  effectiveSettings.programs.forEach((plan) => {
    const p20 = calcPlanForDays(plan, 20);
    const p24 = calcPlanForDays(plan, 24);
    const p30 = calcPlanForDays(plan, 30);

    const values = [p20.perDay, p24.perDay, p30.perDay];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${plan.program}</td>
      <td>${plan.meals}</td>
      <td>${formatCurrency(p20.total)}</td>
      <td class="${getCellClass(p20.perDay, minVal, maxVal)}">${formatSmall(p20.perDay)}</td>
      <td>${formatSmall(p20.perMeal)}</td>
      <td>${formatCurrency(p24.total)}</td>
      <td class="${getCellClass(p24.perDay, minVal, maxVal)}">${formatSmall(p24.perDay)}</td>
      <td>${formatSmall(p24.perMeal)}</td>
      <td>${formatCurrency(p30.total)}</td>
      <td class="${getCellClass(p30.perDay, minVal, maxVal)}">${formatSmall(p30.perDay)}</td>
      <td>${formatSmall(p30.perMeal)}</td>
    `;
    tbody.appendChild(tr);
  });
}
