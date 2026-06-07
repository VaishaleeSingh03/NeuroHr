export function getApiErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { error?: string; detail?: string } } }).response?.data;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function unwrapListResponse<T>(data: { items?: T[] } | T[]): T[] {
  if (Array.isArray(data)) return data;
  return data.items || [];
}
