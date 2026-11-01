import OpenAI from "openai";
import { hasBudget, type Deadline } from "@/lib/ai/budget";

export function recoverablePickerError(error: unknown) {
  return error instanceof OpenAI.APIError && (error.status === undefined ||
    [408, 409, 429].includes(error.status) || error.status >= 500);
}

/** One alternate-model attempt, inside the original reservation and deadline. */
export async function recoverPickerRun<T>(options: {
  primary: () => Promise<T>; backup: (() => Promise<T>) | null; deadline: Deadline;
  onFailure: (error: unknown, backup: boolean) => void;
  onRecovery: () => Promise<void>;
}): Promise<T> {
  try { return await options.primary(); }
  catch (error) {
    options.onFailure(error, false);
    if (!options.backup || !recoverablePickerError(error) || !hasBudget(options.deadline, 45_000)) throw error;
    await options.onRecovery();
    try { return await options.backup(); }
    catch (retryError) { options.onFailure(retryError, true); throw retryError; }
  }
}

/** Fixed fields only: never log provider bodies, prompts, cookies or credentials. */
export function pickerFailureDiagnostic(error: unknown) {
  return {
    httpStatus: error instanceof OpenAI.APIError ? error.status ?? null : null,
    category: error instanceof OpenAI.APIConnectionTimeoutError ? "timeout" :
      error instanceof OpenAI.APIConnectionError ? "connection" :
      error instanceof OpenAI.APIError ? "provider" : "application",
  };
}
