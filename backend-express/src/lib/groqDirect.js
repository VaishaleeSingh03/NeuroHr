const axios = require('axios');
const config = require('../config');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const EMAIL_TIMEOUT_MS = 25000;

const EMAIL_STYLES = (
  'Output a BODY FRAGMENT only (no <html>/<head>/<body>). '
  + 'Brand: aqua #00B8B8, heading #0D4F4F, cream #FFF4DE, body #334155. '
  + 'Inline styles; mobile-friendly tables width 100%; word-break break-word.'
);

const DETAILS_TABLE = (
  'Include <table class="email-stack" role="presentation" style="width:100%;border-collapse:collapse"> '
  + 'with label/value rows for every relevant Context field.'
);

const HR_TO_HR = (
  'Internal notification TO HR from the HR Agent mailbox. '
  + 'One-line summary, details table, action required + dashboard link.'
);

const EMAIL_INSTRUCTIONS = {
  leave_request: `${HR_TO_HR} Employee LEAVE REQUEST with employee_name, employee_id, leave_type, date_range, days_requested, leave_balances, reason.`,
  reimbursement_request: `${HR_TO_HR} REIMBURSEMENT claim with employee_name, claim_id, category, formatted_amount, description.`,
  interview_scheduled: 'Email TO candidate: AI interview scheduled with job_title, deadline, portal link.',
  interview_completed: 'Email TO candidate: interview submitted; HR reviews in 2-3 business days.',
  human_interview_candidate: 'Email TO candidate: human panel details with date, time, meet_link, interviewers.',
  human_interview_interviewer: 'Email TO interviewer: panel briefing with scores and briefing_html.',
  interview_result_hr: `${HR_TO_HR} AI interview completed — review in Applications.`,
  recruiter_message: 'Email TO candidate with recruiter custom message.',
  offer_letter: 'Formal OFFER LETTER with salary, start_date, portal accept/decline link.',
  interview_rejected_candidate: 'Professional rejection after AI interview review.',
  screening_rejected_candidate: 'Professional rejection after resume screening.',
  offer_rejected_candidate: 'Respectful rejection after final round.',
  offer_accepted_hr: `${HR_TO_HR} Candidate ACCEPTED offer — employee onboarded.`,
  offer_rejected_hr: `${HR_TO_HR} Candidate DECLINED offer.`,
};

function estimateTokens(text = '') {
  return Math.max(1, Math.floor(String(text).length / 4));
}

function capMaxTokens(system, user, maxTokens, minFloor = 512) {
  const budget = config.groqRequestTokenBudget || 5500;
  const available = budget - estimateTokens(system) - estimateTokens(user) - 80;
  return Math.min(maxTokens, Math.max(minFloor, available));
}

function extractJson(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return JSON.parse(fence[1].trim());
      } catch {
        return null;
      }
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function groqChatOnce(system, user, { maxTokens, model, jsonMode }) {
  const capped = capMaxTokens(system, user, maxTokens);
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.35,
    max_tokens: capped,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const { data } = await axios.post(GROQ_URL, body, {
    headers: {
      Authorization: `Bearer ${config.groqApiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: EMAIL_TIMEOUT_MS,
  });
  return data?.choices?.[0]?.message?.content;
}

async function groqJson(system, user, { maxTokens = 2048, model } = {}) {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const jsonSystem = (
    `${system} Reply with ONE valid JSON object only. `
    + 'Every key must be double-quoted. No markdown fences.'
  );
  const models = [...new Set([
    model || config.groqModelFast || 'llama-3.1-8b-instant',
    config.groqModelStrong || config.groqModelFast,
  ].filter(Boolean))];

  const errors = [];
  for (const m of models) {
    for (const jsonMode of [true, false]) {
      try {
        const content = await groqChatOnce(jsonSystem, user, { maxTokens, model: m, jsonMode });
        const parsed = extractJson(content);
        if (parsed) return parsed;
        errors.push(`${m}(json=${jsonMode}):non-json`);
      } catch (err) {
        errors.push(`${m}(json=${jsonMode}):${err.message}`);
      }
    }
  }
  throw new Error(`Groq email JSON failed: ${errors.join(' | ')}`);
}

async function llmJson(system, user, opts = {}) {
  return { ...(await groqJson(system, user, opts)), generated_by: 'groq_direct' };
}

async function generateHrEmailDirect(emailType, context = {}) {
  const instruction = EMAIL_INSTRUCTIONS[emailType]
    || 'Write a professional HR email with a details table.';
  const ctx = JSON.stringify(context).slice(0, 5000);
  const prompt = (
    `Email type: ${emailType}\n`
    + `Organization: ${context.org_name || config.orgName}\n`
    + `Context JSON:\n${ctx}\n\n`
    + `${instruction}\n${EMAIL_STYLES}\n${DETAILS_TABLE}\n\n`
    + 'Return JSON: subject (string), html (string fragment), preview_text (string).'
  );
  const maxTokens = emailType === 'payslip' ? 2560 : 2048;
  const result = await llmJson(
    'Expert HR communications writer. Output JSON only. Keep html concise.',
    prompt,
    { maxTokens },
  );
  if (!result?.subject || !result?.html) {
    throw new Error('Groq email missing subject or html');
  }
  return {
    subject: String(result.subject).trim(),
    html: String(result.html).trim(),
    preview_text: String(result.preview_text || '').trim(),
    generated_by: result.generated_by || 'groq_direct',
  };
}

module.exports = { generateHrEmailDirect, groqJson, llmJson };
