"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, Brain, Users, BarChart3, Shield, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { defaultRouteForRole, normalizeRole } from "@/lib/roleAccess";
import toast from "react-hot-toast";

const features = [
  { icon: Brain, label: "ML Screening" },
  { icon: Users, label: "AI Interviews" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Shield, label: "RBAC Security" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, loading: authLoading, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(defaultRouteForRole(normalizeRole(user.role) || user.role));
    }
  }, [user, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome to NeuroHR AI!");
      const saved = JSON.parse(localStorage.getItem("user") || "{}");
      router.push(saved.role ? defaultRouteForRole(saved.role) : "/dashboard");
    } catch {
      toast.error("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-main">
        <div className="w-10 h-10 border-4 border-aqua border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-sidebar">
        <div className="absolute inset-0 bg-gradient-to-br from-aqua/30 to-transparent" />
        <div className="relative z-10 flex flex-col justify-center px-8 xl:px-16 text-inverse">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="flex items-center gap-3 mb-8">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity }} className="w-14 h-14 bg-aqua rounded-2xl flex items-center justify-center shadow-glow">
                <Sparkles className="w-8 h-8" />
              </motion.div>
              <div>
                <h1 className="text-2xl xl:text-3xl font-bold text-inverse">NeuroHR AI</h1>
                <p className="text-accent-light">Enterprise AI Powered HRMS</p>
              </div>
            </div>

            <h2 className="text-3xl xl:text-4xl font-bold mb-6 leading-tight text-inverse">
              Transform HR with<br />
              <span className="text-accent-light">Intelligent Automation</span>
            </h2>
            <p className="text-inverse/70 text-base xl:text-lg mb-10 max-w-md">
              AI resume screening, voice & video interviews, ML model training,
              payroll automation, and workforce analytics — all in one platform.
            </p>

            <div className="grid grid-cols-2 gap-3 xl:gap-4">
              {features.map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  whileHover={{ scale: 1.03 }}
                  className="flex items-center gap-3 bg-white/10 rounded-xl p-3 xl:p-4 backdrop-blur-sm"
                >
                  <item.icon className="w-5 h-5 text-accent-light" />
                  <span className="text-sm font-medium text-inverse">{item.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
        <div className="absolute bottom-0 right-0 w-64 xl:w-96 h-64 xl:h-96 bg-aqua/10 rounded-full blur-3xl" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <div className="glass-card p-6 sm:p-8">
            <div className="lg:hidden flex items-center gap-2 mb-6">
              <div className="w-10 h-10 bg-aqua rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-inverse" />
              </div>
              <div>
                <p className="font-bold text-heading">NeuroHR AI</p>
                <p className="text-xs text-muted">Enterprise HRMS</p>
              </div>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-heading mb-2">Welcome Back</h2>
            <p className="text-muted mb-6 sm:mb-8">Sign in to your account</p>

            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5" autoComplete="off">
              <div>
                <label className="text-sm font-medium text-label mb-1 block" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="Enter your email"
                  autoComplete="off"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-label mb-1 block" htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.98 }} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? "Signing in..." : "Sign In"}
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </form>

            <p className="text-sm text-muted text-center mt-6">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-accent font-semibold hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
