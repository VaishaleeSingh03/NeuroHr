const bcrypt = require('bcryptjs');
const {
  User, Employee, Job, Candidate, Interview, Attendance, Leave,
  Payroll, Performance, Onboarding, AIModel, JobApplication, Notification,
  ChatHistory, getNextSeq,
} = require('../models');

const DEMO_COLLECTIONS = [
  'users', 'employees', 'jobs', 'candidates', 'interviews', 'jobapplications',
  'attendances', 'leaves', 'payrolls', 'performances', 'onboardings', 'aimodels', 'notifications',
];

async function clearDemoData() {
  await Promise.all([
    Notification.deleteMany({}),
    JobApplication.deleteMany({}),
    Interview.deleteMany({}),
    Candidate.deleteMany({}),
    Job.deleteMany({}),
    Employee.deleteMany({}),
    Attendance.deleteMany({}),
    Leave.deleteMany({}),
    Payroll.deleteMany({}),
    Performance.deleteMany({}),
    Onboarding.deleteMany({}),
    AIModel.deleteMany({}),
    ChatHistory.deleteMany({}).catch(() => {}),
    User.deleteMany({}),
  ]);
  console.log('Cleared all hiring data from MongoDB (users, jobs, candidates, employees, interviews)');
}

async function seedUsers() {
  const users = [
    {
      name: 'HR Admin',
      email: 'vaishaleeaiml@gmail.com',
      password: '123456',
      role: 'management_admin',
    },
  ];
  let created = 0;
  for (const u of users) {
    if (await User.findOne({ email: u.email })) continue;
    const id = await getNextSeq('users');
    await User.create({
      id, name: u.name, email: u.email,
      passwordHash: await bcrypt.hash(u.password, 10),
      role: u.role, permissions: [],
    });
    created++;
  }
  return created;
}

async function seedEmployees() {
  const manager = await User.findOne({ email: 'manager@neurohr.com' });
  const list = [
    { name: 'Employee User', email: 'employee@neurohr.com', dept: 'Engineering', designation: 'Software Developer', skills: ['JavaScript', 'React', 'Node.js', 'Python'], salary: 75000, score: 82 },
    { name: 'Sarah Chen', email: 'sarah.chen@neurohr.com', dept: 'Engineering', designation: 'Senior Full Stack Developer', skills: ['TypeScript', 'AWS', 'Docker', 'GraphQL'], salary: 95000, score: 91 },
    { name: 'Ryan Foster', email: 'ryan.foster@neurohr.com', dept: 'Engineering', designation: 'Frontend React Developer', skills: ['React', 'Next.js', 'Tailwind CSS', 'TypeScript'], salary: 82000, score: 84 },
    { name: 'Meera Joshi', email: 'meera.joshi@neurohr.com', dept: 'Engineering', designation: 'Backend Node.js Developer', skills: ['Node.js', 'Express', 'MongoDB', 'Redis'], salary: 88000, score: 87 },
    { name: 'Carlos Mendez', email: 'carlos.mendez@neurohr.com', dept: 'Engineering', designation: 'Java Software Developer', skills: ['Java', 'Spring Boot', 'PostgreSQL', 'JUnit'], salary: 85000, score: 83 },
    { name: 'James Wilson', email: 'james.wilson@neurohr.com', dept: 'Data Science', designation: 'ML Engineer', skills: ['Python', 'TensorFlow', 'PyTorch', 'NLP'], salary: 105000, score: 88 },
    { name: 'Priya Sharma', email: 'priya.sharma@neurohr.com', dept: 'HR', designation: 'HR Specialist', skills: ['Recruitment', 'Onboarding', 'HRIS'], salary: 65000, score: 76 },
    { name: 'Michael Brown', email: 'michael.brown@neurohr.com', dept: 'Marketing', designation: 'Marketing Lead', skills: ['SEO', 'Content Strategy', 'Analytics'], salary: 80000, score: 79 },
    { name: 'Emily Davis', email: 'emily.davis@neurohr.com', dept: 'Finance', designation: 'Financial Analyst', skills: ['Excel', 'SAP', 'Forecasting'], salary: 72000, score: 74 },
    { name: 'Alex Kumar', email: 'alex.kumar@neurohr.com', dept: 'Engineering', designation: 'DevOps Engineer', skills: ['Kubernetes', 'CI/CD', 'Terraform'], salary: 98000, score: 86 },
    { name: 'Lisa Anderson', email: 'lisa.anderson@neurohr.com', dept: 'Design', designation: 'UX Designer', skills: ['Figma', 'UI/UX', 'Prototyping'], salary: 78000, score: 80 },
  ];
  const docs = [];
  for (const e of list) {
    const id = await getNextSeq('employees');
    const empUser = await User.findOne({ email: e.email });
    docs.push({
      id, employeeId: `EMP${String(id).padStart(5, '0')}`,
      userId: empUser?.id,
      personalDetails: { name: e.name, email: e.email, phone: `+1-555-${String(1000 + id).slice(-4)}` },
      department: e.dept, designation: e.designation, managerId: manager?.id,
      skills: e.skills,
      salary: { basic: e.salary, allowance: Math.round(e.salary * 0.1), bonus: 5000 },
      aiPerformanceScore: e.score, status: 'active',
    });
  }
  await Employee.insertMany(docs);
  return docs.length;
}

async function seedJobs() {
  const recruiter = await User.findOne({ email: 'recruiter@neurohr.com' });
  const list = [
    {
      title: 'Senior Full Stack Developer',
      description: 'Lead end-to-end product features using React, Node.js, TypeScript, REST/GraphQL APIs, and MongoDB. 5+ years building scalable web apps. Own code reviews, system design, and mentoring junior developers.',
      skills: ['React', 'Node.js', 'TypeScript', 'AWS', 'MongoDB', 'GraphQL'],
      experienceLevel: 'Senior', difficultyLevel: 'Hard',
    },
    {
      title: 'Junior Software Developer',
      description: 'Entry-level software developer role for graduates or 0–2 years experience. Work with senior engineers on bug fixes, unit tests, REST APIs, and frontend components in JavaScript/TypeScript.',
      skills: ['JavaScript', 'HTML', 'CSS', 'Git', 'SQL', 'Problem Solving'],
      experienceLevel: 'Junior', difficultyLevel: 'Easy',
    },
    {
      title: 'Frontend React Developer',
      description: 'Build responsive enterprise UIs with React 18, Next.js, Tailwind CSS, and state management. Strong focus on performance, accessibility, component design, and API integration.',
      skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Redux', 'REST APIs'],
      experienceLevel: 'Mid', difficultyLevel: 'Medium',
    },
    {
      title: 'Backend Node.js Developer',
      description: 'Design and implement scalable backend services with Node.js, Express, MongoDB, JWT auth, and microservice patterns. Experience with caching, queues, and cloud deployment preferred.',
      skills: ['Node.js', 'Express', 'MongoDB', 'Redis', 'JWT', 'Docker'],
      experienceLevel: 'Mid-Senior', difficultyLevel: 'Hard',
    },
    {
      title: 'Java Software Developer',
      description: 'Develop enterprise applications using Java 17+, Spring Boot, Hibernate, and PostgreSQL. Build REST APIs, write clean OOP code, and participate in agile sprints.',
      skills: ['Java', 'Spring Boot', 'Hibernate', 'PostgreSQL', 'Maven', 'JUnit'],
      experienceLevel: 'Mid', difficultyLevel: 'Medium',
    },
    {
      title: 'Mobile Developer (React Native)',
      description: 'Create cross-platform mobile apps with React Native, Expo, and native modules. Integrate push notifications, offline storage, and secure authentication flows.',
      skills: ['React Native', 'JavaScript', 'Expo', 'iOS', 'Android', 'Firebase'],
      experienceLevel: 'Mid', difficultyLevel: 'Medium',
    },
    {
      title: 'Software Engineer – Python',
      description: 'Build backend services and automation tools in Python. FastAPI/Django, data processing, API development, and integration with ML pipelines for HR analytics products.',
      skills: ['Python', 'FastAPI', 'Django', 'PostgreSQL', 'Pandas', 'API Design'],
      experienceLevel: 'Mid', difficultyLevel: 'Medium',
    },
    {
      title: 'Machine Learning Engineer',
      description: 'Build ML pipelines for HR analytics. Python, scikit-learn, TensorFlow, NLP, and MLOps experience required.',
      skills: ['Python', 'TensorFlow', 'NLP', 'MLOps', 'Pandas'],
      experienceLevel: 'Mid-Senior', difficultyLevel: 'Hard',
    },
    {
      title: 'HR Business Partner',
      description: 'Drive people strategy across departments. Talent management, employee relations, and HR analytics experience.',
      skills: ['Talent Management', 'HR Analytics', 'Employee Relations', 'SHRM'],
      experienceLevel: 'Mid', difficultyLevel: 'Medium',
    },
  ];
  const ids = [];
  for (const j of list) {
    const id = await getNextSeq('jobs');
    await Job.create({
      id, ...j,
      interviewQuestions: [
        { question: `Experience with ${j.skills[0]}?`, type: 'technical' },
        { question: 'Describe a challenging project', type: 'behavioral' },
        { question: 'Why NeuroHR AI?', type: 'general' },
      ],
      salaryInsights: { min: 70000, max: 120000, currency: 'USD' },
      createdBy: recruiter?.id,
    });
    ids.push(id);
  }
  return ids;
}

async function seedCandidates(jobIds) {
  const jobs = jobIds.length ? jobIds : (await Job.find().lean()).map((j) => j.id);
  const list = [
    { name: 'David Martinez', email: 'david.m@email.com', skills: ['React', 'Node.js', 'TypeScript', 'AWS'], score: 92, status: 'shortlisted', jobIdx: 0, monthsAgo: 1 },
    { name: 'Anna Kowalski', email: 'anna.k@email.com', skills: ['React', 'Python', 'MongoDB'], score: 85, status: 'interview', jobIdx: 0, monthsAgo: 2 },
    { name: 'Robert Lee', email: 'robert.l@email.com', skills: ['Java', 'Spring Boot', 'PostgreSQL'], score: 58, status: 'rejected', jobIdx: 4, monthsAgo: 3 },
    { name: 'Maria Garcia', email: 'maria.g@email.com', skills: ['Vue.js', 'Node.js', 'Docker'], score: 78, status: 'screening', jobIdx: 3, monthsAgo: 1 },
    { name: 'Tom Harris', email: 'tom.h@email.com', skills: ['Python', 'TensorFlow', 'NLP', 'PyTorch'], score: 94, status: 'selected', jobIdx: 7, monthsAgo: 2 },
    { name: 'Nina Patel', email: 'nina.p@email.com', skills: ['Python', 'Pandas', 'SQL'], score: 71, status: 'screening', jobIdx: 7, monthsAgo: 4 },
    { name: 'Chris Evans', email: 'chris.e@email.com', skills: ['R', 'Statistics'], score: 45, status: 'rejected', jobIdx: 7, monthsAgo: 5 },
    { name: 'Sophie Turner', email: 'sophie.t@email.com', skills: ['HR Analytics', 'SHRM', 'Talent Management'], score: 88, status: 'onboarding', jobIdx: 8, monthsAgo: 1 },
    { name: 'Kevin Wong', email: 'kevin.w@email.com', skills: ['Recruitment', 'Onboarding'], score: 67, status: 'applied', jobIdx: 8, monthsAgo: 0 },
    { name: 'Rachel Kim', email: 'rachel.k@email.com', skills: ['React', 'GraphQL', 'TypeScript', 'AWS'], score: 90, status: 'shortlisted', jobIdx: 0, monthsAgo: 3 },
    { name: 'John Smith', email: 'john.s@email.com', skills: ['React', 'Redux', 'CSS'], score: 72, status: 'applied', jobIdx: 2, monthsAgo: 4 },
    { name: 'Emma Wilson', email: 'emma.w@email.com', skills: ['Python', 'Django', 'PostgreSQL'], score: 81, status: 'screening', jobIdx: 6, monthsAgo: 5 },
    { name: 'Alex Rivera', email: 'alex.r@email.com', skills: ['JavaScript', 'HTML', 'CSS', 'Git'], score: 68, status: 'applied', jobIdx: 1, monthsAgo: 1 },
    { name: 'Priya Nair', email: 'priya.n@email.com', skills: ['JavaScript', 'React', 'SQL', 'Problem Solving'], score: 74, status: 'screening', jobIdx: 1, monthsAgo: 2 },
    { name: 'Lucas Meyer', email: 'lucas.m@email.com', skills: ['React', 'Next.js', 'Tailwind CSS', 'TypeScript'], score: 87, status: 'interview', jobIdx: 2, monthsAgo: 1 },
    { name: 'Sofia Andersson', email: 'sofia.a@email.com', skills: ['React', 'Redux', 'REST APIs', 'Figma'], score: 83, status: 'shortlisted', jobIdx: 2, monthsAgo: 3 },
    { name: 'Daniel Cho', email: 'daniel.c@email.com', skills: ['Node.js', 'Express', 'MongoDB', 'Redis'], score: 89, status: 'interview', jobIdx: 3, monthsAgo: 2 },
    { name: 'Hannah Brooks', email: 'hannah.b@email.com', skills: ['Node.js', 'JWT', 'Docker', 'AWS'], score: 86, status: 'shortlisted', jobIdx: 3, monthsAgo: 4 },
    { name: 'Omar Hassan', email: 'omar.h@email.com', skills: ['Java', 'Spring Boot', 'Hibernate', 'JUnit'], score: 79, status: 'screening', jobIdx: 4, monthsAgo: 2 },
    { name: 'Yuki Tanaka', email: 'yuki.t@email.com', skills: ['React Native', 'Expo', 'Firebase', 'JavaScript'], score: 84, status: 'interview', jobIdx: 5, monthsAgo: 1 },
    { name: 'Employee User', email: 'employee@neurohr.com', skills: ['JavaScript', 'React', 'Node.js', 'Python'], score: 82, status: 'interview', jobIdx: 0, monthsAgo: 0 },
  ];
  const docs = [];
  for (const c of list) {
    const id = await getNextSeq('candidates');
    const createdAt = new Date();
    createdAt.setMonth(createdAt.getMonth() - c.monthsAgo);
    docs.push({
      id, name: c.name, email: c.email,
      jobId: jobs[c.jobIdx] || jobs[0],
      skills: c.skills, matchScore: c.score, rankingScore: c.score,
      missingSkills: ['Kubernetes', 'GraphQL'].filter((s) => !c.skills.includes(s)),
      featureScores: { skill_match: c.score * 0.4, experience: c.score * 0.3, education: c.score * 0.3 },
      status: c.status, createdAt, updatedAt: createdAt,
    });
  }
  await Candidate.insertMany(docs);
  return docs.length;
}

async function seedInterviews() {
  const candidates = await Candidate.find({ status: { $in: ['interview', 'selected', 'shortlisted'] } }).lean();
  let count = 0;
  for (const c of candidates) {
    const id = await getNextSeq('interviews');
    const completed = ['selected', 'shortlisted'].includes(c.status);
    await Interview.create({
      id, candidateId: c.id, jobId: c.jobId,
      questions: [
        { question: 'Describe your relevant experience', type: 'technical' },
        { question: 'How do you handle tight deadlines?', type: 'behavioral' },
        { question: 'What motivates you at work?', type: 'general' },
      ],
      answers: completed ? [
        { question: 'Experience', answer: '5+ years building scalable web applications' },
        { question: 'Deadlines', answer: 'I prioritize tasks and communicate early' },
      ] : [],
      technicalScore: completed ? 78 + Math.floor(Math.random() * 15) : 0,
      communicationScore: completed ? 75 + Math.floor(Math.random() * 15) : 0,
      confidenceScore: completed ? 80 + Math.floor(Math.random() * 12) : 0,
      finalScore: completed ? 79 + Math.floor(Math.random() * 12) : 0,
      recommendation: completed ? (c.rankingScore >= 85 ? 'Strong Hire' : 'Consider') : undefined,
      status: completed ? 'completed' : 'pending',
      completedAt: completed ? new Date() : undefined,
    });
    count++;
  }
  return count;
}

async function seedAttendance() {
  const employees = await Employee.find().lean();
  let count = 0;
  const today = new Date();
  for (const emp of employees) {
    for (let d = 0; d < 20; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const id = await getNextSeq('attendance');
      await Attendance.create({
        id, employeeId: emp.id, date: date.toISOString().split('T')[0],
        checkIn: `09:0${Math.floor(Math.random() * 5)}:00`,
        checkOut: `17:${String(Math.floor(Math.random() * 30)).padStart(2, '0')}:00`,
        workingHours: +(7.5 + Math.random() * 1.5).toFixed(1),
        faceVerification: Math.random() > 0.15,
        verificationScore: 75 + Math.floor(Math.random() * 20),
        status: 'present',
      });
      count++;
    }
  }
  const emp = employees[0];
  if (emp) {
    await Leave.insertMany([
      { id: await getNextSeq('leaves'), employeeId: emp.id, type: 'annual', fromDate: '2026-06-15', toDate: '2026-06-17', reason: 'Family vacation', status: 'pending' },
      { id: await getNextSeq('leaves'), employeeId: employees[1]?.id || emp.id, type: 'sick', fromDate: '2026-05-20', toDate: '2026-05-21', reason: 'Medical', status: 'approved' },
    ]);
  }
  return count;
}

async function seedPayroll() {
  const employees = await Employee.find().lean();
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
  let count = 0;
  for (const emp of employees) {
    for (const month of months) {
      const basic = emp.salary?.basic || 70000;
      const allowance = emp.salary?.allowance || 7000;
      const bonus = month === '2026-06' ? 3000 : month === '2026-03' ? 1500 : 0;
      const tax = Math.round(basic * 0.1);
      const id = await getNextSeq('payroll');
      await Payroll.create({
        id, employeeId: emp.id, month, basic, allowance, bonus,
        deductions: 500, tax, netPay: basic + allowance + bonus - 500 - tax,
        anomalyFlag: false,
      });
      count++;
    }
  }
  return count;
}

async function seedPerformance() {
  const employees = await Employee.find().lean();
  const docs = [];
  for (const emp of employees) {
    const id = await getNextSeq('performance');
    const score = emp.aiPerformanceScore || 75;
    docs.push({
      id, employeeId: emp.id, period: 'Q2 2026',
      tasks: [
        { title: 'Sprint deliverables', status: 'done', score: 90 },
        { title: 'Code review participation', status: 'in_progress', score: 80 },
      ],
      goals: [
        { title: 'Improve team velocity 15%', progress: 70 },
        { title: 'Complete certification', progress: 45 },
      ],
      kpis: [{ name: 'Code Quality', value: score }, { name: 'Collaboration', value: score - 5 }],
      feedback: ['Strong contributor', 'Excellent team player'],
      aiScore: score,
      promotionChance: Math.min(92, score + 8),
      attritionRisk: Math.max(8, 100 - score - 10),
    });
  }
  await Performance.insertMany(docs);
  return docs.length;
}

async function seedOnboarding() {
  const candidate = await Candidate.findOne({ status: 'onboarding' });
  if (!candidate) return 0;
  const id = await getNextSeq('onboarding');
  await Onboarding.create({
    id, candidateId: candidate.id,
    offerLetter: `Dear ${candidate.name},\n\nWe are pleased to offer you the HR Business Partner role at NeuroHR AI.\n\nStart Date: July 1, 2026\nSalary: $85,000/year\n\nSincerely,\nHR Team`,
    joiningChecklist: [
      { task: 'Submit ID documents', due: 'Day 1', owner: 'Employee', status: 'pending' },
      { task: 'Background verification', due: 'Day 3', owner: 'HR', status: 'pending' },
      { task: 'Laptop & access setup', due: 'Day 1', owner: 'IT', status: 'pending' },
      { task: 'Sign NDA & policies', due: 'Day 1', owner: 'Employee', status: 'pending' },
    ],
    trainingPlan: { modules: ['Company Orientation', 'HR Systems', 'Compliance Training', 'Product Overview'] },
    day30Plan: { title: 'Foundation (30 Days)', goals: ['Complete onboarding', 'Meet all stakeholders', 'Learn HRIS platform'] },
    day60Plan: { title: 'Growth (60 Days)', goals: ['Lead recruitment drive', 'Implement process improvements'] },
    day90Plan: { title: 'Mastery (90 Days)', goals: ['Own department HR strategy', 'Mentor new hires'] },
    status: 'active',
  });
  return 1;
}

async function seedAIModels() {
  const id = await getNextSeq('ai_models');
  await AIModel.create({
    id, modelName: 'candidate_ranker_v1', algorithm: 'random_forest',
    accuracy: 0.89, precision: 0.87, recall: 0.91, f1Score: 0.89,
    version: '1.0', modelPath: '/models/candidate_ranker.pkl',
    confusionMatrix: [[45, 5], [8, 42]], status: 'trained',
  });
  return 1;
}

async function getCounts() {
  return {
    users: await User.countDocuments(),
    employees: await Employee.countDocuments(),
    jobs: await Job.countDocuments(),
    candidates: await Candidate.countDocuments(),
    interviews: await Interview.countDocuments(),
    attendance: await Attendance.countDocuments(),
    leaves: await Leave.countDocuments(),
    payroll: await Payroll.countDocuments(),
    performance: await Performance.countDocuments(),
    onboarding: await Onboarding.countDocuments(),
    aiModels: await AIModel.countDocuments(),
  };
}

/**
 * Insert demo data directly into MongoDB Atlas via Mongoose.
 * @param {{ force?: boolean }} opts - force=true clears demo collections first
 */
async function runSeed({ force = false } = {}) {
  const counts = await getCounts();

  if (force) {
    await clearDemoData();
    const usersCreated = await seedUsers();
    console.log('Fresh org seed — XYZ admin only. Generate jobs from KB next.');
    console.log({ usersCreated, login: 'vaishaleeaiml@gmail.com / 123456' });
    return getCounts();
  }

  const userCount = await User.countDocuments();
  if (userCount === 0) {
    const usersCreated = await seedUsers();
    console.log('Seeded org admin:', { usersCreated, email: 'vaishaleeaiml@gmail.com' });
    return getCounts();
  }

  console.log('MongoDB ready (no demo data re-seeded):', counts);
  return counts;
}

/** Keep only org HR admin — remove dummy employees, candidates, and hiring records. */
const KEEP_USER_EMAILS = ['vaishaleeaiml@gmail.com'];

async function clearDummyEmployeesAndCandidates() {
  const before = await getCounts();

  await Promise.all([
    Notification.deleteMany({}),
    JobApplication.deleteMany({}),
    Interview.deleteMany({}),
    Candidate.deleteMany({}),
    Employee.deleteMany({}),
    Attendance.deleteMany({}),
    Leave.deleteMany({}),
    Payroll.deleteMany({}),
    Performance.deleteMany({}),
    Onboarding.deleteMany({}),
    ChatHistory.deleteMany({}).catch(() => {}),
  ]);

  const usersRemoved = await User.deleteMany({ email: { $nin: KEEP_USER_EMAILS } });
  const usersEnsured = await seedUsers();

  const after = await getCounts();
  return {
    before,
    after,
    removed: {
      employees: before.employees,
      candidates: before.candidates,
      interviews: before.interviews,
      users: usersRemoved.deletedCount,
    },
    keptHr: KEEP_USER_EMAILS,
    usersEnsured,
  };
}

module.exports = {
  runSeed, getCounts, clearDemoData, clearDummyEmployeesAndCandidates, DEMO_COLLECTIONS, KEEP_USER_EMAILS,
};
