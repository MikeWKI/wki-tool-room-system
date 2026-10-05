/**
 * JB Tool Room physical layout (source: inventory 02/04/2026).
 * Canonical labels are used for new shelf assignments; aliases match legacy live data.
 */

const westRackAliases = (shelfNum) => [
  `West Rack - Shelf ${shelfNum}`,
  `West Rack ${shelfNum}`,
  `West_Rack_${shelfNum}`,
];

const southRackAliases = (shelfNum) => [
  `South Rack - Shelf ${shelfNum}`,
  `South Rack ${shelfNum}`,
];

const northRackAliases = (shelfNum) => [
  `North Rack - Shelf ${shelfNum}`,
  `North Rack ${shelfNum}`,
];

function shelfLocation(id, section, area, shelfNumber, extraAliases = []) {
  const label = shelfNumber
    ? `Section ${section} • ${area} • Shelf ${shelfNumber}`
    : `Section ${section} • ${area}`;
  const jbShelf = shelfNumber ? `Section ${section} / Shelf ${shelfNumber}` : null;
  return {
    id,
    section,
    area,
    locationType: 'shelf',
    shelfNumber,
    label,
    westRackLabel:
      section === 1 && shelfNumber
        ? `West Rack - Shelf ${shelfNumber}`
        : null,
    aliases: [
      label,
      jbShelf,
      `Section ${section} - ${area} - Shelf ${shelfNumber}`,
      `S${section}-${area.replace(/\s+/g, '')}-Shelf${shelfNumber}`,
      ...extraAliases,
    ].filter(Boolean),
    sortOrder: shelfNumber || 0,
  };
}

const SECTIONS = [
  {
    section: 1,
    title: 'Section 1',
    subtitle: 'MX & Cummins engine tools',
    areas: [
      {
        id: 's1-cummins',
        name: 'Cummins Tools',
        locations: [1, 2, 3, 4, 5, 6, 7].map((n) =>
          shelfLocation(`s1-cummins-sh-${n}`, 1, 'Cummins Tools', n, westRackAliases(n))
        ),
      },
      {
        id: 's1-mx',
        name: 'MX Tools',
        locations: [8, 9, 10, 11, 12].map((n) =>
          shelfLocation(`s1-mx-sh-${n}`, 1, 'MX Tools', n, westRackAliases(n))
        ),
      },
    ],
  },
  {
    section: 2,
    title: 'Section 2',
    subtitle: 'General tools',
    areas: [
      {
        id: 's2-tools',
        name: 'Tools',
        locations: Array.from({ length: 13 }, (_, i) => i + 1).map((n) =>
          shelfLocation(`s2-sh-${n}`, 2, 'Tools', n, southRackAliases(n))
        ),
      },
    ],
  },
  {
    section: 3,
    title: 'Section 3',
    subtitle: 'Wall, CAT cart, Detroit cart',
    areas: [
      {
        id: 's3-areas',
        name: 'Section 3',
        locations: [
          {
            id: 's3-wall',
            section: 3,
            area: 'Tools on Wall',
            locationType: 'wall',
            shelfNumber: null,
            label: 'Section 3 • Tools on Wall',
            aliases: ['Section 3 Tools on Wall', 'Tools on WALL', 'Snap-on Puller Set Area'],
            sortOrder: 1,
          },
          {
            id: 's3-cat-cart',
            section: 3,
            area: 'CAT Cart',
            locationType: 'cart',
            shelfNumber: null,
            label: 'Section 3 • CAT Cart',
            aliases: ['CAT Cart', 'Section 3 CAT CART', 'Cat Cart'],
            sortOrder: 2,
          },
          {
            id: 's3-detroit-cart',
            section: 3,
            area: 'Detroit Cart',
            locationType: 'cart',
            shelfNumber: null,
            label: 'Section 3 • Detroit Cart',
            aliases: ['Detroit Cart', 'Section 3 DETROIT CART'],
            sortOrder: 3,
          },
        ],
      },
    ],
  },
  {
    section: 4,
    title: 'Section 4',
    subtitle: 'Bookshelves',
    areas: [
      {
        id: 's4-books',
        name: 'Bookshelves',
        locations: [
          {
            id: 's4-bookshelves',
            section: 4,
            area: 'Bookshelves',
            locationType: 'bookshelf',
            shelfNumber: null,
            label: 'Section 4 • Bookshelves',
            aliases: ['Section 4 BOOKSHELVES', 'North Rack - Section 4'],
            sortOrder: 1,
          },
        ],
      },
    ],
  },
  {
    section: 5,
    title: 'Section 5',
    subtitle: 'Black cabinet',
    areas: [
      {
        id: 's5-cabinet',
        name: 'Black Cabinet',
        locations: [1, 2, 3, 4, 5].map((n) => ({
          id: `s5-cabinet-sh-${n}`,
          section: 5,
          area: 'Black Cabinet',
          locationType: 'cabinet',
          shelfNumber: n,
          label: `Section 5 • Black Cabinet • Shelf ${n}`,
          aliases: [
            `Section 5 Black Cabinet Shelf ${n}`,
            `Black Cabinet - Shelf ${n}`,
          ],
          sortOrder: n,
        })),
      },
    ],
  },
  {
    section: 6,
    title: 'Section 6',
    subtitle: 'Bookshelves',
    areas: [
      {
        id: 's6-books',
        name: 'Bookshelves',
        locations: [
          {
            id: 's6-bookshelves',
            section: 6,
            area: 'Bookshelves',
            locationType: 'bookshelf',
            shelfNumber: null,
            label: 'Section 6 • Bookshelves',
            aliases: ['Section 6 BOOKSHELVES', 'East Facing Hanging Wall - Section 6'],
            sortOrder: 1,
          },
        ],
      },
    ],
  },
  {
    section: 7,
    title: 'Section 7',
    subtitle: 'Bookshelves (shop equipment)',
    areas: [
      {
        id: 's7-books',
        name: 'Bookshelves',
        locations: Array.from({ length: 8 }, (_, i) => i + 1).map((n) => ({
          id: `s7-sh-${n}`,
          section: 7,
          area: 'Bookshelves',
          locationType: 'shelf',
          shelfNumber: n,
          label: `Section 7 • Bookshelves • Shelf ${n}`,
          aliases: [
            `Section 7 BOOKSHELVES SHELF ${n}`,
            ...northRackAliases(n),
          ],
          sortOrder: n,
        })),
      },
    ],
  },
  {
    section: 8,
    title: 'Section 8',
    subtitle: 'Center tool wall',
    areas: [
      {
        id: 's8-wall',
        name: 'Center Tool Wall',
        locations: [
          {
            id: 's8-center-wall',
            section: 8,
            area: 'Center Tool Wall',
            locationType: 'wall',
            shelfNumber: null,
            label: 'Section 8 • Center Tool Wall',
            aliases: ['CENTER TOOL WALL', 'Section 8 CENTER TOOL WALL'],
            sortOrder: 1,
          },
        ],
      },
    ],
  },
  {
    section: 9,
    title: 'Section 9',
    subtitle: 'Other side of wall',
    areas: [
      {
        id: 's9-wall',
        name: 'Other Side of Wall',
        locations: [
          {
            id: 's9-wall-other',
            section: 9,
            area: 'Other Side of Wall',
            locationType: 'wall',
            shelfNumber: null,
            label: 'Section 9 • Other Side of Wall',
            aliases: ['OTHER SIDE OF WALL', 'Section 9 OTHER SIDE OF WALL'],
            sortOrder: 1,
          },
        ],
      },
    ],
  },
  {
    section: 10,
    title: 'Foreman\'s Desk',
    subtitle: 'Desk / overflow',
    areas: [
      {
        id: 'foreman',
        name: 'Foreman\'s Desk',
        locations: [
          {
            id: 'foreman-desk',
            section: 10,
            area: 'Foreman\'s Desk',
            locationType: 'desk',
            shelfNumber: null,
            label: 'Foreman\'s Desk',
            aliases: ['Foremans Desk', "Foreman's Desk"],
            sortOrder: 1,
          },
        ],
      },
    ],
  },
];

function flattenLocations() {
  const locations = [];
  for (const sec of SECTIONS) {
    for (const area of sec.areas) {
      for (const loc of area.locations) {
        locations.push({ ...loc, sectionTitle: sec.title });
      }
    }
  }
  return locations;
}

const ALL_LOCATIONS = flattenLocations();

function normalizePartNumber(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeShelfKey(value) {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function isSyntheticJbPartNumber(partNumber) {
  if (!partNumber) return true;
  return String(partNumber).toUpperCase().startsWith('NOPN-');
}

/**
 * Resolve a live part.shelf string to a layout location id (or null).
 * @param {string} shelfValue
 * @param {string} [category] - engine family / JB category (MX Tools, Cummins Tools, …)
 */
function resolvePartLocationId(shelfValue, category = '') {
  if (!shelfValue) return null;
  const key = normalizeShelfKey(shelfValue);
  if (key === 'tbd' || key === 'unassigned' || key === '') return null;

  const westMatch = key.match(/west rack\s*-?\s*shelf\s*(\d+)/i);
  if (westMatch) {
    const n = parseInt(westMatch[1], 10);
    if (n >= 8) return `s1-mx-sh-${n}`;
    if (n >= 1) return `s1-cummins-sh-${n}`;
  }

  const sectionShelf = key.match(/section\s*1\s*[/•-]\s*shelf\s*(\d+)/i);
  if (sectionShelf) {
    const n = parseInt(sectionShelf[1], 10);
    const cat = String(category).toLowerCase();
    if (cat.includes('mx')) return `s1-mx-sh-${n}`;
    if (cat.includes('cummins')) return `s1-cummins-sh-${n}`;
    if (n >= 8) return `s1-mx-sh-${n}`;
    if (n >= 1 && n <= 7) return `s1-cummins-sh-${n}`;
  }

  for (const loc of ALL_LOCATIONS) {
    const candidates = [
      loc.label,
      loc.westRackLabel,
      ...(loc.aliases || []),
    ]
      .filter(Boolean)
      .map(normalizeShelfKey);
    if (candidates.some((c) => c === key || (c.length > 8 && (key.includes(c) || c.includes(key))))) {
      return loc.id;
    }
  }
  return null;
}

function getLocationById(id) {
  return ALL_LOCATIONS.find((l) => l.id === id) || null;
}

/** UI label: Section 1 shelves also show West Rack alias */
function formatLocationLabel(locationId) {
  const loc = getLocationById(locationId);
  if (!loc) return null;
  if (loc.westRackLabel) {
    return `${loc.label} (${loc.westRackLabel})`;
  }
  return loc.label;
}

function shelfRecordsForSeed() {
  return ALL_LOCATIONS.map((loc) => ({
    shelfId: loc.id,
    name: loc.label,
    description: `${loc.area} (Section ${loc.section})`,
    imageUrl: null,
    section: loc.section,
    area: loc.area,
    locationType: loc.locationType,
    shelfNumber: loc.shelfNumber,
    canonicalLabel: loc.label,
    aliases: loc.aliases || [],
    sortOrder: loc.sortOrder ?? 0,
  }));
}

module.exports = {
  SECTIONS,
  ALL_LOCATIONS,
  normalizePartNumber,
  normalizeShelfKey,
  resolvePartLocationId,
  getLocationById,
  formatLocationLabel,
  isSyntheticJbPartNumber,
  shelfRecordsForSeed,
};
