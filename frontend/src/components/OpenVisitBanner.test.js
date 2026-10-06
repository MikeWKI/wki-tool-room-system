import { render, screen, fireEvent } from '@testing-library/react';
import OpenVisitBanner from './OpenVisitBanner';

test('kiosk prompt records a no-tool note', async () => {
  const apiCall = jest.fn(async (path, options = {}) => {
    if (path.startsWith('/door/open-visit')) {
      return {
        visit: {
          id: 'visit-1',
          displayName: 'Noah R.',
          enteredAt: '2026-10-06T20:00:00.000Z',
          deadlineAt: '2026-10-06T20:10:00.000Z',
        },
      };
    }
    expect(options.method).toBe('POST');
    return { suppressesAlert: false };
  });
  render(<OpenVisitBanner apiCall={apiCall} techName="Noah R." />);
  expect(await screen.findByText(/No tool taken/)).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/Returning a tool/), { target: { value: 'Returning only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
  expect(await screen.findByText(/Jon still gets the entry email/)).toBeInTheDocument();
});
