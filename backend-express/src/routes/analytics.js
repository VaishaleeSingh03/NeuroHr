const express = require('express');
const { auth } = require('../middleware/auth');
const { cacheGet, cacheSet } = require('../db');
const {
  Employee, Candidate, Interview, Attendance, Payroll, Performance, Leave, Job, JobApplication,
} = require('../models');
const { ensureCandidateForUser, buildInterviewFilterForUser } = require('../lib/candidateLink');
const { dedupeInterviewsByRole } = require('../lib/interviewDedup');

const router = express.Router();
const CACHE_KEY = 'analytics:dashboard:v3';

function isInterviewPastDeadline(item) {
  const d = item.deadlineAt || item.scheduledAt;
  if (!d) return false;
  return Date.now() > new Date(d).getTime();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

router.get('/dashboard', auth(['management_admin', 'senior_manager', 'hr_recruiter']), async (req, res) => {
  const cached = await cacheGet(CACHE_KEY);
  if (cached) return res.json(JSON.parse(cached));

  const today = new Date().toISOString().split('T')[0];
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    totalEmployees,
    totalApplications,
    openJobs,
    scheduledInterviews,
    completedInterviews,
    attendanceToday,
    payrolls,
    avgJdScore,
    monthlyApps,
    appStatusAgg,
  ] = await Promise.all([
    Employee.countDocuments({ status: 'active' }),
    JobApplication.countDocuments(),
    Job.countDocuments({ status: { $ne: 'closed' } }),
    Interview.find({ status: 'scheduled' }).lean(),
    Interview.find({ status: 'completed' }).lean(),
    Attendance.countDocuments({ date: today }),
    Payroll.find().sort({ month: -1 }).limit(12).lean(),
    JobApplication.aggregate([
      { $match: { jdScore: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$jdScore' } } },
    ]),
    JobApplication.aggregate([
      { $match: { appliedAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $month: '$appliedAt' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    JobApplication.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const uniqueScheduled = dedupeInterviewsByRole(scheduledInterviews, isInterviewPastDeadline)
    .filter((i) => i.status === 'scheduled' && !isInterviewPastDeadline(i));

  const avgScore = Math.round((avgJdScore[0]?.avg || 0) * 100) / 100;

  const statusCounts = Object.fromEntries(
    ['applied', 'shortlisted', 'rejected', 'interview_scheduled'].map((s) => [s, 0])
  );
  for (const row of appStatusAgg) {
    if (row._id) statusCounts[row._id] = row.count;
  }

  const monthly = monthlyApps.map((m) => ({
    month: MONTHS[m._id - 1] || `M${m._id}`,
    count: m.count,
  }));

  const skillAgg = await JobApplication.aggregate([
    { $unwind: '$skills' },
    { $group: { _id: '$skills', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 },
  ]);
  const skillTrends = skillAgg.map((s) => ({ skill: s._id, count: s.count }));

  const shortlisted = statusCounts.shortlisted || 0;
  const rejected = statusCounts.rejected || 0;

  const result = {
    total_employees: totalEmployees,
    total_applications: totalApplications,
    selected_candidates: shortlisted,
    rejected_candidates: rejected,
    average_ai_score: avgScore,
    attendance_today: attendanceToday,
    open_jobs: openJobs,
    scheduled_interviews: uniqueScheduled.length,
    hiring_funnel: statusCounts,
    skill_trends: skillTrends,
    interview_performance: {
      avg_technical: completedInterviews.reduce((s, i) => s + (i.technicalScore || 0), 0) / Math.max(completedInterviews.length, 1),
      avg_communication: completedInterviews.reduce((s, i) => s + (i.communicationScore || 0), 0) / Math.max(completedInterviews.length, 1),
      total_interviews: completedInterviews.length,
    },
    predictions: {
      hiring_success_probability: Math.min(95, Math.round((shortlisted / Math.max(totalApplications, 1)) * 100 + 10)),
      employee_growth_rate: totalEmployees > 0 ? Math.round((totalEmployees / Math.max(totalEmployees - 1, 1)) * 100 - 100) : 0,
      attrition_risk_avg: 22,
    },
    charts: {
      funnel_bar: Object.entries(statusCounts).map(([name, value]) => [name.replace(/_/g, ' '), value]),
      monthly_applications: monthly,
      salary_analytics: payrolls.map((p) => ({ month: p.month, netPay: p.netPay })),
      skill_heatmap: skillTrends.slice(0, 10),
    },
  };

  await cacheSet(CACHE_KEY, result, 60);
  res.json(result);
});

router.get('/candidate-portal', auth(['candidate']), async (req, res) => {
  const candidate = await ensureCandidateForUser(req.user);
  const openJobs = await Job.countDocuments({ status: { $ne: 'closed' } });

  const interviewFilter = await buildInterviewFilterForUser(req.user);
  const [applicationsCount, applications, interviews] = await Promise.all([
    JobApplication.countDocuments({
      $or: [{ candidateId: candidate.id }, { userId: req.user.id }],
    }),
    JobApplication.find({
      $or: [{ candidateId: candidate.id }, { userId: req.user.id }],
    }).sort({ appliedAt: -1 }).limit(10).lean(),
    Interview.find(interviewFilter)
      .sort({ scheduledAt: -1, createdAt: -1 }).lean(),
  ]);

  const uniqueInterviews = dedupeInterviewsByRole(interviews, isInterviewPastDeadline);
  const upcoming = uniqueInterviews.filter(
    (i) => i.status === 'scheduled' && !isInterviewPastDeadline(i),
  );

  res.json({
    applications_count: applicationsCount,
    open_jobs: openJobs,
    interviews_scheduled: upcoming.length,
    interviews_completed: uniqueInterviews.filter((i) => i.status === 'completed').length,
    recent_applications: applications,
    upcoming_interviews: upcoming,
    candidate_status: candidate.status,
  });
});

router.get('/portal', auth(['employee']), async (req, res) => {
  const emp = await Employee.findOne({ 'personalDetails.email': req.user.email }).lean();
  const [attendance, payroll, performance, leaves] = await Promise.all([
    Attendance.find({ employeeId: emp?.id }).sort({ date: -1 }).limit(10).lean(),
    Payroll.find({ employeeId: emp?.id }).sort({ month: -1 }).limit(3).lean(),
    Performance.findOne({ employeeId: emp?.id }).sort({ createdAt: -1 }).lean(),
    Leave.find({ employeeId: emp?.id }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  res.json({ employee: emp, attendance, payroll, performance, leaves });
});

module.exports = router;
