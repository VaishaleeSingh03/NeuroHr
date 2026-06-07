const { Employee, Job, User, getNextSeq } = require('../models');

const { buildLeaveEntitlements, currentYear } = require('./leavePolicy');

const { suggestEmployeeSalary } = require('./payrollService');

const { linkUserAsEmployee, markCandidateAsEmployee, notifyHrNewEmployee } = require('./employeeLink');



function parseSalaryNumber(salaryStr) {

  const nums = String(salaryStr || '').match(/[\d,.]+/g);

  if (!nums?.length) return null;

  const val = parseFloat(nums[0].replace(/,/g, ''));

  return Number.isFinite(val) ? val : null;

}



async function onboardEmployeeFromApplication(app, { gender = 'other', employmentType, io, userId } = {}) {

  const email = (app.candidateEmail || '').toLowerCase();
  const linkedUserId = userId || app.userId;

  if (!email) return { error: 'no_candidate_email' };



  const existing = await Employee.findOne({ 'personalDetails.email': email }).lean();

  if (existing) {

    await linkUserAsEmployee(email, existing.id, linkedUserId);

    await markCandidateAsEmployee(app.candidateId, existing.id);

    if (linkedUserId) {

      await User.updateOne({ id: linkedUserId }, { $set: { role: 'employee' } });

    }

    return { employee: existing, created: false };

  }



  const job = await Job.findOne({ id: app.jobId }).lean();

  const empType = employmentType || job?.employmentType || 'full_time';

  const parsedSalary = parseSalaryNumber(app.finalDecision?.salary);

  let salary = { basic: 0, allowance: 0, bonus: 0, currency: 'INR' };



  if (parsedSalary && parsedSalary > 1000) {

    salary = {

      basic: Math.round(parsedSalary / 12),

      allowance: Math.round((parsedSalary / 12) * 0.1),

      bonus: 0,

      currency: 'INR',

      fromOffer: true,

    };

  } else {

    const suggestion = await suggestEmployeeSalary({

      name: app.candidateName,

      designation: job?.title || 'Employee',

      department: job?.department || 'Engineering',

      skills: app.skills || app.matchedSkills || [],

    });

    salary = {

      basic: suggestion.basic,

      allowance: suggestion.allowance,

      bonus: 0,

      currency: suggestion.currency || 'INR',

      aiSuggested: true,

    };

  }



  const year = currentYear();

  const id = await getNextSeq('employees');

  const employee = await Employee.create({

    id,

    employeeId: `EMP${String(id).padStart(5, '0')}`,

    userId: linkedUserId || undefined,

    personalDetails: {

      name: app.candidateName,

      email,

      phone: app.phone || '',

    },

    department: job?.department || 'Engineering',

    designation: job?.title || app.jobTitle,

    skills: app.skills || app.matchedSkills || [],

    salary,

    employmentType: empType,

    gender,

    jobId: app.jobId,

    applicationId: app.id,

    leaveEntitlements: buildLeaveEntitlements({ employmentType: empType, gender, year }),

    leaveUsed: { year, ...require('./leavePolicy').emptyUsage() },

    status: 'active',

    hiredAt: new Date(),

  });



  const empObj = employee.toObject();

  await linkUserAsEmployee(email, empObj.id, linkedUserId);

  if (linkedUserId) {

    await User.updateOne({ id: linkedUserId }, { $set: { role: 'employee' } });

    await Employee.updateOne({ id: empObj.id }, { $set: { userId: linkedUserId } });

  }

  await markCandidateAsEmployee(app.candidateId, empObj.id);

  await notifyHrNewEmployee(empObj, io, app.finalDecision?.decidedByName);



  return { employee: empObj, created: true };

}



module.exports = { onboardEmployeeFromApplication, parseSalaryNumber };

