const fs = require('fs').promises;
const path = require('path');

/**
 * Write JSON by renaming a temp file in the same directory.
 * Readers see the previous file or the new file, not a partial write.
 */
async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(JSON.stringify(value, null, 2), 'utf8');
    if (typeof handle.sync === 'function') await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
  await handle.close();
  try {
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    throw error;
  }
}

module.exports = {
  writeJsonAtomic,
};
