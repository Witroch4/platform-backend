import { randomUUID } from "crypto";
import type { ExtractedPage, SubmissionChunk } from "./types";

const DEFAULT_MAX_CHARS = 1800;
const DEFAULT_MIN_CHARS = 600;

function detectQuestaoMarker(line: string): { questao: string; origem?: string } | null {
	const normalized = line.trim().toUpperCase();

	if (/PEÇA/.test(normalized) || /PECA/.test(normalized)) {
		return { questao: "PEÇA", origem: "PEÇA" };
	}

	const questaoMatch = normalized.match(/QUEST[ÃA]O\s*(\d+)/);
	if (questaoMatch) {
		return { questao: `Q${questaoMatch[1]}`, origem: `Q${questaoMatch[1]}` };
	}

	const qShort = normalized.match(/^Q\s*(\d+)/);
	if (qShort) {
		return { questao: `Q${qShort[1]}`, origem: `Q${qShort[1]}` };
	}

	return null;
}

function detectSubItemMarker(line: string, questao: string): string | null {
	const match = line.trim().match(/^([A-D])\)/i);
	if (match) {
		return `${questao}.${match[1].toUpperCase()}`;
	}

	const roman = line.trim().match(/^(I{1,3}|IV|V)\s*[-.)]/i);
	if (roman) {
		return `${questao}.${roman[1].toUpperCase()}`;
	}

	return null;
}

export function chunkSubmissionText(pages: ExtractedPage[]): { combinedText: string; chunks: SubmissionChunk[] } {
	const combinedText = pages.map((page) => `[[PÁGINA ${page.page}]]\n${page.text.trim()}`).join("\n\n");

	const chunks: SubmissionChunk[] = [];
	let buffer = "";
	let questaoAtual = "PEÇA";
	let origemAtual = "PEÇA";

	const flushBuffer = () => {
		const trimmed = buffer.trim();
		if (!trimmed) {
			buffer = "";
			return;
		}

		if (trimmed.length <= DEFAULT_MAX_CHARS) {
			chunks.push({
				id: randomUUID(),
				questao: questaoAtual,
				origem: origemAtual,
				text: trimmed,
			});
			buffer = "";
			return;
		}

		// Split large buffer conservatively by paragraphs
		const paragraphs = trimmed.split(/\n\s*\n/);
		let localBuffer = "";
		for (const paragraph of paragraphs) {
			if ((localBuffer + "\n\n" + paragraph).length > DEFAULT_MAX_CHARS && localBuffer.length >= DEFAULT_MIN_CHARS) {
				chunks.push({
					id: randomUUID(),
					questao: questaoAtual,
					origem: origemAtual,
					text: localBuffer.trim(),
				});
				localBuffer = paragraph;
			} else {
				localBuffer = localBuffer ? `${localBuffer}\n\n${paragraph}` : paragraph;
			}
		}

		if (localBuffer.trim()) {
			chunks.push({
				id: randomUUID(),
				questao: questaoAtual,
				origem: origemAtual,
				text: localBuffer.trim(),
			});
		}

		buffer = "";
	};

	for (const page of pages) {
		const lines = page.text.split(/\n+/);
		for (const rawLine of lines) {
			const line = rawLine.trim();
			if (!line) {
				buffer += "\n";
				continue;
			}

			const questaoMarker = detectQuestaoMarker(line);
			if (questaoMarker) {
				flushBuffer();
				questaoAtual = questaoMarker.questao;
				origemAtual = questaoMarker.origem ?? questaoAtual;
				buffer = "";
				continue;
			}

			const subItemMarker = detectSubItemMarker(line, questaoAtual);
			if (subItemMarker) {
				flushBuffer();
				origemAtual = subItemMarker;
				buffer = "";
			}

			buffer += `${line}\n`;
		}

		buffer += "\n";
	}

	flushBuffer();

	return { combinedText, chunks };
}
