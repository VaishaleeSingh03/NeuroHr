/** Session sync so the JD view route reflects in-progress editor changes (reference-repo live preview). */

const HTML_KEY = "neurohr:jd-live:";
const TITLE_KEY = "neurohr:jd-title-live:";
export const JD_LIVE_UPDATE_EVENT = "neurohr-jd-live-update";

export function setLiveJd(jobId: number, html: string, title?: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(`${HTML_KEY}${jobId}`, html);
  if (title != null) {
    sessionStorage.setItem(`${TITLE_KEY}${jobId}`, title);
  }
  window.dispatchEvent(
    new CustomEvent(JD_LIVE_UPDATE_EVENT, {
      detail: { jobId, html, title },
    }),
  );
}

export function getLiveJd(jobId: number): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(`${HTML_KEY}${jobId}`);
}

export function getLiveJdTitle(jobId: number): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(`${TITLE_KEY}${jobId}`);
}

export function clearLiveJd(jobId: number) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(`${HTML_KEY}${jobId}`);
  sessionStorage.removeItem(`${TITLE_KEY}${jobId}`);
}

export function subscribeLiveJd(
  jobId: number,
  onUpdate: (payload: { html: string; title?: string }) => void,
) {
  if (typeof window === "undefined") return () => {};

  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<{ jobId: number; html: string; title?: string }>).detail;
    if (detail?.jobId === jobId) {
      onUpdate({ html: detail.html, title: detail.title });
    }
  };

  window.addEventListener(JD_LIVE_UPDATE_EVENT, onEvent);
  return () => window.removeEventListener(JD_LIVE_UPDATE_EVENT, onEvent);
}
