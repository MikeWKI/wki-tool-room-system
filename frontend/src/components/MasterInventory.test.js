import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MasterInventory from './MasterInventory';

const layout = {
  sections: [
    {
      section: 5,
      title: 'Section 5',
      subtitle: 'Black cabinet',
      areas: [
        {
          id: 's5',
          name: 'Black Cabinet',
          locations: [
            {
              id: 's5-cabinet-sh-1',
              section: 5,
              area: 'Black Cabinet',
              shelfNumber: 1,
              label: 'Section 5 • Black Cabinet • Shelf 1',
            },
          ],
        },
      ],
    },
    {
      section: 1,
      title: 'Section 1',
      subtitle: 'MX & Cummins',
      areas: [
        {
          id: 's1-mx',
          name: 'MX Tools',
          locations: [
            {
              id: 's1-mx-sh-9',
              section: 1,
              area: 'MX Tools',
              shelfNumber: 9,
              label: 'Section 1 • MX Tools • Shelf 9',
              westRackLabel: 'West Rack - Shelf 9',
            },
          ],
        },
      ],
    },
  ],
  locations: [
    {
      id: 's5-cabinet-sh-1',
      section: 5,
      area: 'Black Cabinet',
      shelfNumber: 1,
      label: 'Section 5 • Black Cabinet • Shelf 1',
    },
    {
      id: 's1-mx-sh-9',
      section: 1,
      area: 'MX Tools',
      shelfNumber: 9,
      label: 'Section 1 • MX Tools • Shelf 9',
      westRackLabel: 'West Rack - Shelf 9',
    },
  ],
};

const inventory = [
  {
    id: 'west',
    partNumber: '2154147',
    description: 'MX-11/MX-13 Valve Spring Compressor Kit',
    shelf: 'West Rack - Shelf 9',
    category: 'MX Tools',
    engineFamily: 'MX',
    quantity: 1,
    status: 'available',
  },
  {
    id: 'hammer-a',
    partNumber: 'HAMMER',
    description: 'Ball peen',
    shelf: 'Section 5 • Black Cabinet • Shelf 1',
    category: 'General',
    quantity: 1,
    status: 'available',
  },
  {
    id: 'hammer-b',
    partNumber: 'HAMMER',
    description: 'Dead blow',
    shelf: 'TBD',
    category: 'General',
    quantity: 1,
    status: 'available',
  },
];

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(layout),
  }));
});

test('master search leaves the selected shelf and can jump back to the part location', async () => {
  const onSearchChange = jest.fn();
  const { rerender } = render(
    <MasterInventory
      inventory={inventory}
      loading={false}
      searchTerm=""
      onSearchChange={onSearchChange}
      onOpenPart={() => {}}
    />
  );

  await waitFor(() => expect(screen.getByText('Section 5')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Section 5'));
  fireEvent.click(screen.getByText('Shelf 1'));
  expect(screen.getByText('Ball peen')).toBeInTheDocument();
  expect(screen.queryByText('2154147')).not.toBeInTheDocument();
  expect(screen.getAllByText(/Section 5 · Black Cabinet · Shelf 1/).length).toBeGreaterThan(0);

  rerender(
    <MasterInventory
      inventory={inventory}
      loading={false}
      searchTerm="2154147"
      onSearchChange={onSearchChange}
      onOpenPart={() => {}}
    />
  );

  expect(screen.getByText(/Searching all shelves/)).toBeInTheDocument();
  expect(screen.getByText('2154147')).toBeInTheDocument();
  expect(screen.getByText(/West Rack · Shelf 9/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show shelf' }));
  expect(onSearchChange).toHaveBeenCalledWith('');
});

test('part detail names other rows that share the part number', async () => {
  render(
    <MasterInventory
      inventory={inventory}
      loading={false}
      searchTerm="HAMMER"
      onSearchChange={() => {}}
      onOpenPart={() => {}}
    />
  );

  await waitFor(() => expect(screen.getAllByText('HAMMER').length).toBeGreaterThan(0));
  fireEvent.click(screen.getByText('Ball peen'));
  expect(screen.getByText('same P# as 1 other entry')).toBeInTheDocument();
});
