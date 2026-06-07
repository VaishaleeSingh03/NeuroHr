"use client";

import { useEffect, useState } from "react";
import { Users, Shield } from "lucide-react";
import toast from "react-hot-toast";
import GlassCard from "@/components/ui/GlassCard";
import StatCard from "@/components/ui/StatCard";
import { adminAPI } from "@/lib/api";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive?: boolean;
  is_active?: boolean;
}

const ROLES = ["management_admin", "senior_manager", "hr_recruiter", "employee", "candidate"];

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });

  const load = () => adminAPI.users().then((r) => setUsers(r.data)).catch(() => {});

  useEffect(() => { load(); }, []);

  const createUser = async () => {
    try {
      await adminAPI.createUser(form);
      toast.success("User created");
      setForm({ name: "", email: "", password: "", role: "employee" });
      load();
    } catch {
      toast.error("Failed to create user");
    }
  };

  const roleCounts = ROLES.reduce((acc, r) => {
    acc[r] = users.filter((u) => u.role === r).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="page-container">
      <div className="page-header min-w-0">
        <h1 className="page-title">Admin Panel</h1>
        <p className="page-subtitle">User management and platform administration</p>
      </div>

      <div className="responsive-grid-4">
        <StatCard title="Total Users" value={users.length} icon={Users} />
        <StatCard title="Admins" value={roleCounts.management_admin || 0} icon={Shield} delay={0.1} />
        <StatCard title="Recruiters" value={roleCounts.hr_recruiter || 0} icon={Users} delay={0.2} />
        <StatCard title="Employees" value={roleCounts.employee || 0} icon={Users} delay={0.3} />
      </div>

      <GlassCard>
        <h3 className="font-bold text-heading mb-4">Create User</h3>
        <div className="form-grid-2 lg:grid-cols-4">
          <input className="input-field" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input-field" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input-field" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
          </select>
          <button onClick={createUser} className="btn-primary sm:col-span-2 lg:col-span-4 w-full">Create User</button>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="font-bold text-heading mb-4">User Management</h3>
        <div className="data-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-aqua/10">
                <th className="text-left py-3 px-4 text-muted font-medium">Name</th>
                <th className="text-left py-3 px-4 text-muted font-medium">Email</th>
                <th className="text-left py-3 px-4 text-muted font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-aqua/5 hover:bg-aqua/5">
                  <td className="py-3 px-4 font-medium text-heading">{u.name}</td>
                  <td className="py-3 px-4 text-body">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 bg-aqua/10 text-aqua rounded-full text-xs">{u.role?.replace(/_/g, " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
