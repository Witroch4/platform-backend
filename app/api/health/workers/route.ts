/**
 * Worker Health Check API
 * [CLEANUP 2026-02-16] Simplificado - AI workers e ParentWorker removidos (código morto)
 * O SocialWise Flow processa mensagens inline (síncrono), não usa filas BullMQ para respostas
 */

import { NextResponse } from "next/server";

export async function GET() {
	try {
		// [CLEANUP 2026-02-16] ParentWorker REMOVIDO
		// As filas resposta-rapida e persistencia-credenciais não são mais usadas
		// O SocialWise Flow processa tudo inline no webhook

		const response = {
			status: "healthy",
			timestamp: new Date().toISOString(),
			workers: {
				initialized: true,
				// Workers ativos são gerenciados pelo init.ts:
				// - Instagram Webhook Worker
				// - Legacy Workers (Manuscrito, Leads, Tradução)
				// - Transcription OAB
				// - Analysis OAB
				// - Auto Notifications
			},
			note: "ParentWorker removed (resposta-rapida + persistencia were dead code). SocialWise Flow processes inline.",
		};

		return NextResponse.json(response, { status: 200 });
	} catch (error) {
		return NextResponse.json(
			{
				status: "error",
				timestamp: new Date().toISOString(),
				error: "Failed to check worker health",
			},
			{ status: 500 },
		);
	}
}
