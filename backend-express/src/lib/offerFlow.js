const TERMINAL_OFFER_STATUSES = new Set(['rejected', 'offer_declined']);

function offerDecision(app) {
  return app?.finalDecision || {};
}

/** True when candidate may accept or decline an outstanding offer. */
function isAwaitingOfferResponse(app) {
  if (!app) return false;
  const fd = offerDecision(app);
  if (fd.decision !== 'selected') return false;
  if (TERMINAL_OFFER_STATUSES.has(app.status)) return false;
  if (app.status === 'hired' && fd.offerResponse === 'accepted') return false;
  if (fd.offerResponse && fd.offerResponse !== 'pending') return false;
  if (app.status === 'rejected' || fd.decision === 'rejected') return false;
  if (app.aiInterviewReview?.decision === 'rejected') return false;
  return true;
}

/** Repeat accept/decline after success — e.g. double-click or retry onboarding. */
function isOfferResponseIdempotent(app, response) {
  const fd = offerDecision(app);
  if (response === 'accepted') {
    return app.status === 'hired' && fd.offerResponse === 'accepted';
  }
  if (response === 'rejected') {
    return app.status === 'offer_declined' && fd.offerResponse === 'rejected';
  }
  return false;
}

module.exports = {
  isAwaitingOfferResponse,
  isOfferResponseIdempotent,
};
