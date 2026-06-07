"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { notificationsAPI } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/lib/notificationEvents";

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

interface NotificationContextValue {
  items: NotificationItem[];
  unread: number;
  refresh: (options?: { notify?: boolean }) => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function showNotificationToast(latest: NotificationItem) {
  if (latest.type === "application_rejected") {
    toast.error(
      latest.message ? `${latest.title} — ${latest.message}` : latest.title,
      { duration: 8000 },
    );
    return;
  }
  toast(latest.title, { icon: "🔔" });
}

function NotificationProviderInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const bootstrappedRef = useRef(false);

  const refresh = useCallback(async (options?: { notify?: boolean }) => {
    if (!user) return;
    try {
      const { data } = await notificationsAPI.list();
      const list = (data.items || []) as NotificationItem[];
      setItems(list);
      setUnread(data.unread || 0);

      const shouldNotify = options?.notify !== false;
      if (shouldNotify && bootstrappedRef.current && list.length > 0) {
        const unseen = list.filter((n) => !seenIdsRef.current.has(n.id) && !n.read);
        if (unseen.length > 0) {
          showNotificationToast(unseen[0]);
        }
      }

      list.forEach((n) => seenIdsRef.current.add(n.id));
      bootstrappedRef.current = true;
    } catch {
      /* silent */
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnread(0);
      seenIdsRef.current = new Set();
      bootstrappedRef.current = false;
      return;
    }

    seenIdsRef.current = new Set();
    bootstrappedRef.current = false;
    void refresh({ notify: false });

    const onRefresh = () => {
      void refresh({ notify: true });
    };

    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    };
  }, [user, refresh]);

  const markRead = async (id: number) => {
    await notificationsAPI.markRead(id);
    await refresh({ notify: false });
  };

  const markAllRead = async () => {
    await notificationsAPI.markAllRead();
    await refresh({ notify: false });
  };

  return (
    <NotificationContext.Provider value={{ items, unread, refresh, markRead, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  return <NotificationProviderInner>{children}</NotificationProviderInner>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
