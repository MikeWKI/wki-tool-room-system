import { render, screen, fireEvent } from '@testing-library/react';
import AuditLog from './AuditLog';

const rows = [
  {
    id: 1,
    partNumber: '2892427',
    action: 'checkout',
    user: 'Noah R.',
    timestamp: '2026-09-18T14:12:00.000Z',
    notes: 'RO 184221 unit 214',
    roNumber: '184221',
    unitNumber: '214',
  },
  {
    id: 2,
    partNumber: 'J33880',
    action: 'checkin',
    user: 'Laryssa J.',
    timestamp: '2026-09-19T18:40:00.000Z',
    notes: 'Unit 88 RO 22911',
    roNumber: '22911',
    unitNumber: '88',
  },
];

test('audit log filters by tech and shows RO', () => {
  render(<AuditLog transactions={rows} onRefresh={() => {}} loading={false} />);
  expect(screen.getByText('Audit Log')).toBeInTheDocument();
  expect(screen.getByText('2892427')).toBeInTheDocument();
  expect(screen.getAllByText(/RO 184221/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('Tech'), { target: { value: 'Laryssa J.' } });
  expect(screen.queryByText('2892427')).not.toBeInTheDocument();
  expect(screen.getByText('J33880')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByText('2892427')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'still_out' } });
  expect(screen.getByText('2892427')).toBeInTheDocument();
  expect(screen.queryByText('J33880')).not.toBeInTheDocument();
  expect(screen.getAllByText('Still out').length).toBeGreaterThan(0);
});
