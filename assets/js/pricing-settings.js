// Shared loader/saver for subscription pricing settings.
const LOCAL_KEY = 'subscriptionPricingSettings';
const DEFAULT_SETTINGS_URL = 'assets/settings/default-pricing.json';

// Load default settings from the JSON file in the repo.
async function loadDefaultSettings() {
  const res = await fetch(DEFAULT_SETTINGS_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Failed to load default settings');
  return res.json();
}

// Load overrides from localStorage (if any).
function loadUserSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Invalid localStorage settings, ignoring', err);
    return null;
  }
}

// Save overrides to localStorage.
function saveUserSettings(overrides) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(overrides));
}

// Clear overrides.
function resetUserSettings() {
  localStorage.removeItem(LOCAL_KEY);
}

// Merge default settings with user overrides.
function mergeSettings(defaults, overrides) {
  if (!overrides) return defaults;

  const merged = typeof structuredClone === 'function'
    ? structuredClone(defaults)
    : JSON.parse(JSON.stringify(defaults));

  // Programs: override matching program+meals entries, allow additions.
  if (Array.isArray(overrides.programs)) {
    overrides.programs.forEach((ovr) => {
      const idx = merged.programs.findIndex(
        (p) => p.program === ovr.program && p.meals === ovr.meals
      );
      if (idx >= 0) {
        merged.programs[idx] = {
          ...merged.programs[idx],
          ...ovr,
          prices: {
            ...merged.programs[idx].prices,
            ...(ovr.prices || {})
          }
        };
      } else {
        merged.programs.push(ovr);
      }
    });
  }

  // Pricing curve: if overrides provided, replace entirely.
  if (Array.isArray(overrides.pricingCurve) && overrides.pricingCurve.length > 0) {
    merged.pricingCurve = overrides.pricingCurve;
  }

  // UI settings: shallow merge labels/colors/etc.
  if (overrides.ui) {
    merged.ui = {
      ...merged.ui,
      ...overrides.ui,
      labels: {
        ...merged.ui.labels,
        ...(overrides.ui.labels || {})
      },
      colors: {
        ...merged.ui.colors,
        ...(overrides.ui.colors || {})
      }
    };
  }

  return merged;
}

// Public: load merged settings.
async function loadEffectiveSettings() {
  const defaults = await loadDefaultSettings();
  const user = loadUserSettings();
  return mergeSettings(defaults, user);
}

window.SubscriptionPricingSettings = {
  loadEffectiveSettings,
  saveUserSettings,
  resetUserSettings,
  loadUserSettings,
  mergeSettings,
  loadDefaultSettings
};
