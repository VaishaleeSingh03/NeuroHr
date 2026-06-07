"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Brain, Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import PageHeader from "@/components/ui/PageHeader";
import { employeesAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Employee {
  id: number;
  employeeId: string;
  personalDetails: { name: string; email: string };
  department: string;
  designation: string;
  skills: string[];
  aiPerformanceScore: number;
  status?: string;
  salary?: { basic?: number; allowance?: number; aiSuggested?: boolean };
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    department: "Engineering",
    designation: "Developer",
    skills: "",
    basic: "",
    allowance: "",
    employment_type: "full_time" as "full_time" | "internship",
    gender: "other" as "male" | "female" | "other",
  });
  const canManage = user?.role === "management_admin" || user?.role === "hr_recruiter";

  const load = () => {
    employeesAPI.list().then((r) => setEmployees(r.data.items || r.data)).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const suggestSalary = async () => {
    if (!form.designation.trim()) {
      toast.error("Enter designation first");
      return;
    }
    setSuggesting(true);
    try {
      const { data } = await employeesAPI.suggestSalary({
        name: form.name,
        designation: form.designation,
        department: form.department,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      });
      const payload = data as { basic: number; allowance: number; notes?: string; generated_by?: string };
      setForm((f) => ({
        ...f,
        basic: String(payload.basic),
        allowance: String(payload.allowance),
      }));
      toast.success(`AI salary: ₹${payload.basic.toLocaleString("en-IN")} + ₹${payload.allowance.toLocaleString("en-IN")} allowance`);
    } catch {
      toast.error("AI salary suggestion unavailable");
    } finally {
      setSuggesting(false);
    }
  };

  const create = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setCreating(true);
    try {
      const skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
      const basic = Number(form.basic);
      const allowance = Number(form.allowance);
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        department: form.department,
        designation: form.designation,
        skills,
        employment_type: form.employment_type,
        gender: form.gender,
        ai_salary: !(basic > 0),
      };
      if (basic > 0) {
        payload.salary = { basic, allowance: allowance || Math.round(basic * 0.1), bonus: 0, currency: "INR" };
      }
      const { data } = await employeesAPI.create(payload);
      const emp = data as Employee;
      const sal = emp.salary;
      toast.success(
        sal?.basic
          ? `Employee added — salary ₹${sal.basic?.toLocaleString("en-IN")}/month${sal.aiSuggested ? " (AI suggested)" : ""}`
          : "Employee added",
      );
      setShowForm(false);
      setForm({ name: "", email: "", phone: "", department: "Engineering", designation: "Developer", skills: "", basic: "", allowance: "", employment_type: "full_time", gender: "other" });
      load();
    } catch {
      toast.error("Failed to create employee");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Employee Management"
        subtitle="Create employees with AI salary — payroll emails sent when HR generates monthly payslips"
        icon={Users}
        action={canManage && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> <span className="hidden xs:inline">Add Employee</span>
          </button>
        )}
      />

      {showForm && (
        <GlassCard hover={false}>
          <p className="text-xs text-muted mb-3">
            AI suggests monthly basic + allowance from role and skills. Leave salary blank to auto-apply on create.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {["name", "email", "phone", "department", "designation"].map((f) => (
              <input key={f} placeholder={f.charAt(0).toUpperCase() + f.slice(1)} className="input-field"
                value={(form as Record<string, string>)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
            ))}
            <input placeholder="Skills (comma separated)" className="input-field sm:col-span-2" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
            <select className="input-field" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value as "full_time" | "internship" })}>
              <option value="full_time">Full-time (full pay + extra leaves)</option>
              <option value="internship">Internship</option>
            </select>
            <select className="input-field" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as "male" | "female" | "other" })}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
            <input type="number" placeholder="Monthly basic (₹) — optional" className="input-field" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} />
            <input type="number" placeholder="Monthly allowance (₹) — optional" className="input-field" value={form.allowance} onChange={(e) => setForm({ ...form, allowance: e.target.value })} />
            <button type="button" onClick={suggestSalary} disabled={suggesting} className="btn-secondary sm:col-span-2 flex items-center justify-center gap-2 text-sm">
              {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              AI suggest salary for this role
            </button>
            <button onClick={create} disabled={creating} className="btn-primary sm:col-span-2 flex items-center justify-center gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Employee
            </button>
          </div>
        </GlassCard>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
      ) : (
        <div className="responsive-grid-3">
          {employees.map((emp, i) => (
            <motion.div key={emp.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <GlassCard>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-aqua/15 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 sm:w-6 sm:h-6 text-accent" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs bg-cream px-2 py-1 rounded-lg text-heading">{emp.employeeId}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-800">{emp.status || "active"}</span>
                  </div>
                </div>
                <h3 className="font-bold text-heading truncate">{emp.personalDetails?.name}</h3>
                <p className="text-sm text-muted">{emp.designation} · {emp.department}</p>
                <p className="text-xs text-label mt-1 truncate">{emp.personalDetails?.email}</p>
                {emp.salary?.basic ? (
                  <p className="text-xs text-accent mt-2">
                    ₹{emp.salary.basic.toLocaleString("en-IN")}/mo
                    {emp.salary.allowance ? ` + ₹${emp.salary.allowance.toLocaleString("en-IN")} allowance` : ""}
                    {emp.salary.aiSuggested ? " · AI" : ""}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1 mt-3">
                  {(emp.skills || []).slice(0, 4).map((s) => (
                    <span key={s} className="tag-skill">{s}</span>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-aqua/10">
                  <span className="text-sm text-body">AI Score: <strong className="text-accent">{emp.aiPerformanceScore || 0}%</strong></span>
                  <button onClick={async () => {
                    try {
                      const { data } = await employeesAPI.aiInsights(emp.id);
                      toast.success(`AI: ${data.performance_score}% | Promo: ${data.promotion_chance}%`);
                      load();
                    } catch { toast.error("AI insights unavailable"); }
                  }} className="text-xs text-accent flex items-center gap-1 hover:underline">
                    <Brain className="w-3 h-3" /> Insights
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
