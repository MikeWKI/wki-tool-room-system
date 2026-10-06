import { render, screen, fireEvent } from '@testing-library/react';
import DoorAccountability from './DoorAccountability';

test('manage door panel shows offenders and can simulate an entry', async () => {
  sessionStorage.setItem('wki-manage-session', JSON.stringify({
    token: 'manage-test-token',
    expiresAt: Date.now() + 60_000,
  }));
  const apiCall = jest.fn(async (path, options = {}) => {
    if (path.startsWith('/door/status')) {
      return {
        alertsMode: 'dry_run',
        alertsWarning: 'ALERTS_MODE is live but SMTP is not configured. Emails are stored and not sent.',
        supervisorConfigured: true,
        windowMinutes: 10,
        sweepTime: '17:00',
        sweepDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        roster: ['Noah R.', 'Laryssa J.'],
      };
    }
    if (path.startsWith('/door/metrics')) {
      return {
        techs: [{
          tech: 'Noah R.',
          doorEntries: 2,
          entriesWithoutCheckout: 1,
          lateReturns: 0,
          overdueItems: 0,
          averageHoursOut: 1.5,
        }],
        topOffenders: [{
          tech: 'Noah R.',
          entriesWithoutCheckout: 1,
          lateReturns: 0,
          overdueItems: 0,
        }],
        trend: [{ date: '2026-10-06', entriesWithoutCheckout: 1 }],
      };
    }
    if (path === '/door/badges') return [];
    if (path === '/door/outbox') return [];
    if (path === '/door/simulate') {
      expect(options.method).toBe('POST');
      return { visit: { displayName: 'Noah R.', windowMinutes: 1 } };
    }
    return {};
  });

  render(<DoorAccountability apiCall={apiCall} />);
  expect(await screen.findByText('Door accountability')).toBeInTheDocument();
  expect(await screen.findByText(/SMTP is not configured/)).toBeInTheDocument();
  expect(apiCall).toHaveBeenCalledWith('/door/status', {
    headers: { Authorization: 'Bearer manage-test-token' },
  });
  expect(await screen.findByText(/1\. Noah R\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Simulate entry' }));
  expect(await screen.findByText(/Simulated entry for Noah R\./)).toBeInTheDocument();
});
