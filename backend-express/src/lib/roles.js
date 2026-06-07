const SCHEDULER_ROLES = ['hr_recruiter', 'management_admin', 'senior_manager'];
const RECRUITER_ROLES = ['hr_recruiter', 'management_admin'];
const RESUME_VIEW_ROLES = ['hr_recruiter', 'management_admin', 'senior_manager'];
const STAFF_ROLES = ['hr_recruiter', 'management_admin', 'senior_manager'];
const TAKER_ROLES = ['candidate'];
const CHECK_IN_ROLES = ['employee', 'senior_manager', 'hr_recruiter', 'management_admin'];
const ATTENDANCE_VIEW_ROLES = ['management_admin', 'senior_manager', 'hr_recruiter'];
const LEAVE_APPROVER_ROLES = ['senior_manager', 'management_admin', 'hr_recruiter'];

function hasRole(userRole, allowed) {
  return allowed.includes(userRole);
}

module.exports = {
  SCHEDULER_ROLES,
  RECRUITER_ROLES,
  RESUME_VIEW_ROLES,
  STAFF_ROLES,
  TAKER_ROLES,
  CHECK_IN_ROLES,
  ATTENDANCE_VIEW_ROLES,
  LEAVE_APPROVER_ROLES,
  hasRole,
};
