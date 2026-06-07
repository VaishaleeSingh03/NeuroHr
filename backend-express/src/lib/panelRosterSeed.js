/** Panel roster helpers — no auto-seeding; HR adds employees manually. */

function formatEmployeeForRoster(emp) {
  return {
    id: emp.id,
    employeeId: emp.employeeId,
    name: emp.personalDetails?.name || 'Employee',
    email: emp.personalDetails?.email || '',
    phone: emp.personalDetails?.phone || '',
    department: emp.department || '',
    designation: emp.designation || '',
    skills: emp.skills || [],
  };
}

module.exports = { formatEmployeeForRoster };
