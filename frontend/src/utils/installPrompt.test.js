import {
  INSTALL_DISMISS_KEY,
  LEGACY_INSTALL_DISMISS_KEY,
  isInstallPromptDismissed,
  rememberInstallPromptDismissal,
  shouldShowInstallBanner,
} from './installPrompt';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

test('install banner shows once until it is dismissed', () => {
  expect(shouldShowInstallBanner({ isInstalled: false, dismissed: false, prompted: true })).toBe(true);
  expect(shouldShowInstallBanner({ isInstalled: false, dismissed: false, prompted: false })).toBe(false);
  expect(shouldShowInstallBanner({ isInstalled: true, dismissed: false, prompted: true })).toBe(false);
  expect(shouldShowInstallBanner({ isInstalled: false, dismissed: true, prompted: true })).toBe(false);
});

test('dismissal is remembered in localStorage, including the older key', () => {
  const storage = memoryStorage();
  expect(isInstallPromptDismissed(storage)).toBe(false);
  rememberInstallPromptDismissal(storage);
  expect(storage.getItem(INSTALL_DISMISS_KEY)).toBe('1');
  expect(storage.getItem(LEGACY_INSTALL_DISMISS_KEY)).toBe('true');
  expect(isInstallPromptDismissed(storage)).toBe(true);
  expect(isInstallPromptDismissed(memoryStorage({ [LEGACY_INSTALL_DISMISS_KEY]: 'true' }))).toBe(true);
});
