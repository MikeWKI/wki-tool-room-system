const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();
const token = Symbol('store-lock');
let tail = Promise.resolve();

/**
 * One queue for transaction, audit, and door JSON read-modify-write cycles.
 * Re-enters on the same async chain so a locked door write can append an audit.
 */
function withStoreLock(fn) {
  if (storage.getStore() === token) return Promise.resolve().then(fn);
  const run = tail.then(
    () => storage.run(token, fn),
    () => storage.run(token, fn)
  );
  tail = run.then(() => undefined, () => undefined);
  return run;
}

module.exports = {
  withStoreLock,
};
