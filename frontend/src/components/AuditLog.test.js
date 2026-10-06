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

test('audit log labels a door entry', () => {
  render(<AuditLog transactions={[{
    id: 9,
    partNumber: 'Tool Room',
    action: 'door_entry',
    user: 'Noah R.',
    timestamp: '2026-10-06T20:00:00.000Z',
    notes: 'Noah R. entered Tool Room.',
    source: 'simulated',
  }]} onRefresh={() => {}} loading={false} />);
  expect(screen.getAllByText('Door entry').length).toBeGreaterThan(0);
  expect(screen.getByText('Simulated')).toBeInTheDocument();
});

test('audit log filters by tech and shows RO', () => {
  render(<AuditLog transactions={rows} onRefresh={() => {}} loading={false} />);
  expect(screen.getByText('Audit Log')).toBeInTheDocument();
  expect(screen.getByText('2892427')).toBeInTheDocument();
  expect(screen.getAllByText(/RO 184221/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('Tech'), { target: { value: 'Laryssa J.' } });
  expect(screen.queryByText('2892427')).not.toBeInTheDocument();
  expect(screen.getByText('J33880')).toBeInTheDocument();
});
