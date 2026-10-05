const fs = require('fs');
const path = require('path');
const { ALL_LOCATIONS, normalizePartNumber } = require('../data/masterInventoryLayout');

const NO_PN_PATTERNS = /^no\s*p#?/i;

function parseInventoryLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('TOOL ROOM') || trimmed.startsWith('02/04')) {
    return null;
  }

  const partMatch = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9./\-–—]+?)\s*[-–—]\s*(.+)$/);
  if (!partMatch) {
    return null;
  }

  const rawPn = partMatch[1].trim();
  const description = partMatch[2].trim();

  if (NO_PN_PATTERNS.test(rawPn)) {
    return {
      rawPartNumber: rawPn,
      partNumber: null,
      normalizedPartNumber: null,
      description,
      isNoPartNumber: true,
    };
  }

  return {
    rawPartNumber: rawPn,
    partNumber: rawPn,
    normalizedPartNumber: normalizePartNumber(rawPn),
    description,
    isNoPartNumber: false,
  };
}

/**
 * Parse JB raw inventory text into rows with best-effort location assignment.
 */
function parseJbInventoryText(text) {
  const lines = text.split(/\r?\n/);
  let currentSection = null;
  let currentArea = null;
  let currentLocationId = null;
  const rows = [];

  const sectionRe = /^SECTION\s+(\d+)/i;
  const shelfRe = /^SHELF\s+(\d+)/i;
  const areaHeaders = [
    { re: /MX\s+TOOLS/i, area: 'MX Tools', prefix: 's1-mx-sh-' },
    { re: /CUMMINS\s+TOOLS/i, area: 'Cummins Tools', prefix: 's1-cummins-sh-' },
    { re: /^TOOLS\s+on\s+WALL/i, id: 's3-wall' },
    { re: /CAT\s+CART/i, id: 's3-cat-cart' },
    { re: /DETROIT\s+CART/i, id: 's3-detroit-cart' },
    { re: /BOOKSHELVES/i, id: null },
    { re: /BLACK\s+CABINET/i, area: 'Black Cabinet', prefix: 's5-cabinet-sh-' },
    { re: /CENTER\s+TOOL\s+WALL/i, id: 's8-center-wall' },
    { re: /OTHER\s+SIDE\s+OF\s+WALL/i, id: 's9-wall-other' },
    { re: /Foremans?\s+Desk/i, id: 'foreman-desk' },
  ];

  for (const line of lines) {
    const sec = line.match(sectionRe);
    if (sec) {
      currentSection = parseInt(sec[1], 10);
      currentArea = null;
      currentLocationId = null;
      for (const h of areaHeaders) {
        if (h.re.test(line)) {
          if (h.id) {
            currentLocationId = h.id;
          } else if (h.area) {
            currentArea = h.area;
          } else if (/BOOKSHELVES/i.test(line) && currentSection) {
            currentLocationId = `s${currentSection}-bookshelves`;
            if (currentSection === 7) {
              currentLocationId = null;
              currentArea = 'Bookshelves';
            }
          }
          break;
        }
      }
      continue;
    }

    const sh = line.match(shelfRe);
    if (sh) {
      const shelfNum = parseInt(sh[1], 10);
      if (currentSection === 1 && currentArea === 'MX Tools') {
        currentLocationId = `s1-mx-sh-${shelfNum}`;
      } else if (currentSection === 1 && currentArea === 'Cummins Tools') {
        currentLocationId = `s1-cummins-sh-${shelfNum}`;
      } else if (currentSection === 2) {
        currentLocationId = `s2-sh-${shelfNum}`;
      } else if (currentSection === 5) {
        currentLocationId = `s5-cabinet-sh-${shelfNum}`;
      } else if (currentSection === 7) {
        currentLocationId = `s7-sh-${shelfNum}`;
      }
      continue;
    }

    for (const h of areaHeaders) {
      if (h.re.test(line) && !sectionRe.test(line)) {
        if (h.id) currentLocationId = h.id;
        if (h.area) currentArea = h.area;
        break;
      }
    }

    const parsed = parseInventoryLine(line);
    if (!parsed) continue;

    rows.push({
      ...parsed,
      section: currentSection,
      area: currentArea,
      locationId: currentLocationId,
    });
  }

  return rows;
}

function loadDefaultJbInventoryFile() {
  const filePath = path.join(__dirname, '../data/inventory-jb-2026-02-04-raw.txt');
  return fs.readFileSync(filePath, 'utf8');
}

function locationLabelById(id) {
  const loc = ALL_LOCATIONS.find((l) => l.id === id);
  return loc ? loc.label : id;
}

module.exports = {
  parseInventoryLine,
  parseJbInventoryText,
  loadDefaultJbInventoryFile,
  locationLabelById,
};
