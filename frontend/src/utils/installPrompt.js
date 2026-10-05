export const INSTALL_DISMISS_KEY = 'wki-install-prompt-dismissed';
export const LEGACY_INSTALL_DISMISS_KEY = 'pwa-notification-shown';

export function isInstallPromptDismissed(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return false;
  try {
    return store.getItem(INSTALL_DISMISS_KEY) === '1'
      || store.getItem(LEGACY_INSTALL_DISMISS_KEY) === 'true';
  } catch (error) {
    return false;
  }
}

export function rememberInstallPromptDismissal(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  store.setItem(INSTALL_DISMISS_KEY, '1');
  store.setItem(LEGACY_INSTALL_DISMISS_KEY, 'true');
}

/** At most one install banner, and never after dismiss or once the app is installed. */
export function shouldShowInstallBanner({ isInstalled, dismissed, prompted }) {
  return !isInstalled && !dismissed && Boolean(prompted);
}
