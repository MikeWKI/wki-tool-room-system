const { formatChicago } = require('./chicagoTime');

function minuteLabel(minutes) {
  const count = Number(minutes) || 10;
  return `${count} minute${count === 1 ? '' : 's'}`;
}

function visitAlertText(visit) {
  const name = visit.displayName || 'Unknown badge';
  let text = `${name} entered the tool room at ${formatChicago(visit.enteredAt)} and no tool checkout was recorded within ${minuteLabel(visit.windowMinutes)}`;
  if (visit.exitAt) {
    text += ` (exited at ${formatChicago(visit.exitAt)})`;
  }
  text += '.';
  if (visit.ackReason) {
    text += ` Kiosk note: ${visit.ackReason}.`;
  }
  return text;
}

function techSweepText(item) {
  const lines = [
    `${item.description || item.partNumber} is still checked out to you.`,
    `Tool: ${item.description || 'Tool'}`,
    `P#: ${item.partNumber}`,
    `Checked out: ${formatChicago(item.checkedOutDate)}`,
  ];
  if (item.overdue) {
    lines.push('OVERDUE: this has been out for more than a day.');
  }
  lines.push('Please check it in ASAP or first thing on return tomorrow.');
  return lines.join('\n');
}

function summarySweepText(items, dayKey) {
  if (!items.length) {
    return `Tool room 5 PM sweep for ${dayKey}. Nothing is still checked out.`;
  }
  const lines = [`Tool room 5 PM sweep for ${dayKey}. ${items.length} tool${items.length === 1 ? '' : 's'} still out:`, ''];
  for (const item of items) {
    const flag = item.overdue ? ' OVERDUE' : '';
    lines.push(`- ${item.user}: P# ${item.partNumber} (${item.description || 'tool'}), out since ${formatChicago(item.checkedOutDate)}.${flag}`);
  }
  return lines.join('\n');
}

module.exports = {
  visitAlertText,
  techSweepText,
  summarySweepText,
};
