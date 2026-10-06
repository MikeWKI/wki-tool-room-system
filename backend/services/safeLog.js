/**
 * Error logs are name, code, and a fixed short token.
 * Never include error.message: Mongo duplicate-key errors and JSON.parse
 * errors can carry part documents, tech names, or file contents.
 */
function logStoreError(scope, error) {
  const name = error && error.name ? String(error.name) : 'Error';
  const code = error && error.code != null && error.code !== '' ? String(error.code) : '';
  let message = 'store_error';
  if (name === 'SyntaxError' || code === 'STORE_READ_FAILED') message = 'json_parse_failed';
  else if (code === '11000') message = 'duplicate_key';
  else if (code === 'STORE_UNAVAILABLE') message = 'store_unavailable';
  console.error(String(scope || 'store'), name, code, message);
}

module.exports = {
  logStoreError,
};
