import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { getApiBaseUrl, storePlatformSession } from '../utils/platformSession';

const NOT_CONFIGURED = 'The shop password is not configured on the server.';
const WRONG_PASSWORD = 'Incorrect shop password.';
const LOCKOUT = 'Too many authentication attempts. Try again in 15 minutes.';
const WALLPAPER_JPEG = `${process.env.PUBLIC_URL || ''}/login-wallpaper.jpg`;
const WALLPAPER_WEBP = `${process.env.PUBLIC_URL || ''}/login-wallpaper.webp`;

function messageFor(status, data) {
  if (status === 429) return data.error || LOCKOUT;
  if (status === 503 || data.error === 'platform_password_not_configured') return NOT_CONFIGURED;
  return WRONG_PASSWORD;
}

const PlatformLogin = ({ onUnlocked, checking = false, notice = '', onRetry }) => {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState(notice || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (notice) setMessage(notice);
  }, [notice]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/platform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 429 || response.status === 503 || !response.ok || !data.ok || !data.token) {
        setMessage(messageFor(response.status, data));
        return;
      }
      storePlatformSession({ token: data.token, expiresAt: data.expiresAt });
      setPassword('');
      if (onUnlocked) onUnlocked();
    } catch (error) {
      setMessage('Could not reach the tool room. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex items-center justify-center px-4 py-8 bg-black">
      <style>{`
        .platform-wallpaper,
        .platform-wallpaper-fill {
          background-image: url('${WALLPAPER_JPEG}');
          background-position: center;
          background-repeat: no-repeat;
        }
        .platform-wallpaper {
          background-size: contain;
        }
        .platform-wallpaper-fill {
          background-size: cover;
          filter: blur(24px) brightness(0.45);
          transform: scale(1.1);
        }
        @supports (background-image: image-set(url('${WALLPAPER_WEBP}') type('image/webp'))) {
          .platform-wallpaper,
          .platform-wallpaper-fill {
            background-image: image-set(
              url('${WALLPAPER_WEBP}') type('image/webp'),
              url('${WALLPAPER_JPEG}') type('image/jpeg')
            );
          }
        }
        /* A 3:2 scene on a tall phone is a thin strip with contain, so cover and keep the logo. */
        @media (max-aspect-ratio: 3/4) {
          .platform-wallpaper {
            background-size: cover;
            background-position: center top;
          }
        }
      `}</style>
      <div className="platform-wallpaper-fill absolute inset-0" aria-hidden="true" />
      <div
        className="platform-wallpaper absolute inset-0"
        data-testid="platform-wallpaper"
        data-wallpaper-jpeg={WALLPAPER_JPEG}
        data-wallpaper-webp={WALLPAPER_WEBP}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.38) 70%, rgba(0,0,0,0.45) 100%)',
        }}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-red-600/80 bg-[rgba(10,10,12,0.92)] shadow-2xl backdrop-blur-sm px-5 py-6 sm:px-8 sm:py-8">
        <div className="h-1.5 w-16 rounded bg-red-600 mb-5" />
        <h1 className="text-3xl font-bold text-white tracking-tight">WKI Tool Room</h1>
        <p className="mt-1 text-base text-gray-200">Enter the shop password</p>
        {checking ? (
          <p className="mt-6 text-gray-200" role="status">Checking shop access…</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6">
            <label htmlFor="platform-password" className="block text-sm font-medium text-gray-200 mb-2">
              Shop password
            </label>
            <div className="relative">
              <input
                id="platform-password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full min-h-[56px] rounded-lg border border-white/20 bg-black/50 px-4 pr-24 text-lg text-white outline-none focus:border-red-500 focus:ring-2 focus:ring-red-600"
              />
              <button
                type="button"
                onClick={() => setVisible((current) => !current)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] px-2 text-sm font-semibold text-red-200"
              >
                {visible ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
            {message ? (
              <p role="alert" className="mt-3 text-sm text-red-200">{message}</p>
            ) : null}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 w-full min-h-[56px] rounded-lg border border-red-500 text-base font-bold text-white"
              >
                Retry
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-red-700 text-lg font-bold text-white hover:bg-red-800 disabled:opacity-60"
              style={{ height: 56 }}
            >
              Unlock
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default PlatformLogin;
