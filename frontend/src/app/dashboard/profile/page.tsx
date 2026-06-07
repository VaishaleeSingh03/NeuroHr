"use client";

import { useEffect, useState } from "react";
import GlassCard from "@/components/ui/GlassCard";
import { useAuth } from "@/context/AuthContext";
import { analyticsAPI } from "@/lib/api";

export default function ProfilePage() {
  const { user } = useAuth();
  const [portal, setPortal] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    analyticsAPI.portal().then((r) => setPortal(r.data)).catch(() => {});
  }, []);

  const emp = portal?.employee as Record<string, unknown> | null;

  return (
    <div className="page-container">
      <h1 className="page-title">My Profile</h1>
      <GlassCard>
        <div className="form-grid-2 gap-6">
          <div>
            <p className="text-sm text-muted">Name</p>
            <p className="font-semibold text-heading">{user?.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Email</p>
            <p className="font-semibold">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Role</p>
            <p className="font-semibold capitalize">{user?.role?.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Department</p>
            <p className="font-semibold">{String(emp?.department || user?.department || "—")}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Designation</p>
            <p className="font-semibold">{String(emp?.designation || "—")}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Employee ID</p>
            <p className="font-semibold">{String(emp?.employeeId || "—")}</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
