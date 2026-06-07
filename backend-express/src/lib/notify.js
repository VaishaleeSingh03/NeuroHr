const { Notification, User, JobApplication, getNextSeq } = require('../models');
const config = require('../config');
const { runEmailInBackground } = require('./emailAsync');
const { SCREENING_PASS_THRESHOLD, INTERVIEW_PASS_THRESHOLD } = require('./interviewOutcome');
const {
  stripHtml, buildCandidateOfferContext, buildAiInterviewRejectionContext, hrMeta,
} = require('./emailContext');

async function createNotification(userId, payload, io) {
  const id = await getNextSeq('notifications');
  const doc = await Notification.create({
    id,
    userId,
    type: payload.type || 'info',
    title: payload.title,
    message: payload.message,
    link: payload.link || '',
    meta: payload.meta || {},
    read: false,
  });

  if (io) {
    io.to(`user_${userId}`).emit('notification', {
      id: doc.id,
      type: doc.type,
      title: doc.title,
      message: doc.message,
      link: doc.link,
      createdAt: doc.createdAt,
    });
  }

  return doc;
}

async function notifyUsers(userIds, payload, io) {
  const unique = [...new Set(userIds.filter(Boolean))];
  return Promise.all(unique.map((uid) => createNotification(uid, payload, io)));
}

function buildRejectionNotificationPayload({
  jobTitle,
  finalScore,
  applicationId,
  jobId,
  interviewId,
  recommendation,
  customMessage,
}) {
  const role = jobTitle || 'the role';
  const scorePart = finalScore != null ? ` Interview score: ${Math.round(finalScore)}%.` : '';
  const message = customMessage?.trim()
    || `Your application for ${role} was not selected to move forward after the AI interview review.${scorePart} You can view the status under Job Openings.`;

  return {
    type: 'application_rejected',
    title: 'Application rejected',
    message,
    link: '/dashboard/job-openings',
    meta: {
      applicationId,
      jobId,
      interviewId,
      finalScore,
      recommendation,
      status: 'rejected',
    },
  };
}

async function sendCandidateRejectionEmail(details, user = null) {
  const email = details.candidateEmail || user?.email;
  if (!email) return { sent: false, reason: 'no_candidate_email' };
  const { sendHrGroqEmail } = require('./groqEmailService');
  const isScreening = details.reason === 'screening';
  if (isScreening) {
    return sendHrGroqEmail(email, 'screening_rejected_candidate', {
      ...hrMeta(),
      candidate_name: details.candidateName || user?.name || 'Candidate',
      job_title: details.jobTitle || 'the role',
      screening_score: `${Math.round(details.jdScore || 0)}/100`,
      threshold: SCREENING_PASS_THRESHOLD,
    });
  }
  const interviewCtx = buildAiInterviewRejectionContext(
    {
      candidateName: details.candidateName || user?.name,
      candidateEmail: email,
      jobTitle: details.jobTitle,
      jdScore: details.jdScore,
      matchedSkills: details.matchedSkills,
      recommendation: details.recommendation,
      screening: details.screening,
    },
    {
      interviewScore: details.finalScore,
      compositeScore: details.compositeScore,
      verdict: details.verdict,
      shortlistVerdict: details.shortlistVerdict,
    },
    { note: details.customMessage },
  );
  return sendHrGroqEmail(email, 'interview_rejected_candidate', interviewCtx);
}

async function notifyCandidateRejected(userId, details, io) {
  const payload = userId ? buildRejectionNotificationPayload(details) : null;
  if (userId && payload) {
    await notifyUsers([userId], payload, io);
  }

  const user = userId ? await User.findOne({ id: userId }).lean() : null;
  const email = details.candidateEmail || user?.email;
  if (email) {
    runEmailInBackground(
      () => sendCandidateRejectionEmail(details, user),
      `reject-email-${userId || email}`,
    );
  }
  return payload;
}

async function notifyInterviewScheduled({ userId, candidateEmail, candidateName, jobTitle, deadlineAt }, io) {
  const deadline = deadlineAt
    ? new Date(deadlineAt).toLocaleString()
    : 'the scheduled deadline';

  if (userId) {
    await notifyUsers([userId], {
      type: 'interview_scheduled',
      title: 'AI Interview Scheduled',
      message: `Your AI interview for ${jobTitle} is scheduled. Complete before ${deadline}.`,
      link: '/dashboard/interviews',
      meta: { jobTitle, deadlineAt },
    }, io);
  }

  if (candidateEmail) {
    const { sendHrGroqEmail } = require('./groqEmailService');
    runEmailInBackground(
      () => sendHrGroqEmail(candidateEmail, 'interview_scheduled', {
        ...hrMeta(),
        candidate_name: candidateName || 'Candidate',
        job_title: jobTitle,
        deadline,
        portal_url: `${config.appUrl}/dashboard/interviews`,
      }),
      `interview-scheduled-${candidateEmail}`,
    );
  }
}

async function notifyInterviewCompleted({ userId, candidateEmail, candidateName, jobTitle, rejected }, io) {
  if (userId) {
    const payload = rejected
      ? buildRejectionNotificationPayload({ jobTitle })
      : {
        type: 'interview_completed',
        title: 'Interview complete',
        message: `Your AI interview for ${jobTitle} has been evaluated. Our hiring team will review results within 2–3 business days.`,
        link: '/dashboard/interviews',
      };
    await notifyUsers([userId], payload, io);
  }

  if (candidateEmail && !rejected) {
    const { sendHrGroqEmail } = require('./groqEmailService');
    runEmailInBackground(
      () => sendHrGroqEmail(candidateEmail, 'interview_completed', {
        ...hrMeta(),
        candidate_name: candidateName || 'Candidate',
        job_title: jobTitle,
        portal_url: `${config.appUrl}/dashboard/interviews`,
      }),
      `interview-complete-${candidateEmail}`,
    );
  }
}

async function notifyHrInterviewResult({
  candidateName, jobTitle, interviewScore, compositeScore, screeningScore,
  verdict, shortlistVerdict, strengths, concerns, recommendation,
}, io) {
  const recruiters = await User.find({ role: { $in: ['hr_recruiter', 'management_admin'] } }).lean();
  const hrIds = recruiters.map((u) => u.id);
  const headline = shortlistVerdict || verdict || 'Review';
  if (hrIds.length) {
    await notifyUsers(hrIds, {
      type: 'interview_hr_review',
      title: `Interview result: ${candidateName}`,
      message: `${candidateName} — interview ${Math.round(interviewScore || 0)}%, composite ${Math.round(compositeScore || 0)}% (${headline}). Pass or reject in Applications.`,
      link: '/dashboard/applications',
      meta: {
        interviewScore, compositeScore, verdict, shortlistVerdict, recommendation,
      },
    }, io);
  }
  const hrEmail = config.hrEmail;
  if (hrEmail) {
    const { sendHrGroqEmail } = require('./groqEmailService');
    runEmailInBackground(
      () => sendHrGroqEmail(hrEmail, 'interview_result_hr', {
        ...hrMeta(),
        candidate_name: candidateName,
        job_title: jobTitle,
        interview_score: `${Math.round(interviewScore || 0)}/100`,
        composite_score: `${Math.round(compositeScore || 0)}/100`,
        screening_score: `${Math.round(screeningScore || 0)}/100`,
        verdict: verdict || 'Unknown',
        shortlist_verdict: shortlistVerdict || '',
        strengths: (strengths || []).join(', '),
        concerns: (concerns || []).join(', '),
        recommendation: recommendation || 'N/A',
        applications_url: `${config.appUrl}/dashboard/applications`,
      }),
      `interview-result-hr-${candidateName}`,
    );
  }
}

async function emailRecruiterMessage({ candidateEmail, candidateName, jobTitle, message }) {
  if (!candidateEmail) return { sent: false, reason: 'no_candidate_email' };
  const { sendHrGroqEmail } = require('./groqEmailService');
  return sendHrGroqEmail(candidateEmail, 'recruiter_message', {
    ...hrMeta(),
    candidate_name: candidateName || 'Candidate',
    job_title: jobTitle,
    message: stripHtml(message || '').slice(0, 3000),
  });
}

async function notifyHumanInterviewScheduled(app, aiInterview) {
  const { buildStaticInterviewerBriefing } = require('./interviewerBriefing');
  const { getResumeAttachment } = require('./resumeAttachment');
  const { sendHrGroqEmail } = require('./groqEmailService');
  const hi = app.humanInterview || {};
  const resumeAttachment = getResumeAttachment(app);
  const interviewerAttachments = resumeAttachment
    ? [{
      filename: resumeAttachment.filename,
      content: resumeAttachment.content,
      contentType: resumeAttachment.contentType,
    }]
    : [];

  const meetLink = hi.meetLink?.startsWith('http') ? hi.meetLink : '';
  const interviewScore = aiInterview?.interviewScore != null
    ? Math.round(aiInterview.interviewScore)
    : null;
  const compositeScore = aiInterview?.compositeScore != null
    ? Math.round(aiInterview.compositeScore)
    : null;
  const screeningScore = aiInterview?.screeningScore != null
    ? Math.round(aiInterview.screeningScore)
    : Math.round(app.jdScore || app.screening?.total_score || 0);

  const sendTasks = [];

  if (app.candidateEmail) {
    sendTasks.push(
      sendHrGroqEmail(app.candidateEmail, 'human_interview_candidate', {
        ...hrMeta(),
        candidate_name: app.candidateName || 'Candidate',
        job_title: app.jobTitle,
        interview_date: hi.interviewDate,
        interview_time: hi.interviewTime,
        duration_minutes: hi.durationMinutes || 60,
        meet_link: meetLink,
        interviewers: (hi.interviewers || []).map((i) => i.name).join(', '),
        notes: stripHtml(hi.notes || '').slice(0, 1000),
      }),
    );
  }

  for (const interviewer of hi.interviewers || []) {
    if (!interviewer.email) continue;
    const { html: briefingHtml } = buildStaticInterviewerBriefing(app, aiInterview, interviewer);
    sendTasks.push(
      sendHrGroqEmail(
        interviewer.email,
        'human_interview_interviewer',
        {
          ...hrMeta(),
          interviewer_name: interviewer.name || 'Interviewer',
          interviewer_role: interviewer.role || interviewer.designation || 'Panel Member',
          candidate_name: app.candidateName,
          job_title: app.jobTitle,
          interview_date: hi.interviewDate,
          interview_time: hi.interviewTime,
          duration_minutes: hi.durationMinutes || 60,
          meet_link: meetLink,
          interview_score: interviewScore,
          composite_score: compositeScore,
          screening_score: screeningScore,
          ai_verdict: aiInterview?.verdict || aiInterview?.shortlistVerdict,
          briefing_html: briefingHtml,
          matched_skills: (app.matchedSkills || []).join(', '),
          jd_score: app.jdScore,
        },
        interviewerAttachments,
      ),
    );
  }

  const results = await Promise.all(sendTasks);
  const invitesSent = results.filter((r) => r.sent).length;

  return { invitesSent, resumeAttached: !!resumeAttachment, resumeSentTo: 'interviewers_only' };
}

async function sendCandidateOfferEmail(app) {
  const { normalizeRecipient } = require('./emailService');
  const to = normalizeRecipient(app.candidateEmail);
  if (!to) return { sent: false, reason: 'no_candidate_email' };
  const ctx = await buildCandidateOfferContext(app);
  const { sendHrGroqEmail } = require('./groqEmailService');
  console.log(`[email] Sending offer letter to ${to} (app ${app.id})`);
  const result = await sendHrGroqEmail(to, 'offer_letter', ctx);
  if (!result.sent) {
    console.error(`[email] Offer letter failed for app ${app.id}:`, result.reason);
  }
  return {
    ...result,
    offerLetterHtml: result.html,
    offerLetterSubject: result.subject,
  };
}

async function sendFinalDecisionEmails(app) {
  const fd = app.finalDecision || {};
  const selected = fd.decision === 'selected';
  let candidateEmailResult = { sent: false, reason: 'no_candidate_email' };

  if (app.candidateEmail) {
    const { sendHrGroqEmail } = require('./groqEmailService');
    if (selected) {
      candidateEmailResult = await sendCandidateOfferEmail(app);
    } else {
      candidateEmailResult = await sendHrGroqEmail(app.candidateEmail, 'offer_rejected_candidate', {
        ...(await buildCandidateOfferContext(app)),
        hr_message: stripHtml(fd.message || '').slice(0, 1500),
      });
    }
  }

  return {
    candidateEmailSent: candidateEmailResult.sent,
    candidateEmailError: candidateEmailResult.reason,
    recipient: app.candidateEmail || null,
    offerLetterHtml: candidateEmailResult.offerLetterHtml || null,
    offerLetterSubject: candidateEmailResult.offerLetterSubject || null,
  };
}

async function notifyFinalDecision(app, io) {
  const fd = app.finalDecision || {};
  const userId = app.userId || (await User.findOne({ email: app.candidateEmail }).lean())?.id;
  const selected = fd.decision === 'selected';

  if (userId) {
    await notifyUsers([userId], {
      type: selected ? 'offer_pending' : 'application_rejected',
      title: selected ? 'Offer letter — action required' : 'Application update',
      message: selected
        ? `You have been selected for ${app.jobTitle}! Check your email and accept or decline the offer in Job Openings.`
        : `Thank you for interviewing for ${app.jobTitle}. We will not be moving forward.`,
      link: '/dashboard/job-openings',
    }, io);
  }

  const appId = app.id;
  // Send synchronously — offer/rejection must complete before API response (Render drops bg work).
  const emailResult = await sendFinalDecisionEmails(app);

  if (selected && emailResult.candidateEmailSent) {
    const update = { 'finalDecision.offerEmailSentAt': new Date() };
    if (emailResult.offerLetterHtml) {
      update['finalDecision.offerLetterHtml'] = emailResult.offerLetterHtml;
      update['finalDecision.offerLetterSubject'] = emailResult.offerLetterSubject
        || `Offer — ${app.jobTitle}`;
    }
    await JobApplication.updateOne({ id: appId }, { $set: update });
  }

  if (!emailResult.candidateEmailSent) {
    console.error(
      `[email] Offer/final decision not sent for app ${appId}:`,
      emailResult.candidateEmailError || 'unknown',
    );
  }

  return {
    candidateEmailSent: emailResult.candidateEmailSent,
    candidateEmailError: emailResult.candidateEmailError,
    email_queued: false,
    recipient: emailResult.recipient,
    offerLetterHtml: emailResult.offerLetterHtml,
    offerLetterSubject: emailResult.offerLetterSubject,
  };
}

async function notifyOfferResponse(app, response, { candidateNote, onboardResult } = {}, io) {
  const ctx = await buildCandidateOfferContext(app, { onboardResult });
  const { sendAgentGroqEmail } = require('./groqEmailService');
  const accepted = response === 'accepted';

  const userId = app.userId || (await User.findOne({ email: app.candidateEmail }).lean())?.id;
  if (userId) {
    await notifyUsers([userId], {
      type: accepted ? 'hired' : 'offer_declined',
      title: accepted ? 'Welcome aboard!' : 'Offer declined',
      message: accepted
        ? `You are now an employee at ${config.orgName}. Check your email for next steps.`
        : `You declined the offer for ${app.jobTitle}. You can browse other roles in Job Openings.`,
      link: accepted ? '/dashboard' : '/dashboard/job-openings',
    }, io);
  }

  let hrEmailSent = false;
  let hrEmailError = null;
  if (config.hrEmail) {
    const hrType = accepted ? 'offer_accepted_hr' : 'offer_rejected_hr';
    const hrCtx = {
      ...ctx,
      offer_response: accepted ? 'ACCEPTED' : 'DECLINED',
      candidate_note: candidateNote || '—',
      responded_at: new Date().toISOString(),
      action_required: accepted
        ? 'Complete onboarding paperwork and assign manager'
        : 'Consider reopening the role or contacting backup candidates',
    };
    try {
      const result = await sendAgentGroqEmail(config.hrEmail, hrType, hrCtx);
      hrEmailSent = Boolean(result.sent);
      hrEmailError = result.sent ? null : (result.reason || 'send_failed');
      if (!result.sent) {
        console.error(`[email] Offer response HR mail failed (app ${app.id}):`, hrEmailError);
      }
    } catch (err) {
      hrEmailError = err.message;
      console.error(`[email] Offer response HR mail error (app ${app.id}):`, err.message);
    }
  } else {
    hrEmailError = 'hr_email_not_configured';
  }

  return {
    hrEmailSent,
    hrEmailError,
    email_queued: false,
    response: accepted ? 'accepted' : 'rejected',
  };
}

module.exports = {
  createNotification,
  notifyUsers,
  buildRejectionNotificationPayload,
  notifyCandidateRejected,
  notifyInterviewScheduled,
  notifyInterviewCompleted,
  notifyHrInterviewResult,
  emailRecruiterMessage,
  notifyHumanInterviewScheduled,
  notifyFinalDecision,
  sendFinalDecisionEmails,
  sendCandidateOfferEmail,
  notifyOfferResponse,
};
