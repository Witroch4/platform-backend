
// services/openai-components/utils.ts

/**
 * Executes an operation with a real AbortController and deadline management
 * @param fn Function to execute with abort signal
 * @param ms Deadline in milliseconds (default: 250ms)
 * @returns Result of the operation or null if aborted
 */
export async function withDeadlineAbort<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms = 250
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.warn(`⏰ Operation aborted after ${ms}ms deadline`);
    controller.abort();
  }, ms);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timeout);
    return result;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === "AbortError" || controller.signal.aborted) {
      console.warn(`🚫 LLM call aborted after ${ms}ms`);
      return null;
    }
    throw error;
  }
}
