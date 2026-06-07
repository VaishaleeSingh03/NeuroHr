export const NOTIFICATIONS_REFRESH_EVENT = "neurohr:notifications-refresh";

export function dispatchNotificationsRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATIONS_REFRESH_EVENT));
  }
}
