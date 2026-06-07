"use client";

import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut, Calendar, Users } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import RichTextEditor, { getRichHtml } from "@/components/ui/RichTextEditor";
import { attendanceAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { canCheckIn, canApproveLeave } from "@/lib/roleAccess";

interface AttendanceRecord {
  date: string;
  checkIn?: string;
  checkOut?: string;
  workingHours?: number;
  status: string;
  employeeName?: string;
  employeeEmail?: string;
  employeeCode?: string;
  department?: string;
}

interface LeaveBalance {
  granted: number;
  used: number;
  remaining: number;
}

interface EmployeeLeaveSummary {
  employeeId: number;
  name?: string;
  employmentType?: string;
  balances?: Record<string, LeaveBalance>;
  monthLeaves?: { type: string; fromDate: string; toDate: string; daysInMonth?: number; status?: string }[];
  policyNote?: string;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<Record<string, unknown>[]>([]);
  const [hrBalances, setHrBalances] = useState<EmployeeLeaveSummary[]>([]);
  const [mySummary, setMySummary] = useState<EmployeeLeaveSummary | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: "sick", from_date: "", to_date: "", reason: "" });
  const isEmployee = user?.role === "employee";
  const isHrView = user?.role === "management_admin" || user?.role === "hr_recruiter" || user?.role === "senior_manager";
  const userCanCheckIn = canCheckIn(user?.role);
  const canApprove = canApproveLeave(user?.role);

  const load = () => {
    const api = isEmployee ? attendanceAPI.my() : attendanceAPI.list();
    api.then((r) => setRecords(r.data)).catch(() => {});
    attendanceAPI.leaves().then((r) => setLeaves(r.data)).catch(() => {});
    if (canApprove) {
      attendanceAPI.leaveBalances().then((r) => setHrBalances(r.data.employees || [])).catch(() => {});
    }
  };

  useEffect(() => { load(); }, [user]);

  const checkIn = async () => {
    setCheckingIn(true);
    try {
      const { data } = await attendanceAPI.checkIn();
      toast.success(`Checked in at ${data.checkIn || "now"}`);
      load();
    } catch {
      toast.error("Check-in failed");
    } finally {
      setCheckingIn(false);
    }
  };

  const checkOut = async () => {
    try {
      const { data } = await attendanceAPI.checkOut();
      toast.success(`Checked out at ${data.checkOut || "now"}`);
      load();
    } catch {
      toast.error("Check-out failed");
    }
  };

  const requestLeave = async () => {
    const reason = getRichHtml(leaveForm.reason);
    if (!reason || !leaveForm.from_date || !leaveForm.to_date) {
      toast.error("Fill dates and reason");
      return;
    }
    try {
      const { data } = await attendanceAPI.requestLeave({ ...leaveForm, reason });
      const payload = data as { warning?: string; message?: string; email_sent?: boolean };
      if (payload.email_sent === false) {
        toast.error(payload.message || "Leave saved but HR email failed");
      } else if (payload.warning) {
        toast.success(payload.warning);
      } else {
        toast.success(payload.message || "Leave request submitted");
      }
      setLeaveForm({ type: "sick", from_date: "", to_date: "", reason: "" });
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || "Leave request failed");
    }
  };

  const leaveTypeOptions = isEmployee && mySummary?.employmentType === "internship"
    ? [
      { value: "sick", label: "Sick (6/yr)" },
      { value: "casual", label: "Casual (14/yr)" },
      { value: "unpaid", label: "Unpaid (1/month)" },
    ]
    : [
      { value: "sick", label: "Sick (6/yr)" },
      { value: "casual", label: "Casual (14/yr)" },
      { value: "unpaid", label: "Unpaid (1/month)" },
      { value: "additional", label: "Additional (30/yr)" },
      { value: "maternity", label: "Maternity (6 mo, female)" },
      { value: "medical_full", label: "Medical full pay (1 yr)" },
      { value: "medical_half", label: "Medical half pay (6 mo)" },
    ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-heading">Attendance &amp; Leave</h1>
        <p className="text-muted mt-1">Check-in, leave requests, balances — payroll deducts only when leave exceeds grant</p>
      </div>

      {canApprove && hrBalances.length > 0 && (
        <GlassCard>
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-aqua" /> HR — Employee leave balances (this year)
          </h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {hrBalances.map((emp) => (
              <div key={emp.employeeId} className="p-3 rounded-xl border border-aqua/15 bg-white/50">
                <p className="font-semibold text-heading">{emp.name} <span className="text-xs text-muted capitalize">({emp.employmentType?.replace("_", " ")})</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
                  {emp.balances && Object.entries(emp.balances).filter(([, b]) => b.granted > 0).map(([k, b]) => (
                    <div key={k} className="bg-cream/60 rounded-lg px-2 py-1">
                      <span className="text-label capitalize">{k.replace("_", " ")}</span>
                      <p className="font-medium">{b.remaining}/{b.granted} left</p>
                    </div>
                  ))}
                </div>
                {(emp.monthLeaves?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted mt-2">This month: {emp.monthLeaves!.map((l) => `${l.type} ${l.daysInMonth}d`).join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {userCanCheckIn && (
          <GlassCard>
            <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-aqua" /> Today&apos;s Attendance
            </h3>
            <div className="flex gap-3">
              <button onClick={checkIn} disabled={checkingIn} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" /> {checkingIn ? "Checking in…" : "Check In"}
              </button>
              <button onClick={checkOut} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                <LogOut className="w-4 h-4" /> Check Out
              </button>
            </div>
          </GlassCard>
        )}

        <GlassCard>
          <h3 className="font-bold text-heading mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-aqua" /> Request Leave
          </h3>
          <div className="space-y-3">
            <select className="input-field" value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}>
              {leaveTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input type="date" className="input-field" value={leaveForm.from_date} onChange={(e) => setLeaveForm({ ...leaveForm, from_date: e.target.value })} />
            <input type="date" className="input-field" value={leaveForm.to_date} onChange={(e) => setLeaveForm({ ...leaveForm, to_date: e.target.value })} />
            <RichTextEditor value={leaveForm.reason} onChange={(html) => setLeaveForm({ ...leaveForm, reason: html })} placeholder="Reason" minHeight="80px" />
            <button onClick={requestLeave} className="btn-primary w-full">Submit Leave Request</button>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <h3 className="font-bold text-heading mb-4">
          {isHrView && !isEmployee ? "HR — All employee attendance" : "Attendance Records"}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b">
                {isHrView && !isEmployee && <th className="pb-2 pr-3">Employee</th>}
                <th className="pb-2">Date</th>
                <th className="pb-2">Check In</th>
                <th className="pb-2">Check Out</th>
                <th className="pb-2">Hours</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={`${r.employeeCode || ""}-${r.date}-${idx}`} className="border-b border-gray-50">
                  {isHrView && !isEmployee && (
                    <td className="py-2 pr-3">
                      <p className="font-medium text-heading">{r.employeeName || "—"}</p>
                      <p className="text-xs text-muted">{r.employeeCode}{r.department ? ` · ${r.department}` : ""}</p>
                    </td>
                  )}
                  <td className="py-2">{r.date}</td>
                  <td>{r.checkIn || "—"}</td>
                  <td>{r.checkOut || "—"}</td>
                  <td>{r.workingHours?.toFixed(1) || "—"}</td>
                  <td className="capitalize">{r.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {leaves.length > 0 && (
        <GlassCard>
          <h3 className="font-bold text-heading mb-4">Leave Requests</h3>
          <div className="space-y-2">
            {(leaves as Record<string, unknown>[]).map((l) => (
              <div key={String(l.id)} className="flex justify-between items-center p-3 bg-white/50 rounded-xl">
                <div>
                  <p className="font-medium capitalize">
                    {String(l.employeeName || "")} {l.employeeName ? "· " : ""}{String(l.type)} — {String(l.fromDate)} to {String(l.toDate)}
                  </p>
                  <p className="text-xs text-label capitalize">Status: {String(l.status)} · {String(l.days || "")} day(s)</p>
                </div>
                {canApprove && l.status === "pending" && (
                  <button onClick={() => attendanceAPI.approveLeave(l.id as number).then(load)} className="text-xs text-aqua hover:underline">Approve</button>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
