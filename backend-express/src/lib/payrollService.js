const ml = require('../services/mlClient');
const { sendHrEmail } = require('./emailService');
const { payrollPayslip } = require('./emailTemplates');
const { buildPayslipPdf, monthLabel } = require('./payslipPdf');
const { computePayrollLeaveAdjustment } = require('./leaveService');

function formatMoney(amount, currency = 'INR') {
  const n = Number(amount) || 0;
  if (currency === 'INR') {
    return `₹${n.toLocaleString('en-IN')}`;
  }
  return `$${n.toLocaleString()}`;
}

async function suggestEmployeeSalary({ name, designation, department, skills }) {
  return ml.suggestSalary({ name, designation, department, skills });
}

async function buildPayrollForEmployee(emp, { month, bonus = 0, deductions = 0 }) {
  const basic = emp.salary?.basic || 0;
  const allowance = emp.salary?.allowance || Math.round(basic * 0.1);
  const leaveAdj = await computePayrollLeaveAdjustment(emp, month);
  const manualDeductions = Number(deductions) || 0;
  const leaveDeduction = leaveAdj.leaveDeduction || 0;
  const totalDeductions = manualDeductions + leaveDeduction;

  let calc = {
    basic,
    allowance,
    bonus: Number(bonus) || 0,
    deductions: totalDeductions,
    leaveDeduction,
    leaveBreakdown: leaveAdj.leaveBreakdown,
    monthLeaveDays: leaveAdj.monthLeaveDays,
    leaveBalances: leaveAdj.balances,
    tax: Math.round((basic + allowance + (Number(bonus) || 0)) * 0.1),
    net_pay: 0,
  };

  try {
    const r = await ml.calculatePayroll({
      basic,
      allowance,
      bonus: calc.bonus,
      deductions: calc.deductions,
      tax_rate_pct: 10,
    });
    calc = {
      ...calc,
      basic: r.basic,
      allowance: r.allowance,
      bonus: r.bonus,
      deductions: r.deductions,
      tax: r.tax,
      net_pay: r.net_pay,
      generated_by: r.generated_by,
    };
  } catch {
    calc.net_pay = calc.basic + calc.allowance + calc.bonus - calc.deductions - calc.tax;
  }

  let anomaly = false;
  let prediction = {};
  try {
    const ar = await ml.payrollAnomaly({
      basic: calc.basic,
      allowance: calc.allowance,
      bonus: calc.bonus,
      deductions: calc.deductions,
      tax: calc.tax,
      netPay: calc.net_pay,
      month,
    });
    anomaly = Boolean(ar.anomaly_detected);
    prediction = ar;
  } catch {
    prediction = { recommendation: 'Payroll calculated' };
  }

  return { ...calc, anomalyFlag: anomaly, aiPrediction: prediction };
}

function buildLeaveSummaryHtml(breakdown = []) {
  if (!breakdown.length) return '';
  const rows = breakdown.map((b) => (
    `<tr><td style="padding:8px;border:1px solid #e2e8f0">${b.type || 'Leave'}</td>`
    + `<td style="padding:8px;border:1px solid #e2e8f0">${b.days ?? '—'} day(s)</td>`
    + `<td style="padding:8px;border:1px solid #e2e8f0">${b.note || ''}</td>`
    + `<td style="padding:8px;border:1px solid #e2e8f0;text-align:right">`
    + `${b.amount != null ? formatMoney(b.amount) : '—'}</td></tr>`
  )).join('');
  return `
    <p style="font-size:13px;font-weight:600;margin:16px 0 8px">Leave adjustments this month</p>
    <table class="email-stack" role="presentation" style="width:100%;max-width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f8fafc">
        <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Type</th>
        <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Days</th>
        <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Note</th>
        <th style="padding:8px;border:1px solid #e2e8f0;text-align:right">Amount</th>
      </tr>
      ${rows}
    </table>`;
}

async function notifyPayrollEmail(emp, payroll) {
  const email = emp.personalDetails?.email;
  if (!email) {
    return { sent: false, reason: 'no_employee_email' };
  }

  try {
    const currency = payroll.aiPrediction?.currency || emp.salary?.currency || 'INR';
    const pdfBuffer = await buildPayslipPdf({ employee: emp, payroll });
    const pdfName = `Payslip_${emp.employeeId || emp.id}_${payroll.month}.pdf`;
    const otherDed = Math.max(0, Number(payroll.deductions || 0) - Number(payroll.leaveDeduction || 0));
    const leaveSummaryHtml = buildLeaveSummaryHtml(payroll.leaveBreakdown);
    const anomalyNote = payroll.anomalyFlag
      ? 'Note: Payroll anomaly flag was raised — HR may review this payslip.'
      : '';

    const { subject, html } = payrollPayslip({
      name: emp.personalDetails?.name || 'Employee',
      employeeId: emp.employeeId || `EMP${emp.id}`,
      designation: emp.designation,
      department: emp.department,
      month: payroll.month,
      basic: payroll.basic,
      allowance: payroll.allowance,
      bonus: payroll.bonus,
      deductions: payroll.deductions,
      leaveDeduction: payroll.leaveDeduction || 0,
      tax: payroll.tax,
      netPay: payroll.netPay,
      currency,
      leaveSummaryHtml,
      anomalyNote,
    });

    const result = await sendHrEmail(email, subject, html, [{
      filename: pdfName,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }]);

    return {
      ...result,
      subject,
      generated_by: 'template',
      email_recipient: email,
    };
  } catch (err) {
    console.error('[payroll] Payslip email failed:', err.message);
    return { sent: false, reason: err.message, email_recipient: email };
  }
}

module.exports = {
  suggestEmployeeSalary,
  buildPayrollForEmployee,
  notifyPayrollEmail,
  formatMoney,
};
