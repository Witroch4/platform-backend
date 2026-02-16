// services/openai-components/utils.ts

/**
 * Executes an operation with a real AbortController and deadline management
 * Uses HARD deadline (AbortSignal) + SOFT deadline (Promise.race) for robust timeout
 * @param fn Function to execute with abort signal
 * @param ms Deadline in milliseconds (default: 15000ms)
 * @returns Result of the operation or null if aborted
 *
 * ✅ FIXED: Race condition where abort happened AFTER successful response
 * - Now checks if operation completed successfully before aborting
 * - Properly clears timers on success to prevent abort after completion
 * - Ensures abort only happens when operation is genuinely slow
 */
export async function withDeadlineAbort<T>(fn: (signal: AbortSignal) => Promise<T>, ms = 15000): Promise<T | null> {
	const controller = new AbortController();

	let softTimeoutId: NodeJS.Timeout | null = null;
	let hardTimeoutId: NodeJS.Timeout | null = null;
	let completed = false; // ✅ Track completion to prevent abort after success

	try {
		// Create a race between the operation and deadline
		const resultPromise = fn(controller.signal).then((result) => {
			// ✅ Mark as completed BEFORE clearing timers
			completed = true;
			// Clear all timers immediately on success
			if (softTimeoutId) clearTimeout(softTimeoutId);
			if (hardTimeoutId) clearTimeout(hardTimeoutId);
			return result;
		});

		const deadlinePromise = new Promise<null>((resolve) => {
			softTimeoutId = setTimeout(() => {
				// ✅ Only abort if operation hasn't completed
				if (!completed) {
					console.warn(`⏰ SOFT DEADLINE reached after ${ms}ms - aborting operation`);
					controller.abort();
				}
				resolve(null);
			}, ms);

			// Hard deadline as backup (should rarely be needed)
			hardTimeoutId = setTimeout(() => {
				if (!completed) {
					console.error(`❌ HARD DEADLINE EXCEEDED after ${ms + 5000}ms - critical timeout`);
					controller.abort();
				}
				resolve(null);
			}, ms + 5000); // Hard deadline is +5s after soft
		});

		const result = await Promise.race([resultPromise, deadlinePromise]);

		// Final cleanup (insurance - timers should already be cleared)
		if (softTimeoutId) clearTimeout(softTimeoutId);
		if (hardTimeoutId) clearTimeout(hardTimeoutId);

		return result;
	} catch (error: any) {
		// Mark as completed to prevent further abort attempts
		completed = true;

		// Clear all timeouts on error
		if (softTimeoutId) clearTimeout(softTimeoutId);
		if (hardTimeoutId) clearTimeout(hardTimeoutId);

		if (error.name === "AbortError" || controller.signal.aborted) {
			console.warn(`🚫 LLM call aborted - timeout reached`);
			return null;
		}

		throw error;
	}
}
