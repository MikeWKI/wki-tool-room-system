import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PlatformLogin from './PlatformLogin';
import PlatformGate from './PlatformGate';
import { lockPlatform } from '../utils/platformSession';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

test('login screen blocks the app until the shop password is accepted', () => {
  render(
    <PlatformGate>
      <div>Parts Inventory</div>
    </PlatformGate>
  );

  expect(screen.getByRole('heading', { name: 'WKI Tool Room' })).toBeInTheDocument();
  expect(screen.getByText('Enter the shop password')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Unlock' })).toHaveStyle({ height: '56px' });
  expect(screen.getByLabelText('Shop password')).toHaveFocus();
  const wallpaper = screen.getByTestId('platform-wallpaper');
  expect(wallpaper).toHaveClass('platform-wallpaper');
  expect(wallpaper).toHaveAttribute('data-wallpaper-jpeg', '/login-wallpaper.jpg');
  expect(wallpaper).toHaveAttribute('data-wallpaper-webp', '/login-wallpaper.webp');
  expect(document.head.innerHTML + document.body.innerHTML).toContain('background-position: center');
  expect(screen.queryByText('Parts Inventory')).not.toBeInTheDocument();
  expect(screen.queryByText('App Initializing')).not.toBeInTheDocument();
});

test('password can be shown, Enter submits, and errors cover wrong, lockout, and unset', async () => {
  const onUnlocked = jest.fn();
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ ok: false, error: 'incorrect_password' }),
  });

  render(<PlatformLogin onUnlocked={onUnlocked} />);
  const input = screen.getByLabelText('Shop password');
  expect(input).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(input).toHaveAttribute('type', 'password');

  fireEvent.change(input, { target: { value: 'nope' } });
  fireEvent.submit(input.closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect shop password.');
  expect(onUnlocked).not.toHaveBeenCalled();
  expect(JSON.stringify(localStorage)).not.toMatch(/nope/);

  global.fetch.mockResolvedValueOnce({
    ok: false,
    status: 429,
    json: async () => ({ ok: false, error: 'Too many authentication attempts. Try again in 15 minutes.' }),
  });
  fireEvent.submit(input.closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many authentication attempts');

  global.fetch.mockResolvedValueOnce({
    ok: false,
    status: 503,
    json: async () => ({ ok: false, error: 'platform_password_not_configured' }),
  });
  fireEvent.submit(input.closest('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent('not configured');
});

test('a valid platform token unlocks the app and Lock returns to the login screen', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      token: 'platform-token-for-test',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
    }),
  });

  render(
    <PlatformGate>
      <div>Parts Inventory</div>
    </PlatformGate>
  );

  fireEvent.change(screen.getByLabelText('Shop password'), { target: { value: 'typed-secret' } });
  fireEvent.submit(screen.getByLabelText('Shop password').closest('form'));

  expect(await screen.findByText('Parts Inventory')).toBeInTheDocument();
  const stored = JSON.parse(localStorage.getItem('wki-platform-session'));
  expect(stored.token).toBe('platform-token-for-test');
  expect(stored.password).toBeUndefined();
  expect(JSON.stringify(localStorage)).not.toMatch(/typed-secret/);

  await act(async () => {
    lockPlatform();
  });
  await waitFor(() => {
    expect(screen.getByText('Enter the shop password')).toBeInTheDocument();
  });
  expect(screen.queryByText('Parts Inventory')).not.toBeInTheDocument();
  expect(localStorage.getItem('wki-platform-session')).toBeNull();
});

test('a stored token stays locked when the server cannot be reached', async () => {
  localStorage.setItem('wki-platform-session', JSON.stringify({
    token: 'stored-token',
    expiresAt: Date.now() + 60_000,
  }));
  global.fetch.mockRejectedValue(new Error('network down'));

  render(
    <PlatformGate>
      <div>Parts Inventory</div>
    </PlatformGate>
  );

  expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server, retry");
  expect(screen.queryByText('Parts Inventory')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

  global.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, purpose: 'platform' }),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Parts Inventory')).toBeInTheDocument();
});

test('Lock clears the platform token and the service worker API cache', async () => {
  localStorage.setItem('wki-platform-session', JSON.stringify({
    token: 'stored-token',
    expiresAt: Date.now() + 60_000,
  }));
  const deleted = [];
  const originalCaches = global.caches;
  global.caches = {
    keys: jest.fn(async () => ['wki-dynamic-v2', 'wki-static-v2']),
    delete: jest.fn(async (name) => {
      deleted.push(name);
      return true;
    }),
  };
  const postMessage = jest.fn();
  const originalServiceWorker = navigator.serviceWorker;
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller: { postMessage } },
  });

  await act(async () => {
    lockPlatform();
  });
  await waitFor(() => expect(deleted).toContain('wki-dynamic-v2'));
  expect(deleted).not.toContain('wki-static-v2');
  expect(postMessage).toHaveBeenCalledWith({ type: 'CLEAR_API_CACHE' });
  expect(localStorage.getItem('wki-platform-session')).toBeNull();

  global.caches = originalCaches;
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: originalServiceWorker,
  });
});
