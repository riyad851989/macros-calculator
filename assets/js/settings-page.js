const SETTINGS = window.SubscriptionPricingSettings;
let effectiveSettings = null;
let programsState = [];
let curveState = [];

document.addEventListener('DOMContentLoaded', async () => {
  const status = document.getElementById('statusMessage');
  try {
    effectiveSettings = await SETTINGS.loadEffectiveSettings();
    const userOverrides = SETTINGS.loadUserSettings() || {};

    programsState = clonePrograms(effectiveSettings.programs);
    renderProgramsTable();
    curveState = cloneCurve(effectiveSettings.pricingCurve);
    renderPricingCurveTable();
    document.getElementById('bestValueThreshold').value =
      (userOverrides.ui && userOverrides.ui.bestValueThreshold) ||
      effectiveSettings.ui.bestValueThreshold;

    document.getElementById('saveSettingsBtn').addEventListener('click', onSave);
    document.getElementById('resetSettingsBtn').addEventListener('click', onReset);
    document.getElementById('downloadCsvTemplateLink').addEventListener('click', (e) => {
      e.preventDefault();
      downloadCsvTemplate();
    });
    document.getElementById('importCsvBtn').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('importCsvInput').click();
    });
    document.getElementById('importCsvInput').addEventListener('change', onImportCsv);
    document.getElementById('addCurveRowBtn').addEventListener('click', () => {
      syncCurveStateFromInputs();
      curveState.push({ minDays: '', maxDays: '', factor: 1 });
      renderPricingCurveTable();
    });
    const curveTableBody = document.querySelector('#curve-table tbody');
    curveTableBody.addEventListener('click', handleCurveActions);
    status.textContent = '';
  } catch (err) {
    console.error('Failed to load settings', err);
    status.textContent = 'Failed to load settings.';
  }
});

function renderProgramsTable() {
  const tbody = document.querySelector('#programs-table tbody');
  tbody.innerHTML = '';

  programsState.forEach((p, index) => {
    const mealsVal = isValidNumber(p.meals) ? p.meals : '';
    const price20Val = isValidNumber(p.prices['20']) ? p.prices['20'] : '';
    const price24Val = isValidNumber(p.prices['24']) ? p.prices['24'] : '';
    const price30Val = isValidNumber(p.prices['30']) ? p.prices['30'] : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-field="program" data-index="${index}" value="${p.program}" /></td>
      <td><input data-field="meals" data-index="${index}" type="number" value="${mealsVal}" /></td>
      <td><input data-field="price20" data-index="${index}" type="number" value="${price20Val}" /></td>
      <td><input data-field="price24" data-index="${index}" type="number" value="${price24Val}" /></td>
      <td><input data-field="price30" data-index="${index}" type="number" value="${price30Val}" /></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPricingCurveTable() {
  const tbody = document.querySelector('#curve-table tbody');
  tbody.innerHTML = '';

  curveState.forEach((r, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-curve-field="minDays" data-index="${index}" type="number" value="${r.minDays}" /></td>
      <td><input data-curve-field="maxDays" data-index="${index}" type="number" value="${r.maxDays}" /></td>
      <td><input data-curve-field="factor" data-index="${index}" type="number" step="0.01" value="${r.factor}" /></td>
      <td>
        <div class="curve-actions">
          <button class="icon-btn" data-action="up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-action="down" data-index="${index}" ${index === curveState.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" data-action="delete" data-index="${index}">✕</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function onSave() {
  const status = document.getElementById('statusMessage');
  status.textContent = '';
  syncProgramsStateFromInputs();
  syncCurveStateFromInputs();

  const overrides = {};
  const programOverrides = [];

  programsState.forEach((row) => {
    const program = String(row.program || '').trim();
    const meals = row.meals;
    const price20 = row.prices['20'];
    const price24 = row.prices['24'];
    const price30 = row.prices['30'];

    if (!program || !isValidNumber(meals)) return;

    const original = effectiveSettings.programs.find(
      (p) => p.program === program && p.meals === meals
    );
    const progOverride = {
      program,
      meals,
      prices: {}
    };

    if (isValidNumber(price20) && (!original || price20 !== original.prices['20'])) progOverride.prices['20'] = price20;
    if (isValidNumber(price24) && (!original || price24 !== original.prices['24'])) progOverride.prices['24'] = price24;
    if (isValidNumber(price30) && (!original || price30 !== original.prices['30'])) progOverride.prices['30'] = price30;

    const hasAnyPrice = isValidNumber(price20) || isValidNumber(price24) || isValidNumber(price30);
    if (
      Object.keys(progOverride.prices).length > 0 ||
      (!original && hasAnyPrice)
    ) {
      programOverrides.push(progOverride);
    }
  });

  if (programOverrides.length > 0) overrides.programs = programOverrides;

  const curveRows = document.querySelectorAll('#curve-table tbody tr');
  const newCurve = [];
  curveRows.forEach((row) => {
    const minDays = Number(row.querySelector('input[data-curve-field="minDays"]').value);
    const maxDays = Number(row.querySelector('input[data-curve-field="maxDays"]').value);
    const factor = Number(row.querySelector('input[data-curve-field="factor"]').value);
    if (Number.isNaN(minDays) || Number.isNaN(maxDays) || Number.isNaN(factor)) return;
    newCurve.push({ minDays, maxDays, factor });
  });

  if (JSON.stringify(newCurve) !== JSON.stringify(effectiveSettings.pricingCurve)) {
    overrides.pricingCurve = newCurve;
  }

  const bestValueThreshold = Number(document.getElementById('bestValueThreshold').value);
  if (!Number.isNaN(bestValueThreshold) && bestValueThreshold !== effectiveSettings.ui.bestValueThreshold) {
    overrides.ui = { bestValueThreshold };
  }

  const nothingToSave =
    (!overrides.programs || overrides.programs.length === 0) &&
    (!overrides.pricingCurve || overrides.pricingCurve.length === 0) &&
    (!overrides.ui || Object.keys(overrides.ui).length === 0);

  if (nothingToSave) {
    status.textContent = 'No changes to save.';
    return;
  }

  SETTINGS.saveUserSettings(overrides);
  status.textContent = 'Settings saved. Calculator will use new values.';
}

function onReset() {
  SETTINGS.resetUserSettings();
  document.getElementById('statusMessage').textContent =
    'User settings cleared. App will fall back to default settings.';
}

function handleCurveActions(event) {
  const actionBtn = event.target.closest('button[data-action]');
  if (!actionBtn) return;
  const action = actionBtn.getAttribute('data-action');
  const index = Number(actionBtn.getAttribute('data-index'));
  if (Number.isNaN(index)) return;

  syncCurveStateFromInputs();

  if (action === 'up' && index > 0) {
    [curveState[index - 1], curveState[index]] = [curveState[index], curveState[index - 1]];
  } else if (action === 'down' && index < curveState.length - 1) {
    [curveState[index + 1], curveState[index]] = [curveState[index], curveState[index + 1]];
  } else if (action === 'delete') {
    curveState.splice(index, 1);
  }

  renderPricingCurveTable();
}

function syncCurveStateFromInputs() {
  const rows = document.querySelectorAll('#curve-table tbody tr');
  curveState = Array.from(rows).map((row) => {
    const minDays = Number(row.querySelector('input[data-curve-field="minDays"]').value);
    const maxDays = Number(row.querySelector('input[data-curve-field="maxDays"]').value);
    const factor = Number(row.querySelector('input[data-curve-field="factor"]').value);
    return {
      minDays: Number.isNaN(minDays) ? '' : minDays,
      maxDays: Number.isNaN(maxDays) ? '' : maxDays,
      factor: Number.isNaN(factor) ? '' : factor
    };
  });
}

function cloneCurve(curve) {
  return curve.map((r) => ({ ...r }));
}

function syncProgramsStateFromInputs() {
  const rows = document.querySelectorAll('#programs-table tbody tr');
  programsState = Array.from(rows).map((row) => {
    const program = row.querySelector('input[data-field="program"]').value.trim();
    const meals = parseNumberOrNull(row.querySelector('input[data-field="meals"]').value);
    const price20 = parseNumberOrNull(row.querySelector('input[data-field="price20"]').value);
    const price24 = parseNumberOrNull(row.querySelector('input[data-field="price24"]').value);
    const price30 = parseNumberOrNull(row.querySelector('input[data-field="price30"]').value);
    return {
      program,
      meals,
      prices: {
        '20': price20,
        '24': price24,
        '30': price30
      }
    };
  });
}

function clonePrograms(programs) {
  return programs.map((p) => ({
    program: p.program,
    meals: p.meals,
    prices: { ...p.prices }
  }));
}

function downloadCsvTemplate() {
  syncProgramsStateFromInputs();
  const header = ['program', 'meals', 'price20', 'price24', 'price30'];
  const rows = programsState.map((p) => [
    p.program,
    p.meals,
    isValidNumber(p.prices['20']) ? p.prices['20'] : '',
    isValidNumber(p.prices['24']) ? p.prices['24'] : '',
    isValidNumber(p.prices['30']) ? p.prices['30'] : ''
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((v) => (v === undefined ? '' : v)).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'subscription-pricing-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function onImportCsv(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseProgramsCsv(reader.result);
      if (parsed.length === 0) {
        document.getElementById('statusMessage').textContent = 'No valid rows found in CSV.';
        return;
      }
      programsState = parsed;
      renderProgramsTable();
      document.getElementById('statusMessage').textContent = 'CSV imported. Review and save to apply.';
    } catch (err) {
      console.error('CSV import failed', err);
      document.getElementById('statusMessage').textContent = 'Failed to import CSV.';
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function parseProgramsCsv(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows = [];
  lines.forEach((line, idx) => {
    const cols = line.split(',').map((c) => c.trim());
    if (cols.length < 5) return;
    if (idx === 0 && cols[0].toLowerCase().includes('program')) return;

    const [program, mealsStr, price20Str, price24Str, price30Str] = cols;
    const meals = Number(mealsStr);
    const price20 = parseNumberOrNull(price20Str);
    const price24 = parseNumberOrNull(price24Str);
    const price30 = parseNumberOrNull(price30Str);
    if (!program || Number.isNaN(meals)) return;

    rows.push({
      program,
      meals,
      prices: {
        '20': price20,
        '24': price24,
        '30': price30
      }
    });
  });
  return rows;
}

function parseNumberOrNull(val) {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? null : num;
}

function isValidNumber(val) {
  return typeof val === 'number' && !Number.isNaN(val);
}
