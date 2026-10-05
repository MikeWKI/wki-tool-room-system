const STORAGE_KEY = 'wki-manage-session';

export function readManageSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token) return null;
    if (parsed.expiresAt && Date.now() > Number(parsed.expiresAt)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

export function storeManageSession(session) {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: session.token,
      expiresAt: session.expiresAt || null,
    })
  );
}

export function clearManageSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Private mode can throw. The in-memory unlock flag is cleared by the caller.
  }
}

export function manageAuthHeader() {
  const session = readManageSession();
  if (!session?.token) return {};
  return { Authorization: `Bearer ${session.token}` };
}
