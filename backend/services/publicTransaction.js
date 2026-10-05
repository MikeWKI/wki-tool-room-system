function toPublicTransaction(transaction) {
  if (!transaction || typeof transaction !== 'object') return transaction;
  const copy = { ...transaction };
  delete copy.batchKey;
  delete copy._id;
  delete copy.__v;
  return copy;
}

module.exports = { toPublicTransaction };
