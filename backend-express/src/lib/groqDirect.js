const axios = require('axios');
const config = require('../config');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const EMAIL_TIMEOUT_MS = 12000;

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

function capMaxTokens(system, user, maxTokens) {
  const budget = config.groqRequestTokenBudget || 5500;
  const available = budget - estimateTokens(system) - estimateTokens(user) - 80;
  return Math.min(maxTokens, Math.max(256, available));
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

async function groqJson(system, user, { maxTokens = 2048, model } = {}) {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }
  const capped = capMaxTokens(system, user, maxTokens);
  const { data } = await axios.post(
    GROQ_URL,
    {
      model: model || config.groqModelFast || 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.35,
      response_format: { type: 'json_object' },
      max_tokens: capped,
    },
    {
      headers: {
        Authorization: `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: EMAIL_TIMEOUT_MS,
    },
  );
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJson(content);
  if (!parsed) throw new Error('Groq returned non-JSON email payload');
  return parsed;
}

function geminiUrl() {
  const model = config.geminiModel || 'gemini-2.0-flash';
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function geminiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = config.geminiApiKey || '';
  if (key) headers['x-goog-api-key'] = key;
  return headers;
}

async function geminiJson(system, user, { maxTokens = 2048 } = {}) {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY not configured');
  const { data } = await axios.post(
    geminiUrl(),
    {
      systemInstruction: { parts: [{ text: `${system} Reply with ONE valid JSON object only.` }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    },
    { headers: geminiHeaders(), timeout: EMAIL_TIMEOUT_MS },
  );
  const parsed = extractJson(data?.candidates?.[0]?.content?.parts?.[0]?.text);
  if (!parsed) throw new Error('Gemini returned non-JSON email payload');
  return parsed;
}

async function llmJson(system, user, opts = {}) {
  const jsonSystem = `${system} Reply with ONE valid JSON object only.`;
  if (config.groqApiKey) {
    try {
      return { ...(await groqJson(jsonSystem, user, opts)), generated_by: 'groq_direct' };
    } catch (err) {
      if (!config.geminiApiKey) throw err;
    }
  }
  if (config.geminiApiKey) {
    return { ...(await geminiJson(jsonSystem, user, opts)), generated_by: 'gemini_direct' };
  }
  throw new Error('GROQ_API_KEY or GEMINI_API_KEY required');
}

async function generateHrEmailDirect(emailType, context = {}) {
  const instruction = EMAIL_INSTRUCTIONS[emailType]
    || 'Write a professional HR email with a details table.';
  const ctx = JSON.stringify(context).slice(0, 7000);
  const prompt = (
    `Email type: ${emailType}\n`
    + `Organization: ${context.org_name || config.orgName}\n`
    + `Context JSON:\n${ctx}\n\n`
    + `${instruction}\n${EMAIL_STYLES}\n${DETAILS_TABLE}\n\n`
    + 'Return JSON: subject (string), html (string fragment), preview_text (string).'
  );
  const maxTokens = emailType === 'payslip' ? 2560 : 2048;
  const model = config.groqModelStrong || config.groqModelFast;
  const result = await llmJson(
    'Expert HR communications writer. Output JSON only. Keep html concise.',
    prompt,
    { maxTokens, model },
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

module.exports = { generateHrEmailDirect, groqJson, geminiJson, llmJson };
