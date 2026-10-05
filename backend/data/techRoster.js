/**
 * Short shop roster for audit history (Michael 2026-10-05).
 * Only these names may appear as technicians. Specialties bias tool family.
 * They are not specs.
 */

const TECHS = [
  { name: 'Laryssa J.', group: '1st', days: ['Mon'], specialties: ['WB'] },
  { name: 'Kyler M.', group: '1st', days: ['Mon'], specialties: ['Cummins'] },
  { name: 'Drew P.', group: 'training', days: ['Mon'], specialties: ['Cummins'] },

  { name: 'Mario L.', group: '1st', days: ['Tue'], specialties: ['WB', 'Cummins'] },
  { name: 'Jon B.', group: '1st', days: ['Tue'], specialties: ['Allison', 'Cummins'] },
  { name: 'Steve J.', group: 'training', days: ['Tue'], specialties: ['TBD'] },

  { name: 'Will P.', group: '1st', days: ['Wed'], specialties: ['Cummins'] },
  { name: 'Phil C.', group: '1st', days: ['Wed'], specialties: ['TBD'] },
  { name: 'Dakota B.', group: '1st', days: ['Wed'], specialties: ['Safety'] },
  { name: 'Danny C.', group: 'training', days: ['Wed'], specialties: ['Essentials', 'Powertrain'] },

  { name: 'Shawn S.', group: '1st', days: ['Thu'], specialties: ['Cummins'] },
  { name: 'Noah R.', group: '1st', days: ['Thu'], specialties: ['Cummins'] },
  { name: 'Devin S.', group: '1st', days: ['Thu'], specialties: ['WB', 'Bendix'] },

  { name: 'Remington N.', group: '1st', days: ['Fri'], specialties: ['Cummins'] },
];

const ALLOWED_TECH_NAMES = TECHS.map((tech) => tech.name);

const ALLOWED_TECH_SET = new Set(ALLOWED_TECH_NAMES);

/**
 * Names that must not remain on history or checkedOutBy.
 * Mark P. is Mark Porter (not a technician). Trenton W. is out on medical.
 * Everyone else from the previous roster is removed the same way.
 */
const REMOVED_TECH_NAMES = [
  'Mark P.',
  'Mark Porter',
  'Trenton W.',
  'Shane D.',
  'Tim K.',
  'Gerardo N.',
  'Eduardo C.',
  'Levi S.',
  'Federico L.',
  'William C.',
  'James D.',
  'Tom C.',
  'Austin R.',
  'Austin S.',
  'Dena S.',
  'Nick W.',
  'Mike A.',
  'Johny P.',
  'Luke B.',
  'Tyler M.',
  'Owen T.',
  'Devyn T.',
  'Kimble (Jon) T.',
  'Zavier H.',
  'Joseph Perry',
  'Josh A.',
  'Drew S.',
  'James S.',
  'Austin P.',
  'Danny M.',
  'Devin K.',
  'Chris S.',
  'Collin S.',
  'Braxton B.',
  'Bill M.',
  'Bayleigh C.',
  'Hamilton H.',
  'Ricky T.',
];

const GROUP_CHANCE = {
  '1st': 0.92,
  training: 0.78,
};

function checkoutChance(tech) {
  return GROUP_CHANCE[tech.group] ?? 0.7;
}

function isAllowedTechName(name) {
  return ALLOWED_TECH_SET.has(String(name || '').trim());
}

module.exports = {
  TECHS,
  ALLOWED_TECH_NAMES,
  REMOVED_TECH_NAMES,
  checkoutChance,
  isAllowedTechName,
};
