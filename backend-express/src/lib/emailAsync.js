const { resetTransporters } = require('./emailService');

const BG_MAX_ROUNDS = 4;
const BG_ROUND_DELAY_MS = 2500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emailDelivered(result) {
  if (!result) return false;
  if (result.sent === true || result.candidateEmailSent === true) return true;
  if (result.sent === false || result.candidateEmailSent === false) return false;
  return result.sent !== false;
}

/** Fire-and-forget with automatic retries until sent or max rounds. */
function runEmailInBackground(task, label = 'email') {
  const run = typeof task === 'function' ? task : () => task;

  setImmediate(async () => {
    for (let round = 1; round <= BG_MAX_ROUNDS; round += 1) {
      try {
        const result = await run();
        if (emailDelivered(result)) {
          if (round > 1) console.log(`[email:bg] ${label} delivered on round ${round}`);
          return;
        }
        console.warn(`[email:bg] ${label} round ${round}/${BG_MAX_ROUNDS} — ${result?.reason || result?.candidateEmailError || 'not_sent'}`);
        resetTransporters();
      } catch (err) {
        console.error(`[email:bg] ${label} round ${round} error:`, err.message);
        resetTransporters();
      }
      if (round < BG_MAX_ROUNDS) await sleep(BG_ROUND_DELAY_MS * round);
    }
    console.error(`[email:bg] ${label} gave up after ${BG_MAX_ROUNDS} rounds`);
  });
}

module.exports = { runEmailInBackground };
