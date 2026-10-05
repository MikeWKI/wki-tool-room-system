import { render, screen } from '@testing-library/react';
import ReconcileInventory from './ReconcileInventory';

test('JB Staging is the default reconcile view and dry run is labeled', async () => {
  const apiCall = jest.fn(async (endpoint) => {
    if (endpoint === '/reconcile/report') {
      return {
        meta: {
          liveTotal: 10,
          jbTotalRows: 8,
          matched: 4,
          matchedWithDiffs: 2,
          jbOnly: 1,
          liveOnly: 3,
          tbdOrUnmappedShelf: 5,
        },
        matchedWithDiffs: [],
        jbOnly: [],
        liveOnly: [],
        matchedClean: [],
        staging: { count: 0 },
        applyToLiveEnabled: false,
        importStrategy: 'fill-gaps',
      };
    }
    if (endpoint === '/reconcile/fill-gaps-plan') {
      return {
        dryRun: true,
        applyToLiveEnabled: false,
        counts: {
          updateShelfFromJb: 2,
          addFromJb: 1,
          skippedLocationConflict: 1,
          jbStaging: 2,
        },
        actions: {
          skippedLocationConflict: [{ partNumber: 'C-E-208', liveShelf: 'West Rack - Shelf 10', jbShelf: 'Section 1 / Shelf 9' }],
          jbStaging: [{
            partNumber: 'C-E-208',
            reason: 'location_conflict',
            fields: ['shelf'],
            message: 'Location conflict stays in JB Staging until Accept JB.',
            live: { description: 'EGR kit', shelf: 'West Rack - Shelf 10', quantity: 1 },
            jb: { description: 'EGR kit', shelf: 'Section 1 / Shelf 9', quantity: 1 },
          }],
        },
      };
    }
    throw new Error(`unexpected ${endpoint}`);
  });

  render(<ReconcileInventory apiCall={apiCall} currentUser="Noah R." />);
  expect(await screen.findByText('C-E-208')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'JB Staging' })).toBeInTheDocument();
  expect(screen.getByText(/Apply-to-live is off/i)).toBeInTheDocument();
  expect(screen.getByText(/Location conflicts — not moved/i)).toBeInTheDocument();
});
