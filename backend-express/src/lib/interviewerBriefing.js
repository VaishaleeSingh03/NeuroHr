/** Interviewer briefing — great-harness-agent offers.py Sub-Agent 2 style. */

const ml = require('../services/mlClient');

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function listItems(items) {
  if (!items?.length) return '<p><em>None noted</em></p>';
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

function extractCandidateAnswers(interview) {
  const fromTranscript = (interview?.harnessTranscript || [])
    .filter((m) => m.speaker === 'You' || m.speaker === 'Candidate')
    .map((m) => m.text)
    .filter(Boolean);
  if (fromTranscript.length) return fromTranscript.slice(0, 8);

  return (interview?.qaLog || interview?.answers || [])
    .map((a) => a.answer || a.transcript || '')
    .filter((t) => String(t).trim().length > 10)
    .slice(0, 8);
}

function buildSuggestedQuestions(app, interview) {
  const fromInterview = (interview?.questions || [])
    .slice(0, 4)
    .map((q) => (typeof q === 'string' ? q : q.question))
    .filter(Boolean);
  const gaps = app.screening?.key_gaps || app.missingSkills || [];
  const gapQs = gaps.slice(0, 3).map((g) => `Probe depth on: ${g}`);
  const projectQ = app.parsedData?.experience?.[0]
    ? `Deep-dive: ${app.parsedData.experience[0].title || 'recent role'} at ${app.parsedData.experience[0].company || 'previous company'}`
    : 'Walk through your most complex recent project end-to-end';
  return [projectQ, ...fromInterview, ...gapQs].slice(0, 10);
}

function dimensionRows(interview) {
  const rows = [
    ['Technical depth', interview?.technicalScore],
    ['Communication', interview?.communicationScore],
    ['Problem solving', interview?.problemSolvingScore],
    ['Culture fit', interview?.cultureFitScore],
    ['Experience depth', interview?.experienceDepthScore],
    ['JD alignment', interview?.jdAlignmentScore],
  ];
  return rows.filter(([, v]) => v != null && v > 0);
}

function buildStaticInterviewerBriefing(app, interview, interviewer = {}) {
  const screening = app.screening || {};
  const interviewScore = Math.round(interview?.interviewScore || 0);
  const compositeScore = Math.round(interview?.compositeScore || interview?.finalScore || 0);
  const jdScore = Math.round(app.jdScore || screening.total_score || screening.ai_score || 0);
  const verdict = interview?.verdict || 'Review';
  const shortlistVerdict = interview?.shortlistVerdict || '';
  const strengths = screening.top_strengths || app.matchedSkills || interview?.topStrengths || [];
  const gaps = screening.key_gaps || app.missingSkills || [];
  const aiConcerns = interview?.concerns || [];
  const redFlags = screening.red_flags || [];
  const questions = buildSuggestedQuestions(app, interview);
  const feedback = interview?.aiFeedback || interview?.recommendation || '';
  const perAnswer = (interview?.perAnswerFeedback || []).slice(0, 5);
  const candidateAnswers = extractCandidateAnswers(interview);
  const jdSummary = app.jdFitSummary || screening.decision_note || screening.jd_fit_summary || '';
  const dims = dimensionRows(interview);
  const skills = app.skills || app.parsedData?.skills || screening.extracted_summary?.skills || [];
  const expYears = app.parsedData?.experience_years
    || screening.harness_profile?.total_experience_years
    || screening.extracted_summary?.experience_years;

  const html = `
    <div style="background:#fafafa;padding:16px;border-radius:8px;line-height:1.7;font-size:14px">
      <h4 style="margin:0 0 8px;color:#0D4F4F">1. Candidate snapshot</h4>
      <p>
        <strong>${esc(app.candidateName)}</strong> applied for <strong>${esc(app.jobTitle)}</strong>.
        ${expYears != null ? `Experience: ~${expYears} years.` : ''}
        ${skills.length ? `Tech stack: ${esc(skills.slice(0, 10).join(', '))}.` : ''}
        ${shortlistVerdict ? `<br><span style="color:#00B8B8">${esc(shortlistVerdict)}</span>` : ''}
      </p>

      <h4 style="margin:16px 0 8px;color:#0D4F4F">2. Resume screening highlights</h4>
      <p>Score: <strong>${jdScore}/100</strong> · Verdict: <strong>${esc(screening.verdict || app.recommendation || 'Reviewed')}</strong></p>
      ${jdSummary ? `<p style="background:#fff;padding:10px;border-radius:6px;border:1px solid #e7e5e4">${esc(jdSummary)}</p>` : ''}
      <p><strong>Strong areas</strong></p>
      ${listItems(strengths.slice(0, 5))}
      <p><strong>Areas needing verification</strong></p>
      ${listItems(gaps.slice(0, 5))}
      ${redFlags.length ? `<p><strong>Red flags</strong></p>${listItems(redFlags)}` : ''}

      <h4 style="margin:16px 0 8px;color:#0D4F4F">3. AI interview — how they passed</h4>
      <p>
        Interview: <strong>${interviewScore}/100</strong> · Verdict: <strong>${esc(verdict)}</strong><br>
        Composite: <strong>${compositeScore}/100</strong> (80% screening ${jdScore}% + 20% interview ${interviewScore}%)
      </p>
      ${dims.length ? `<p>${dims.map(([l, v]) => `${l}: ${Math.round(v)}/100`).join(' · ')}</p>` : ''}
      ${feedback ? `<p style="background:#fff;padding:10px;border-radius:6px;border:1px solid #e7e5e4"><strong>Manager summary:</strong> ${esc(feedback)}</p>` : ''}
      ${aiConcerns.length ? `<p><strong>AI concerns</strong></p>${listItems(aiConcerns)}` : ''}

      ${candidateAnswers.length ? `
        <h4 style="margin:16px 0 8px;color:#0D4F4F">Key answers from AI interview</h4>
        <ul>${candidateAnswers.map((a) => `<li style="margin-bottom:6px">${esc(String(a).slice(0, 280))}</li>`).join('')}</ul>
      ` : ''}

      <h4 style="margin:16px 0 8px;color:#0D4F4F">4. Suggested questions for ${esc(interviewer.name || 'you')}</h4>
      <ol>${questions.map((q) => `<li style="margin-bottom:8px">${esc(q)}<br><span style="color:#666;font-size:12px">What to look for: depth, specifics, trade-offs, real ownership.</span></li>`).join('')}</ol>

      ${perAnswer.length ? `
        <h4 style="margin:16px 0 8px;color:#0D4F4F">Per-answer notes from AI interview</h4>
        ${perAnswer.map((a) => `<p style="font-size:12px;margin-bottom:8px"><strong>Q:</strong> ${esc(a.question)}<br><strong>Feedback:</strong> ${esc(a.feedback)}</p>`).join('')}
      ` : ''}

      <h4 style="margin:16px 0 8px;color:#0D4F4F">5. Evaluation criteria (rate 1–5 after session)</h4>
      <ul>
        <li><strong>Technical depth</strong> — Can they explain architecture and implementation details?</li>
        <li><strong>Problem solving</strong> — Structured thinking under pressure?</li>
        <li><strong>Communication</strong> — Clear, concise explanations?</li>
        <li><strong>Culture fit</strong> — Alignment with team values and collaboration style?</li>
      </ul>
    </div>
  `;

  return { html, text: html.replace(/<[^>]+>/g, ' ') };
}

function toMlPayload(app, interview, interviewer) {
  return {
    candidate_name: app.candidateName,
    job_title: app.jobTitle,
    interviewer_name: interviewer.name || 'Interviewer',
    interviewer_role: interviewer.role || interviewer.designation || 'Panel Member',
    application: {
      jd_score: app.jdScore,
      jd_fit_summary: app.jdFitSummary,
      recommendation: app.recommendation,
      matched_skills: app.matchedSkills,
      missing_skills: app.missingSkills,
      skills: app.skills,
      parsed_data: app.parsedData,
    },
    screening: app.screening || {},
    interview: {
      interview_score: interview?.interviewScore,
      composite_score: interview?.compositeScore,
      verdict: interview?.verdict,
      shortlist_verdict: interview?.shortlistVerdict,
      recommendation: interview?.recommendation,
      ai_feedback: interview?.aiFeedback,
      concerns: interview?.concerns,
      top_strengths: interview?.topStrengths,
      technical_score: interview?.technicalScore,
      communication_score: interview?.communicationScore,
      problem_solving_score: interview?.problemSolvingScore,
      culture_fit_score: interview?.cultureFitScore,
      experience_depth_score: interview?.experienceDepthScore,
      jd_alignment_score: interview?.jdAlignmentScore,
      harness_transcript: interview?.harnessTranscript,
      answers: interview?.answers,
      qa_log: interview?.qaLog,
      per_answer_feedback: interview?.perAnswerFeedback,
    },
  };
}

async function buildInterviewerBriefing(app, interview, interviewer = {}) {
  const result = await ml.generateInterviewerBriefing(toMlPayload(app, interview, interviewer));
  if (!result?.briefing_html) {
    throw new Error('Groq interviewer briefing failed — no content returned. Check GROQ_API_KEY and ml-service.');
  }
  return { html: result.briefing_html, text: result.briefing_html, generatedBy: result.generated_by || 'groq' };
}

module.exports = {
  buildInterviewerBriefing,
  buildStaticInterviewerBriefing,
  buildSuggestedQuestions,
  extractCandidateAnswers,
};
