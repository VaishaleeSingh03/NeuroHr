require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { connectDB } = require('./db');
const { runSeed } = require('./lib/seedMongo');

const force = process.argv.includes('--force') || process.env.SEED_FORCE === 'true';

async function main() {
  await connectDB();
  console.log(`--- NeuroHR AI: seeding MongoDB Atlas (force=${force}) ---`);
  const counts = await runSeed({ force });
  console.log('--- Done. Data lives in MongoDB, not local JSON files ---');
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
