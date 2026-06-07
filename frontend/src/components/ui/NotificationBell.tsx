"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, XCircle } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import RichTextContent from "@/components/ui/RichTextContent";

export default function NotificationBell({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const btnClass =
    variant === "light"
      ? "relative p-2 rounded-xl bg-cream border border-aqua/20 hover:bg-aqua/10 text-heading transition-colors"
      : "relative p-2 rounded-xl bg-white/10 hover:bg-white/20 text-inverse transition-colors";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={btnClass}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl shadow-xl border border-aqua/20 z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-aqua/10">
              <p className="font-bold text-heading text-sm">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs text-accent hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-muted p-4 text-center">No notifications yet</p>
            ) : (
              items.slice(0, 20).map((n) => {
                const rejected = n.type === "application_rejected";
                return (
                  <Link
                    key={n.id}
                    href={n.link || "/dashboard"}
                    onClick={() => { markRead(n.id); setOpen(false); }}
                    className={`block px-4 py-3 border-b border-aqua/5 hover:bg-cream/50 ${
                      !n.read
                        ? rejected ? "bg-red-50 border-l-4 border-l-red-400" : "bg-aqua/5"
                        : rejected ? "border-l-4 border-l-red-200" : ""
                    }`}
                  >
                    <p className={`text-sm font-semibold flex items-center gap-1.5 ${rejected ? "text-red-700" : "text-heading"}`}>
                      {rejected && <XCircle className="w-4 h-4 flex-shrink-0" />}
                      {n.title}
                    </p>
                    <div className={`mt-0.5 max-h-16 overflow-hidden ${rejected ? "text-red-600" : "text-muted"}`}>
                      <RichTextContent content={n.message} variant="on-light" className="text-xs" />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
