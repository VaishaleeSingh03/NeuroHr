"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { canAccessRoute, defaultRouteForRole, normalizeRole } from "@/lib/roleAccess";
import Sidebar from "./Sidebar";
import NotificationBell from "@/components/ui/NotificationBell";
import { NotificationProvider } from "@/context/NotificationContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = normalizeRole(user?.role);
  const routeAllowed = role ? canAccessRoute(role, pathname) : false;

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && user && role && pathname.startsWith("/dashboard") && !routeAllowed) {
      router.replace(defaultRouteForRole(role));
    }
  }, [user, loading, role, pathname, router, routeAllowed]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-main">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-aqua border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) return null;

  return (
    <NotificationProvider>
    <div className="flex min-h-screen min-h-[100dvh] relative overflow-x-hidden w-full">
      <div className="hidden lg:block shrink-0">
        <Sidebar />
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-teal-dark/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full z-50 lg:hidden"
            >
              <Sidebar onClose={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-teal-dark/95 backdrop-blur-xl border-b border-aqua/20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-xl bg-white/10 text-inverse hover:bg-white/20 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <p className="text-inverse font-bold text-sm">NeuroHR AI</p>
              <p className="text-accent-light text-xs">{user.name}</p>
            </div>
          </div>
          <NotificationBell />
        </header>

        <div className="hidden lg:flex justify-end px-8 pt-4 -mb-2 relative z-10">
          <NotificationBell variant="light" />
        </div>

        <main className="flex-1 p-3 xs:p-4 sm:p-6 lg:p-8 overflow-x-hidden overflow-y-auto min-w-0 w-full">
          <div key={pathname} className="min-w-0 w-full max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
    </NotificationProvider>
  );
}
