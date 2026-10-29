/** Small, bounded requests shared by the dedicated onboarding forms. */
export async function onboardingRequest<T>(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    const data = await response.json();
    if (!response.ok || data?.ok === false) {
      throw new OnboardingRequestError(data?.message || "Request failed.", response.status, data);
    }
    return data as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

export class OnboardingRequestError extends Error {
  constructor(message: string, readonly status: number, readonly payload: Record<string, unknown>) {
    super(message);
    this.name = "OnboardingRequestError";
  }
}

export async function onboardingTimeout<T>(promise: PromiseLike<T>, timeoutMs = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Request timed out.")), timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
