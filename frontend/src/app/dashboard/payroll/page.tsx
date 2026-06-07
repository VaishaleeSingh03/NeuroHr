"use client";

import { useEffect, useState } from "react";
import { DollarSign, FileText, AlertTriangle, Mail, Loader2, Users, Download, Receipt, Plus } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import { payrollAPI, employeesAPI, reimbursementsAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface PayrollRow {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeEmail?: string;
  month: string;
  basic: number;
  allowance: number;
  bonus: number;
  tax: number;
  deductions: number;
  leaveDeduction?: number;
  netPay: number;
  anomalyFlag?: boolean;
  leaveBreakdown?: { type: string; days: number; note: string; amount?: number }[];
}

interface EmployeeOption {
  id: number;
  employeeId?: string;
  personalDetails?: { name?: string; email?: string };
  salary?: { basic?: number };
}

interface ReimbursementRow {
  id: number;
  category: string;
  amount: number;
  description: string;
  status: string;
  createdAt?: string;
}

export default function PayrollPage() {
  const { user } = useAuth();
  const [payrolls, setPayrolls] = useState<PayrollRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [reimbursements, setReimbursements] = useState<ReimbursementRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    employee_id: 0,
    month: new Date().toISOString().slice(0, 7),
    bonus: 0,
    deductions: 0,
  });
  const [reimbForm, setReimbForm] = useState({ category: "travel", amount: "", description: "" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [submittingReimb, setSubmittingReimb] = useState(false);
  const [preview, setPreview] = useState<{
    leaveDeduction?: number;
    leaveBreakdown?: { type: string; days: number; note: string; amount?: number }[];
    monthLeaveDays?: number;
    net_pay?: number;
  } | null>(null);
  const [leaveSummary, setLeaveSummary] = useState<{
    balances?: Record<string, { granted: number; used: number; remaining: number }>;
    monthLeaves?: { type: string; daysInMonth?: number }[];
  } | null>(null);
  const isAdmin = user?.role === "management_admin" || user?.role === "hr_recruiter";
  const isEmployee = user?.role === "employee";

  const fmt = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

  const loadPayrolls = () => {
    const api = isEmployee ? payrollAPI.my() : payrollAPI.list(form.month);
    api.then((r) => setPayrolls(r.data)).catch(() => {});
  };

  useEffect(() => {
    loadPayrolls();
    if (isAdmin) {
      employeesAPI.list().then((r) => setEmployees(r.data.items || r.data)).catch(() => {});
    }
    if (isEmployee) {
      reimbursementsAPI.my().then((r) => setReimbursements(r.data)).catch(() => {});
    }
    if (isAdmin) {
      reimbursementsAPI.list().then((r) => setReimbursements(r.data)).catch(() => {});
    }
  }, [user, isAdmin, isEmployee]);

  const selectedEmployee = employees.find((e) => e.id === form.employee_id);

  useEffect(() => {
    if (!isAdmin || !form.employee_id || !form.month) {
      setPreview(null);
      setLeaveSummary(null);
      return;
    }
    payrollAPI.preview({
      employee_id: form.employee_id,
      month: form.month,
      bonus: form.bonus,
      deductions: form.deductions,
    }).then((r) => {
      setPreview(r.data.preview);
      setLeaveSummary(r.data.leaveSummary);
    }).catch(() => {
      setPreview(null);
      setLeaveSummary(null);
    });
  }, [form.employee_id, form.month, form.bonus, form.deductions, isAdmin]);

  const generate = async () => {
    if (!form.employee_id) {
      toast.error("Select an employee");
      return;
    }
    setGenerating(true);
    try {
      const { data } = await payrollAPI.generate(form);
      const payload = data as PayrollRow & { email_sent?: boolean; email_queued?: boolean; message?: string; email_recipient?: string };
      if (payload.email_sent === false && !payload.email_queued) {
        toast.error(payload.message || "Payroll saved — employee has no email on file");
      } else {
        toast.success(payload.message || `Payslip emailed to ${payload.email_recipient}`);
      }
      loadPayrolls();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Payroll generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const generateAll = async () => {
    setBatchGenerating(true);
    try {
      const { data } = await payrollAPI.generateBatch({
        month: form.month,
        bonus: form.bonus,
        deductions: form.deductions,
      });
      const payload = data as { message?: string; emails_sent?: number; total?: number };
      toast.success(payload.message || `Batch: ${payload.emails_sent}/${payload.total} Groq emails sent`);
      loadPayrolls();
    } catch {
      toast.error("Batch payroll failed");
    } finally {
      setBatchGenerating(false);
    }
  };

  const downloadPdf = async (id: number, month: string) => {
    try {
      const { data } = await payrollAPI.downloadPayslipPdf(id);
      const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Payslip_${month}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Payslip PDF downloaded");
    } catch {
      toast.error("PDF download failed");
    }
  };

  const submitReimbursement = async () => {
    const amount = Number(reimbForm.amount);
    if (!amount || !reimbForm.description.trim()) {
      toast.error("Amount and description required");
      return;
    }
    setSubmittingReimb(true);
    try {
      const fd = new FormData();
      fd.append("category", reimbForm.category);
      fd.append("amount", String(amount));
      fd.append("description", reimbForm.description);
      if (receiptFile) fd.append("receipt", receiptFile);
      const { data } = await reimbursementsAPI.submit(fd);
      toast.success((data as { message?: string }).message || "Reimbursement submitted — HR emailed");
      setReimbForm({ category: "travel", amount: "", description: "" });
      setReceiptFile(null);
      reimbursementsAPI.my().then((r) => setReimbursements(r.data)).catch(() => {});
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Reimbursement failed");
    } finally {
      setSubmittingReimb(false);
    }
  };

  const PayslipBreakdown = ({ p }: { p: PayrollRow }) => {
    const otherDed = Math.max(0, Number(p.deductions || 0) - Number(p.leaveDeduction || 0));
    const gross = Number(p.basic) + Number(p.allowance) + Number(p.bonus);
    const totalDed = Number(p.tax) + Number(p.deductions || 0);
    return (
      <div className="mt-4 space-y-4 text-sm border-t border-aqua/15 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-green-50/80 border border-green-100 p-3">
            <p className="text-xs font-bold text-green-800 uppercase mb-2">Earnings</p>
            <div className="space-y-1 text-body">
              <div className="flex justify-between"><span>Basic</span><span>{fmt(Number(p.basic))}</span></div>
              <div className="flex justify-between"><span>Allowance</span><span>{fmt(Number(p.allowance))}</span></div>
              <div className="flex justify-between"><span>Bonus</span><span>{fmt(Number(p.bonus))}</span></div>
              <div className="flex justify-between font-semibold border-t border-green-200 pt-2 mt-2">
                <span>Gross</span><span>{fmt(gross)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-red-50/80 border border-red-100 p-3">
            <p className="text-xs font-bold text-red-800 uppercase mb-2">Deductions</p>
            <div className="space-y-1 text-body">
              <div className="flex justify-between"><span>Tax (TDS)</span><span>{fmt(Number(p.tax))}</span></div>
              {p.leaveDeduction ? (
                <div className="flex justify-between"><span>Leave</span><span>{fmt(Number(p.leaveDeduction))}</span></div>
              ) : null}
              <div className="flex justify-between"><span>Other</span><span>{fmt(otherDed)}</span></div>
              <div className="flex justify-between font-semibold border-t border-red-200 pt-2 mt-2">
                <span>Total deductions</span><span>{fmt(totalDed)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center p-3 rounded-xl bg-aqua/10">
          <span className="font-bold text-heading">Net pay (take home)</span>
          <span className="text-xl font-bold text-accent">{fmt(Number(p.netPay))}</span>
        </div>
        {(p.leaveBreakdown || []).length > 0 && (
          <div className="text-xs text-muted">
            <p className="font-semibold text-label mb-1">Leave impact this month</p>
            {p.leaveBreakdown!.map((l, i) => (
              <p key={i} className="capitalize">{l.type}: {l.days}d — {l.note}</p>
            ))}
          </div>
        )}
        {isEmployee && (
          <button
            type="button"
            onClick={() => downloadPdf(p.id, p.month)}
            className="btn-primary flex items-center gap-2 text-sm w-full justify-center"
          >
            <Download className="w-4 h-4" /> Download payslip PDF
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header min-w-0">
        <h1 className="page-title">Payroll System</h1>
        <p className="page-subtitle">
          {isEmployee
            ? "View salary breakdown, download payslips, request reimbursements"
            : "Generate payslips · Groq email to each employee · PDF attachment"}
        </p>
      </div>

      {isAdmin && (
        <GlassCard>
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-aqua" /> HR — Generate Payroll
          </h3>
          <div className="responsive-grid-4 gap-3">
            <select className="input-field" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })}>
              <option value={0}>Select Employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.personalDetails?.name || e.employeeId} {e.salary?.basic ? `(₹${e.salary.basic.toLocaleString("en-IN")})` : "(no salary)"}
                </option>
              ))}
            </select>
            <input type="month" className="input-field" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
            <input type="number" placeholder="Bonus (₹)" className="input-field" value={form.bonus || ""} onChange={(e) => setForm({ ...form, bonus: Number(e.target.value) })} />
            <input type="number" placeholder="Deductions (₹)" className="input-field" value={form.deductions || ""} onChange={(e) => setForm({ ...form, deductions: Number(e.target.value) })} />
          </div>
          {selectedEmployee?.personalDetails?.email && (
            <p className="text-xs text-muted mt-2">
              Groq email + PDF to <strong>{selectedEmployee.personalDetails.email}</strong>
            </p>
          )}
          {preview && (
            <div className="mt-4 p-3 rounded-xl bg-cream/60 border border-aqua/15 text-sm space-y-2">
              <p className="font-semibold text-heading">Payroll preview (leave-aware)</p>
              <p className="text-xs text-body">
                Leave days: <strong>{preview.monthLeaveDays || 0}</strong>
                {preview.leaveDeduction ? <> · Deduction: <strong className="text-red-600">{fmt(preview.leaveDeduction)}</strong></> : null}
              </p>
              <p className="text-xs font-medium text-accent">Est. net: {fmt(preview.net_pay || 0)}</p>
            </div>
          )}
          <div className="btn-group-responsive mt-4">
            <button onClick={generate} disabled={generating} className="btn-primary flex items-center gap-2 text-sm">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Generate &amp; email payslip
            </button>
            <button onClick={generateAll} disabled={batchGenerating} className="btn-secondary flex items-center gap-2 text-sm">
              {batchGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              Generate all for month
            </button>
          </div>
        </GlassCard>
      )}

      {isEmployee && (
        <GlassCard>
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-aqua" /> Request Reimbursement
          </h3>
          <p className="text-xs text-muted mb-3">HR receives a Groq-generated email when you submit a claim.</p>
          <div className="form-grid-2 gap-3">
            <select className="input-field" value={reimbForm.category} onChange={(e) => setReimbForm({ ...reimbForm, category: e.target.value })}>
              <option value="travel">Travel</option>
              <option value="meals">Meals</option>
              <option value="equipment">Equipment</option>
              <option value="medical">Medical</option>
              <option value="other">Other</option>
            </select>
            <input type="number" placeholder="Amount (₹)" className="input-field" value={reimbForm.amount} onChange={(e) => setReimbForm({ ...reimbForm, amount: e.target.value })} />
            <input type="text" placeholder="Description" className="input-field md:col-span-2" value={reimbForm.description} onChange={(e) => setReimbForm({ ...reimbForm, description: e.target.value })} />
            <input type="file" className="input-field md:col-span-2 text-sm" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
          </div>
          <button onClick={submitReimbursement} disabled={submittingReimb} className="btn-primary mt-3 flex items-center gap-2 text-sm">
            {submittingReimb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Submit to HR
          </button>
        </GlassCard>
      )}

      <div className="responsive-grid-3">
        {payrolls.map((p) => (
          <GlassCard key={String(p.id)}>
            <div className="flex justify-between items-start mb-3">
              <FileText className="w-5 h-5 text-aqua" />
              {p.anomalyFlag ? <AlertTriangle className="w-4 h-4 text-orange-500" /> : null}
            </div>
            <p className="font-semibold text-heading">{p.employeeName || (isEmployee ? "My payslip" : `Employee #${p.employeeId}`)}</p>
            {p.employeeEmail && !isEmployee && <p className="text-xs text-muted truncate">{p.employeeEmail}</p>}
            <p className="text-sm text-muted mt-1">Month: {String(p.month)}</p>
            <p className="text-2xl font-bold text-heading mt-1">{fmt(Number(p.netPay))}</p>
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
              className="text-xs text-accent mt-2 hover:underline"
            >
              {expandedId === p.id ? "Hide breakdown" : "View earnings & deductions"}
            </button>
            {expandedId === p.id && <PayslipBreakdown p={p} />}
          </GlassCard>
        ))}
      </div>

      {reimbursements.length > 0 && (
        <GlassCard>
          <h3 className="font-bold text-heading mb-4">{isEmployee ? "My reimbursement claims" : "HR — Reimbursement requests"}</h3>
          <div className="space-y-2">
            {reimbursements.map((r) => (
              <div key={r.id} className="flex justify-between items-center p-3 bg-white/50 rounded-xl text-sm">
                <div>
                  <p className="font-medium capitalize">{r.category} — {fmt(r.amount)}</p>
                  <p className="text-xs text-muted">{r.description}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full capitalize ${r.status === "approved" ? "bg-green-100 text-green-800" : r.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
