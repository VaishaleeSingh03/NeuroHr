"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, UserPlus, ArrowRight } from "lucide-react";
import { useAuth, UserRole } from "@/context/AuthContext";
import { defaultRouteForRole } from "@/lib/roleAccess";
import toast from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/errors";

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: "candidate", label: "Candidate", description: "Apply for jobs and take AI interviews" },
  { value: "employee", label: "Employee", description: "Attendance, payroll, performance, view schedules" },
  { value: "hr_recruiter", label: "HR Recruiter", description: "Screening, jobs, schedule interviews, onboarding" },
  { value: "senior_manager", label: "Senior Manager", description: "Team oversight, schedule interviews, analytics" },
  { value: "management_admin", label: "Management Admin", description: "Full platform access and administration" },
];

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<UserRole>("candidate");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password, role);
      toast.success("Account created! Welcome to NeuroHR AI.");
      router.push(defaultRouteForRole(role));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Registration failed. Try a different email."));
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === role);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-gradient-main overflow-x-hidden">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md sm:max-w-lg min-w-0">
        <div className="glass-card p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-aqua rounded-xl flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-inverse" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-heading">Create Account</h1>
              <p className="text-xs text-muted">Choose your role — access matches your selection</p>
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-label mb-1 block">Full name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Your name" required />
            </div>
            <div>
              <label className="text-sm font-medium text-label mb-1 block">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="you@email.com" required />
            </div>
            <div>
              <label className="text-sm font-medium text-label mb-1 block">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="input-field"
                required
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {selectedRole && (
                <p className="text-xs text-muted mt-1.5">{selectedRole.description}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-label mb-1 block">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Min. 6 characters" required minLength={6} />
            </div>
            <div>
              <label className="text-sm font-medium text-label mb-1 block">Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input-field" placeholder="Repeat password" required minLength={6} />
            </div>
            <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.98 }} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? "Creating account..." : "Create Account"}
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </form>

          <p className="text-sm text-muted text-center mt-6">
            Already have an account?{" "}
            <Link href="/" className="text-accent font-semibold hover:underline">
              Sign in
            </Link>
          </p>

          <div className="flex items-center justify-center gap-2 mt-6 text-xs text-muted">
            <Sparkles className="w-3 h-3 text-accent" />
            <span>NeuroHR AI</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
