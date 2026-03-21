"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface ButtonReaction {
	id?: string;
	buttonId: string;
	buttonText: string;
	messageId?: string;
	emoji?: string;
	textReaction?: string;
	action?: string; // "handoff", "end_conversation", etc.
	createdAt?: string;
	updatedAt?: string;
}

interface UseButtonReactionsProps {
	messageId?: string;
}

export function useButtonReactions({ messageId }: UseButtonReactionsProps = {}) {
	const [reactions, setReactions] = useState<ButtonReaction[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	// Buscar reações existentes
	const fetchReactions = async (msgId?: string) => {
		if (!msgId && !messageId) return;

		setLoading(true);
		try {
			const targetMessageId = msgId || messageId;
			const response = await fetch(`/api/admin/mtf-diamante/button-reactions?messageId=${targetMessageId}`);

			if (!response.ok) {
				throw new Error("Erro ao buscar reações");
			}

			const data = await response.json();
			setReactions(data.reactions || []);
		} catch (error) {
			console.error("Erro ao buscar reações:", error);
			toast.error("Erro ao carregar reações dos botões");
		} finally {
			setLoading(false);
		}
	};

	// Salvar reações
	const saveReactions = async (newReactions: ButtonReaction[], msgId?: string) => {
		if (!msgId && !messageId) {
			toast.error("ID da mensagem é obrigatório");
			return false;
		}

		setSaving(true);
		try {
			const targetMessageId = msgId || messageId;
			const response = await fetch("/api/admin/mtf-diamante/button-reactions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messageId: targetMessageId,
					reactions: newReactions,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Erro ao salvar reações");
			}

			const data = await response.json();
			setReactions(data.reactions);
			toast.success("Reações salvas com sucesso!");
			return true;
		} catch (error) {
			console.error("Erro ao salvar reações:", error);
			toast.error(error instanceof Error ? error.message : "Erro ao salvar reações");
			return false;
		} finally {
			setSaving(false);
		}
	};

	// Buscar reação específica de um botão
	const getReactionByButtonId = async (buttonId: string) => {
		try {
			const response = await fetch(`/api/admin/mtf-diamante/button-reactions?buttonId=${buttonId}`);

			if (!response.ok) {
				throw new Error("Erro ao buscar reação");
			}

			const data = await response.json();
			return data.reaction;
		} catch (error) {
			console.error("Erro ao buscar reação do botão:", error);
			return null;
		}
	};

	// Remover reação específica
	const removeReaction = async (buttonId: string) => {
		try {
			const response = await fetch(`/api/admin/mtf-diamante/button-reactions?buttonId=${buttonId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Erro ao remover reação");
			}

			// Atualizar estado local
			setReactions((prev) => prev.filter((r) => r.buttonId !== buttonId));
			toast.success("Reação removida com sucesso!");
			return true;
		} catch (error) {
			console.error("Erro ao remover reação:", error);
			toast.error("Erro ao remover reação");
			return false;
		}
	};

	// Remover todas as reações de uma mensagem
	const removeAllReactions = async (msgId?: string) => {
		if (!msgId && !messageId) return false;

		try {
			const targetMessageId = msgId || messageId;
			const response = await fetch(`/api/admin/mtf-diamante/button-reactions?messageId=${targetMessageId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Erro ao remover reações");
			}

			setReactions([]);
			toast.success("Todas as reações removidas!");
			return true;
		} catch (error) {
			console.error("Erro ao remover reações:", error);
			toast.error("Erro ao remover reações");
			return false;
		}
	};

	// Carregar reações automaticamente quando messageId mudar
	useEffect(() => {
		if (messageId) {
			fetchReactions(messageId);
		}
	}, [messageId]);

	return {
		reactions,
		loading,
		saving,
		fetchReactions,
		saveReactions,
		getReactionByButtonId,
		removeReaction,
		removeAllReactions,
		refetch: () => fetchReactions(messageId),
	};
}
