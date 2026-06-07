/**
 * Replace vaishu@gmail.com with vaishaleeaiml@gmail.com as HR admin.
 * Usage: node scripts/migrate-hr-email.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const { connectDB } = require('../src/db');
const { User, getNextSeq } = require('../src/models');

const OLD_EMAIL = 'vaishu@gmail.com';
const NEW_EMAIL = 'vaishaleeaiml@gmail.com';
const ADMIN = {
  name: 'HR Admin',
  email: NEW_EMAIL,
  password: '123456',
  role: 'management_admin',
};

async function main() {
  await connectDB();

  const removed = await User.deleteOne({ email: OLD_EMAIL });
  console.log(`Removed old admin: ${OLD_EMAIL} (deleted: ${removed.deletedCount})`);

  let user = await User.findOne({ email: NEW_EMAIL });
  if (user) {
    user.name = ADMIN.name;
    user.role = ADMIN.role;
    user.passwordHash = await bcrypt.hash(ADMIN.password, 10);
    user.isActive = true;
    await user.save();
    console.log(`Updated existing HR admin: ${NEW_EMAIL}`);
  } else {
    const id = await getNextSeq('users');
    await User.create({
      id,
      name: ADMIN.name,
      email: NEW_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN.password, 10),
      role: ADMIN.role,
      permissions: [],
    });
    console.log(`Created HR admin: ${NEW_EMAIL}`);
  }

  console.log(`Login: ${NEW_EMAIL} / ${ADMIN.password}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
