const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const config = require('../config');

const client = axios.create({ baseURL: config.mlServiceUrl, timeout: 120000 });

function formatMlError(err) {
  const code = err.code || '';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return 'Cannot connect to ML service on port 8001. Start it: cd ml-service && python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload';
  }
  const detail = err.response?.data?.detail;
  if (!detail) return err.message || 'ML service error';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join('; ');
  }
  return String(detail);
}

function wrapMlError(err, fallback = 'ML service error') {
  const wrapped = new Error(formatMlError(err) || fallback);
  wrapped.status = err.response?.status === 422 ? 422 : (err.response?.status || 500);
  wrapped.response = err.response;
  return wrapped;
}

async function parseResume(filePath, filename) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), filename);
  try {
    const { data } = await client.post('/api/resume/parse', form, { headers: form.getHeaders() });
    return data;
  } catch (err) {
    throw wrapMlError(err, 'Resume parsing failed');
  }
}

async function screenResume(parsed, jobContext = {}) {
  const ctx = typeof jobContext === 'string'
    ? { job_description: jobContext }
    : jobContext;
  try {
    const { data } = await client.post('/api/resume/screen', {
      parsed_resume: parsed,
      job_description: ctx.job_description || ctx.description || '',
      job_title: ctx.job_title || ctx.title || '',
      job_skills: ctx.job_skills || ctx.skills || [],
      job_nice_to_have: ctx.job_nice_to_have || ctx.nice_to_have_skills || [],
      job_experience_level: ctx.job_experience_level || ctx.experience_level || ctx.experienceLevel || '2 years',
    });
    return data;
  } catch (err) {
    throw wrapMlError(err, 'Groq resume screening failed');
  }
}

async function analyzeJD(description, company = '') {
  try {
    const { data } = await client.post('/api/jd/analyze', { description, company });
    return data;
  } catch (err) {
    throw wrapMlError(err, 'Groq JD analysis failed');
  }
}

async function generateJDFromKB({ role_title, experience_level, department, feedback }) {
  try {
    const { data } = await client.post('/api/jd/generate-from-kb', {
      role_title,
      experience_level: experience_level || '2 years',
      department: department || 'Engineering',
      feedback: feedback || '',
    });
    return data;
  } catch (err) {
    throw wrapMlError(err, 'Groq JD generation failed');
  }
}

async function kbStatus() {
  const { data } = await client.get('/api/knowledgebase/status');
  return data;
}

async function generateQuestions(jobTitle, skills, count = 5, jobDescription = '') {
  const { data } = await client.post('/api/interview/generate-questions', {
    job_title: jobTitle,
    skills,
    count,
    job_description: jobDescription,
  });
  return data;
}

async function generateTailoredQuestions(payload) {
  try {
    const { data } = await client.post('/api/interview/generate-tailored-questions', payload);
    return data;
  } catch (err) {
    throw wrapMlError(err, 'Groq interview question generation failed');
  }
}

async function analyzeAnswer(question, answer, jobContext) {
  const { data } = await client.post('/api/interview/analyze-answer', { question, answer, job_context: jobContext });
  return data;
}

async function analyzeVideo(imageBase64) {
  const { data } = await client.post('/api/interview/analyze-video', { image: imageBase64 });
  return data;
}

async function analyzeFullInterview(payload) {
  const { data } = await client.post('/api/interview/analyze-full', payload);
  return data;
}

async function generateInterviewerBriefing(payload) {
  const { data } = await client.post('/api/interview/interviewer-briefing', payload, { timeout: 90000 });
  return data;
}

async function trainModel(filePath, cfg, filename = 'dataset.csv') {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), filename);
  form.append('model_name', cfg.model_name || 'custom_model');
  form.append('algorithm', cfg.algorithm || 'random_forest');
  form.append('target_column', cfg.target_column || 'label');
  form.append('hyperparameter_tuning', cfg.tuning || cfg.hyperparameter_tuning || 'grid_search');
  const { data } = await client.post('/api/ml/train-upload', form, { headers: form.getHeaders() });
  return data;
}

async function predict(modelPath, features) {
  const { data } = await client.post('/api/ml/predict', { model_path: modelPath, features });
  return data;
}

async function chat(message, context = {}) {
  const payload = typeof context === 'string'
    ? { text: context, role: 'employee', candidates: [] }
    : {
        text: context.text || '',
        role: context.role || 'employee',
        candidates: context.candidates || [],
      };
  const { data } = await client.post('/api/chat', { message, context: payload });
  return data;
}

async function generateOnboarding(candidateData, position) {
  const { data } = await client.post('/api/onboarding/generate', { candidate_data: candidateData, position });
  const map = (p) => ({
    offer_letter: p.offer_letter,
    documents_checklist: p.documentation || p.joining_checklist || [],
    training_roadmap: p.training_plan || {},
    plan_30: p.day_30_plan || p.day30Plan,
    plan_60: p.day_60_plan || p.day60Plan,
    plan_90: p.day_90_plan || p.day90Plan,
  });
  return map(data);
}

async function analyzeDocument(filePath, docType) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('document_type', docType);
  const { data } = await client.post('/api/document/analyze', form, { headers: form.getHeaders() });
  return data;
}

async function predictPerformance(employeeData) {
  const { data } = await client.post('/api/hr/predict-performance', { employee_data: employeeData });
  return data;
}

async function verifyFace(imageBase64) {
  const { data } = await client.post('/api/attendance/verify-face', { image: imageBase64 });
  return data;
}

async function payrollAnomaly(payrollData) {
  const { data } = await client.post('/api/payroll/anomaly-detect', { payroll_data: payrollData });
  return data;
}

async function suggestSalary(payload) {
  const { data } = await client.post('/api/payroll/suggest-salary', payload);
  return data;
}

async function calculatePayroll(payload) {
  const { data } = await client.post('/api/payroll/calculate', payload);
  return data;
}

async function generateHrEmail(payload) {
  try {
    const { data } = await client.post('/api/hr/generate-email', payload);
    return data;
  } catch (err) {
    throw wrapMlError(err, 'Groq HR email generation failed');
  }
}

module.exports = {
  parseResume, screenResume, analyzeJD, generateJDFromKB, kbStatus,
  generateQuestions, generateTailoredQuestions, analyzeAnswer, analyzeVideo, analyzeFullInterview,
  generateInterviewerBriefing,
  trainModel, predict, chat, generateOnboarding, analyzeDocument,
  predictPerformance, verifyFace, payrollAnomaly, suggestSalary, calculatePayroll, generateHrEmail,
};
