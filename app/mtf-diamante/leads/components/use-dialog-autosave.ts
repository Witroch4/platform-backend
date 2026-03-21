"use client";

import { useEffect, useRef, useState } from "react";

interface UseDialogAutosaveOptions<T> {
	storageKey: string;
	isOpen: boolean;
	initialValue: T;
	value: T;
	onRestore: (value: T) => void;
	onAutoSave?: (value: T) => Promise<void>;
	enabled?: boolean;
	autosaveDebounceMs?: number;
	persistDebounceMs?: number;
	serialize?: (value: T) => string;
	deserialize?: (raw: string) => T;
	areEqual?: (left: T, right: T) => boolean;
}

interface UseDialogAutosaveResult {
	isAutoSaving: boolean;
	hasDraft: boolean;
	clearDraft: () => void;
	flushAutosave: () => Promise<void>;
}

function defaultSerialize<T>(value: T): string {
	return typeof value === "string" ? value : JSON.stringify(value);
}

function defaultDeserialize<T>(raw: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch {
		return raw as T;
	}
}

export function useDialogAutosave<T>({
	storageKey,
	isOpen,
	initialValue,
	value,
	onRestore,
	onAutoSave,
	enabled = true,
	autosaveDebounceMs = 1200,
	persistDebounceMs = 250,
	serialize = defaultSerialize,
	deserialize = defaultDeserialize,
	areEqual,
}: UseDialogAutosaveOptions<T>): UseDialogAutosaveResult {
	const [isAutoSaving, setIsAutoSaving] = useState(false);
	const [hasDraft, setHasDraft] = useState(false);
	const wasOpenRef = useRef(false);
	const restoreCompletedRef = useRef(false);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestValueRef = useRef(value);
	const latestInitialValueRef = useRef(initialValue);
	const lastSavedRawRef = useRef(serialize(initialValue));
	const latestSaveIdRef = useRef(0);

	const valuesAreEqual = (left: T, right: T) => {
		if (areEqual) {
			return areEqual(left, right);
		}
		return serialize(left) === serialize(right);
	};

	const clearDraft = () => {
		if (typeof window === "undefined") {
			return;
		}

		window.localStorage.removeItem(storageKey);
		setHasDraft(false);
	};

	const flushAutosave = async () => {
		if (!onAutoSave || !enabled) {
			return;
		}

		const currentValue = latestValueRef.current;
		if (valuesAreEqual(currentValue, latestInitialValueRef.current)) {
			lastSavedRawRef.current = serialize(currentValue);
			clearDraft();
			return;
		}

		const currentRaw = serialize(currentValue);
		if (currentRaw === lastSavedRawRef.current) {
			clearDraft();
			return;
		}

		const saveId = ++latestSaveIdRef.current;
		setIsAutoSaving(true);

		try {
			await onAutoSave(currentValue);
			if (saveId !== latestSaveIdRef.current) {
				return;
			}
			lastSavedRawRef.current = currentRaw;
			clearDraft();
		} finally {
			if (saveId === latestSaveIdRef.current) {
				setIsAutoSaving(false);
			}
		}
	};

	useEffect(() => {
		latestValueRef.current = value;
	}, [value]);

	useEffect(() => {
		latestInitialValueRef.current = initialValue;
	}, [initialValue]);

	useEffect(() => {
		if (!isOpen && wasOpenRef.current) {
			wasOpenRef.current = false;
			restoreCompletedRef.current = false;
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}
			if (persistTimerRef.current) {
				clearTimeout(persistTimerRef.current);
				persistTimerRef.current = null;
			}
			setIsAutoSaving(false);
			return;
		}

		if (!isOpen || wasOpenRef.current) {
			return;
		}

		wasOpenRef.current = true;
		restoreCompletedRef.current = true;
		lastSavedRawRef.current = serialize(initialValue);

		if (typeof window === "undefined") {
			onRestore(initialValue);
			setHasDraft(false);
			return;
		}

		const storedRaw = window.localStorage.getItem(storageKey);
		if (storedRaw === null) {
			onRestore(initialValue);
			setHasDraft(false);
			return;
		}

		try {
			onRestore(deserialize(storedRaw));
			setHasDraft(true);
		} catch {
			window.localStorage.removeItem(storageKey);
			onRestore(initialValue);
			setHasDraft(false);
		}
	}, [deserialize, initialValue, isOpen, onRestore, serialize, storageKey]);

	useEffect(() => {
		if (!isOpen || !restoreCompletedRef.current || typeof window === "undefined") {
			return;
		}

		const currentValue = latestValueRef.current;
		const initial = latestInitialValueRef.current;

		if (persistTimerRef.current) {
			clearTimeout(persistTimerRef.current);
		}

		persistTimerRef.current = setTimeout(() => {
			if (valuesAreEqual(currentValue, initial)) {
				window.localStorage.removeItem(storageKey);
				setHasDraft(false);
				return;
			}

			window.localStorage.setItem(storageKey, serialize(currentValue));
			setHasDraft(true);
		}, persistDebounceMs);

		return () => {
			if (persistTimerRef.current) {
				clearTimeout(persistTimerRef.current);
				persistTimerRef.current = null;
			}
		};
	}, [isOpen, persistDebounceMs, serialize, storageKey, value]);

	useEffect(() => {
		if (!isOpen || !restoreCompletedRef.current || !enabled || !onAutoSave) {
			return;
		}

		const currentValue = latestValueRef.current;
		const currentRaw = serialize(currentValue);

		if (currentRaw === lastSavedRawRef.current) {
			return;
		}

		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}

		saveTimerRef.current = setTimeout(() => {
			void flushAutosave();
		}, autosaveDebounceMs);

		return () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}
		};
	}, [autosaveDebounceMs, enabled, flushAutosave, isOpen, onAutoSave, serialize, value]);

	return {
		isAutoSaving,
		hasDraft,
		clearDraft,
		flushAutosave,
	};
}