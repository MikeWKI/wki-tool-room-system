import { clearManageSession } from './manageSession';

const STORAGE_KEY = 'wki-platform-session';

export const PLATFORM_LOCK_EVENT = 'wki-platform-lock';
export const PLATFORM_TOKEN_HEADER = 'X-Platform-Token';

export function getApiBaseUrl() {
  return process.env.REACT_APP_API_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://wki-tool-room-system-1.onrender.com/api'
      : 'http://localhost:3001/api');
}

export function isPlatformAuthError(error) {
  return typeof error === 'string' && error.startsWith('platform_');
}

export function readPlatformSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token) return null;
    if (parsed.expiresAt && Date.now() > Number(parsed.expiresAt)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

export function storePlatformSession(session) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: session.token,
      expiresAt: session.expiresAt || null,
    })
  );
}

export function clearPlatformToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Private mode can throw. The login screen still replaces the app.
  }
}

export function platformAuthHeader() {
  const session = readPlatformSession();
  if (!session?.token) return {};
  return { [PLATFORM_TOKEN_HEADER]: session.token };
}

export function shouldLockPlatform(status, error) {
  if (status === 401 && isPlatformAuthError(error)) return true;
  if (status === 503 && error === 'platform_password_not_configured') return true;
  return false;
}

/** Drop the shop-floor session and the manage session behind it. */
export function lockPlatform(detail = {}) {
  clearPlatformToken();
  clearManageSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PLATFORM_LOCK_EVENT, { detail }));
  }
}
