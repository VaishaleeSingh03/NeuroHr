/**
 * Remove dummy employees + candidates; keep HR admin (vaishaleeaiml@gmail.com).
 * Jobs from KB are preserved so you can re-run the hiring flow.
 *
 * Usage: node scripts/clear-dummy-data.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { connectDB } = require('../src/db');
const { clearDummyEmployeesAndCandidates, getCounts } = require('../src/lib/seedMongo');

async function main() {
  await connectDB();
  console.log('--- Clearing dummy employees & candidates (keeping HR admin) ---');
  const result = await clearDummyEmployeesAndCandidates();
  console.log('Removed:', result.removed);
  console.log('Kept HR login:', result.keptHr.join(', '));
  console.log('Final counts:', await getCounts());
  console.log('--- Done. Create employees and candidates from the dashboard. ---');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
