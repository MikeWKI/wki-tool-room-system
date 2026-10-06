import React, { useEffect, useState } from 'react';
import PlatformLogin from './PlatformLogin';
import {
  PLATFORM_LOCK_EVENT,
  getApiBaseUrl,
  platformAuthHeader,
  readPlatformSession,
  shouldLockPlatform,
  clearPlatformToken,
} from '../utils/platformSession';

const PlatformGate = ({ children }) => {
  const [status, setStatus] = useState(() => (readPlatformSession() ? 'checking' : 'locked'));
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const onLock = (event) => {
      const reason = event.detail?.reason;
      setNotice(reason === 'platform_password_not_configured'
        ? 'The shop password is not configured on the server.'
        : '');
      setStatus('locked');
    };
    window.addEventListener(PLATFORM_LOCK_EVENT, onLock);
    return () => window.removeEventListener(PLATFORM_LOCK_EVENT, onLock);
  }, []);

  useEffect(() => {
    if (status !== 'checking') return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch(`${getApiBaseUrl()}/auth/platform/check`, {
      headers: platformAuthHeader(),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok) {
          setStatus('unlocked');
          return;
        }
        if (shouldLockPlatform(response.status, data.error)) {
          clearPlatformToken();
          setNotice(data.error === 'platform_password_not_configured'
            ? 'The shop password is not configured on the server.'
            : '');
          setStatus('locked');
          return;
        }
        setStatus('unlocked');
      })
      .catch(() => {
        if (!cancelled) setStatus('unlocked');
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [status]);

  if (status === 'unlocked') return children;
  return (
    <PlatformLogin
      checking={status === 'checking'}
      notice={notice}
      onUnlocked={() => {
        setNotice('');
        setStatus('unlocked');
      }}
    />
  );
};

export default PlatformGate;
