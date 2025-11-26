
// services/openai-components/utils.ts

/**
 * Executes an operation with a real AbortController and deadline management
 * Uses HARD deadline (AbortSignal) + SOFT deadline (Promise.race) for robust timeout
 * @param fn Function to execute with abort signal
 * @param ms Deadline in milliseconds (default: 15000ms)
 * @returns Result of the operation or null if aborted
 *
 * ⚠️ CRITICAL FIX:
 * - AbortSignal alone doesn't guarantee HTTP cleanup in all scenarios (Network overhead, slow clients)
 * - Solution: Promise.race with 85-90% soft deadline to force timeout BEFORE hard deadline expires
 * - This ensures that downstream timeouts (Chatwit's 30s) are respected
 */
export async function withDeadlineAbort<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms = 15000
): Promise<T | null> {
  const controller = new AbortController();

  // Soft deadline: 85% of hard deadline to ensure Promise cleanup
  const softDeadlineMs = Math.max(Math.floor(ms * 0.85), ms - 2000);

  let hardTimeoutId: NodeJS.Timeout | null = null;
  let softTimeoutId: NodeJS.Timeout | null = null;

  try {
    // Create a race between the operation and soft deadline
    const resultPromise = fn(controller.signal);

    const deadlinePromise = new Promise<null>((resolve) => {
      softTimeoutId = setTimeout(() => {
        console.warn(`⏰ SOFT DEADLINE reached after ${softDeadlineMs}ms - forcing cleanup`);
        controller.abort();
        resolve(null);
      }, softDeadlineMs);

      // Hard deadline as backup (should not be reached in normal cases)
      hardTimeoutId = setTimeout(() => {
        console.error(`❌ HARD DEADLINE EXCEEDED after ${ms}ms - critical timeout`);
        controller.abort();
        resolve(null);
      }, ms);
    });

    const result = await Promise.race([resultPromise, deadlinePromise]);

    // Clear all timeouts on success
    if (hardTimeoutId) clearTimeout(hardTimeoutId);
    if (softTimeoutId) clearTimeout(softTimeoutId);

    return result;
  } catch (error: any) {
    // Clear all timeouts on error
    if (hardTimeoutId) clearTimeout(hardTimeoutId);
    if (softTimeoutId) clearTimeout(softTimeoutId);

    if (error.name === "AbortError" || controller.signal.aborted) {
      console.warn(`🚫 LLM call aborted - AbortSignal activated`);
      return null;
    }

    throw error;
  }
}
