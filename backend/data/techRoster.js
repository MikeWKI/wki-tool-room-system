/**
 * Shop roster supplied 2026-10-05. Names are used as written.
 * Specialties bias which tool families a tech checks out. They are not specs.
 */

const TECHS = [
  { name: 'Laryssa J.', group: '1st', days: ['Mon'], specialties: ['WB'] },
  { name: 'Kyler M.', group: '1st', days: ['Mon'], specialties: ['Cummins'] },
  { name: 'Mario L.', group: '1st', days: ['Tue'], specialties: ['WB', 'Cummins'] },
  { name: 'Jon B.', group: '1st', days: ['Tue'], specialties: ['Allison', 'Cummins'] },
  { name: 'Will P.', group: '1st', days: ['Wed'], specialties: ['Cummins'] },
  { name: 'Phil C.', group: '1st', days: ['Wed'], specialties: ['TBD'] },
  { name: 'Dakota B.', group: '1st', days: ['Wed'], specialties: ['Safety'] },
  { name: 'Shawn S.', group: '1st', days: ['Thu'], specialties: ['Cummins'] },
  { name: 'Noah R.', group: '1st', days: ['Thu'], specialties: ['Cummins'] },
  { name: 'Devin S.', group: '1st', days: ['Thu'], specialties: ['WB', 'Bendix'] },
  { name: 'Remington N.', group: '1st', days: ['Fri'], specialties: ['Cummins'] },
  { name: 'Mark P.', group: '1st', days: ['Fri'], specialties: ['TBD'] },
  { name: 'Shane D.', group: '1st', days: ['Fri'], specialties: ['WB', 'Alt Fuels', 'Bendix', 'Electrical'] },
  { name: 'Trenton W.', group: '1st', days: ['Fri'], specialties: ['WB', 'Electrical', 'Alt Fuels', 'Allison'] },
  { name: 'Tim K.', group: '1st', days: ['Fri'], specialties: ['TBD'] },

  { name: 'Drew P.', group: 'training', days: ['Mon'], specialties: ['Cummins'] },
  { name: 'Steve J.', group: 'training', days: ['Tue'], specialties: ['TBD'] },
  { name: 'Danny C.', group: 'training', days: ['Wed'], specialties: ['Essentials', 'Powertrain'] },

  { name: 'Gerardo N.', group: '2nd', days: ['Mon'], specialties: ['WB', 'Chassis'] },
  { name: 'Eduardo C.', group: '2nd', days: ['Tue'], specialties: ['WB', 'Essentials'] },
  { name: 'Levi S.', group: '2nd', days: ['Tue'], specialties: ['Essentials'] },
  { name: 'Federico L.', group: '2nd', days: ['Wed'], specialties: ['Engine', 'WB', 'Safety'] },
  { name: 'William C.', group: '2nd', days: ['Thu'], specialties: ['Electrical'] },
  { name: 'James D.', group: '2nd', days: ['Fri'], specialties: ['WB', 'Essentials', 'Powertrain', 'Safety'] },
  { name: 'Tom C.', group: '2nd', days: ['Fri'], specialties: ['TBD'] },
  { name: 'Austin R.', group: '2nd', days: ['Fri'], specialties: ['TBD'] },

  { name: 'Austin S.', group: 'office', days: ['Mon'], specialties: [] },
  { name: 'Dena S.', group: 'office', days: ['Tue'], specialties: [] },
  { name: 'Nick W.', group: 'office', days: ['Wed'], specialties: [] },
  { name: 'Mike A.', group: 'office', days: ['Thu'], specialties: ['Foreman'] },
  { name: 'Johny P.', group: 'office', days: ['Fri'], specialties: [] },

  { name: 'Luke B.', group: 'service', days: ['Mon'], specialties: ['Bendix', 'Electrical'], weekend: true },
  { name: 'Tyler M.', group: 'service', days: ['Tue'], specialties: ['Allison', 'Bendix'], weekend: true },
  { name: 'Owen T.', group: 'service', days: ['Wed'], specialties: ['Allison', 'WB', 'Bendix', 'Electrical'], weekend: true },

  { name: 'Devyn T.', group: 'recon', days: ['Tue'], specialties: ['Truck Basics'] },
  { name: 'Kimble (Jon) T.', group: 'recon', days: ['Wed'], specialties: ['WB'] },
  { name: 'Zavier H.', group: 'recon', days: ['Thu'], specialties: ['Truck Basics'] },
  { name: 'Joseph Perry', group: 'recon', days: ['Fri'], specialties: ['Truck Basics'] },

  { name: 'Josh A.', group: 'body', days: ['Mon'], specialties: ['WB', 'Electrical', 'Alt Fuels', 'Bendix'] },
  { name: 'Drew S.', group: 'body', days: ['Mon'], specialties: ['Body'] },
  { name: 'James S.', group: 'body', days: ['Tue'], specialties: ['Body'] },
  { name: 'Austin P.', group: 'body', days: ['Tue'], specialties: ['Body', 'Chassis'] },
  { name: 'Danny M.', group: 'body', days: ['Wed'], specialties: ['Body'] },
  { name: 'Devin K.', group: 'body', days: ['Wed'], specialties: ['Body', 'Chassis'] },
  { name: 'Chris S.', group: 'body', days: ['Wed'], specialties: ['Body'] },
  { name: 'Collin S.', group: 'body', days: ['Thu'], specialties: ['Body', 'EV', 'Chassis', 'Electrical', 'Engine', 'HVAC'] },
  { name: 'Braxton B.', group: 'body', days: ['Thu'], specialties: ['Parts'], partsCounter: true },
  { name: 'Bill M.', group: 'body', days: ['Thu'], specialties: ['Body'] },
  { name: 'Bayleigh C.', group: 'body', days: ['Fri'], specialties: ['Body'] },
  { name: 'Hamilton H.', group: 'body', days: ['Fri'], specialties: ['Parts', 'Powertrain', 'Chassis'], partsCounter: true },
  { name: 'Ricky T.', group: 'body', days: ['Fri'], specialties: ['Body', 'Powertrain'] },
];

const GROUP_CHANCE = {
  '1st': 0.62,
  '2nd': 0.55,
  training: 0.34,
  body: 0.46,
  service: 0.74,
  recon: 0.22,
  office: 0.05,
};

function checkoutChance(tech) {
  if (tech.partsCounter) return 0.1;
  if (tech.name === 'Mike A.') return 0.12;
  return GROUP_CHANCE[tech.group] ?? 0.3;
}

module.exports = {
  TECHS,
  checkoutChance,
};
