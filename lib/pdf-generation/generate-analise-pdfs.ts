import { readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, PageSizes, PDFImage, type RGB } from "pdf-lib";
import { uploadToMinIO } from "@/lib/minio";
import type { AnaliseData } from "./types";

// --- Constantes de layout ---
const A4_WIDTH = PageSizes.A4[0]; // 595.28
const A4_HEIGHT = PageSizes.A4[1]; // 841.89
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_HEIGHT = 16;
const SECTION_GAP = 20;

const COLOR_RED = rgb(0.682, 0.133, 0.133); // #AE2222 - Mais elegante/fechado
const COLOR_GOLD = rgb(0.854, 0.647, 0.125); // #DAA520
const COLOR_ORANGE = rgb(0.925, 0.431, 0.121); // #EC6E1F
const COLOR_BLACK = rgb(0.15, 0.15, 0.15); // Rich Black
const COLOR_GRAY = rgb(0.45, 0.45, 0.45);
const COLOR_LIGHT_GRAY = rgb(0.97, 0.97, 0.97);
const COLOR_IVORY = rgb(0.988, 0.978, 0.952);
const COLOR_PAPER = rgb(0.996, 0.992, 0.984);
const COLOR_BORDER = rgb(0.872, 0.835, 0.772);
const COLOR_SOFT_RED = rgb(0.973, 0.936, 0.932);
const COLOR_SOFT_GOLD = rgb(0.979, 0.957, 0.89);
const COLOR_MUTED = rgb(0.36, 0.34, 0.34);
const CLIENT_PDF_DESCRIPTION_LIMIT = 30;

// --- Helpers ---

function sanitizePdfText(text?: string | null): string {
	if (!text) return "";
	return text
		.replace(/≥/g, ">=")
		.replace(/≤/g, "<=")
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[–—]/g, "-")
		.replace(/…/g, "...")
		.replace(/[\u{1F300}-\u{1F9FF}]/gu, "") // Emojis
		.replace(/[\u{2700}-\u{27BF}]/gu, "") // Dingbats
		.replace(/[\u{2600}-\u{26FF}]/gu, ""); // Misc symbols
}

function sanitizeAnaliseData(data: AnaliseData): AnaliseData {
	return {
		...data,
		exameDescricao: sanitizePdfText(data.exameDescricao),
		inscricao: sanitizePdfText(data.inscricao),
		nomeExaminando: sanitizePdfText(data.nomeExaminando),
		seccional: sanitizePdfText(data.seccional),
		areaJuridica: sanitizePdfText(data.areaJuridica),
		notaFinal: sanitizePdfText(data.notaFinal),
		situacao: sanitizePdfText(data.situacao),
		subtotalPeca: sanitizePdfText(data.subtotalPeca),
		subtotalQuestoes: sanitizePdfText(data.subtotalQuestoes),
		conclusao: sanitizePdfText(data.conclusao),
		pontosPeca: data.pontosPeca?.map((p) => ({
			...p,
			titulo: sanitizePdfText(p.titulo),
			descricao: sanitizePdfText(p.descricao),
			valor: sanitizePdfText(p.valor),
		})),
		pontosQuestoes: data.pontosQuestoes?.map((q) => ({
			...q,
			titulo: sanitizePdfText(q.titulo),
			descricao: sanitizePdfText(q.descricao),
			valor: sanitizePdfText(q.valor),
		})),
		argumentacao: data.argumentacao?.map((a) => sanitizePdfText(a)),
	};
}

/** Trunca texto visualmente para caber em maxWidth pixels, adicionando "..." se necessário */
function fitTextToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string {
	if (!text) return "";
	if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text;
	for (let i = text.length - 1; i > 0; i--) {
		const truncated = `${text.slice(0, i).trimEnd()}...`;
		if (font.widthOfTextAtSize(truncated, fontSize) <= maxWidth) {
			return truncated;
		}
	}
	return "...";
}

function truncateClientPdfText(text?: string | null, limit = CLIENT_PDF_DESCRIPTION_LIMIT): string {
	if (!text) return "";
	if (text.length <= limit) return text;
	if (limit <= 3) return ".".repeat(limit);
	return `${text.slice(0, limit - 3).trimEnd()}...`;
}

/** Extrai apenas o identificador do título, removendo a descrição.
 * "Quesito 1 - Endereçamento" → "Quesito 1"
 * "Q2-A - Legitimidade..."    → "Q2-A"
 * "Questão 1 A"               → "Q1-A"
 * "Questão 4 - Item B"        → "Q4-B"
 */
function extractTitleIdentifier(titulo: string): string {
	if (!titulo) return "";
	const trimmed = titulo.trim();

	// "Q1-A", "Q2-B", "QPECA-07" — already short, strip description after separator
	const shortMatch = trimmed.match(/^(Q\d+(?:-[A-Z])?)(?:\s*-\s|$)/i);
	if (shortMatch) return shortMatch[1].toUpperCase();

	// "Quesito N" or "Quesito PECA-N" — keep format, strip description
	const quesitoMatch = trimmed.match(/^(Quesito\s+(?:PECA-?)?\d+(?:-[A-Z])?)/i);
	if (quesitoMatch) return quesitoMatch[1];

	// "Questão N - Item X" → "QN-X"
	const questaoItemMatch = trimmed.match(/^Quest[aã]o\s+(\d+)\s*-\s*Item\s+([A-Z])/i);
	if (questaoItemMatch) return `Q${questaoItemMatch[1]}-${questaoItemMatch[2].toUpperCase()}`;

	// "Questão N X" (number + single letter) → "QN-X"
	const questaoLetterMatch = trimmed.match(/^Quest[aã]o\s+(\d+)\s+([A-Z])(?=\s|-|$)/i);
	if (questaoLetterMatch) return `Q${questaoLetterMatch[1]}-${questaoLetterMatch[2].toUpperCase()}`;

	// "Questão N" → "QN"
	const questaoNumMatch = trimmed.match(/^Quest[aã]o\s+(\d+)/i);
	if (questaoNumMatch) return `Q${questaoNumMatch[1]}`;

	// Fallback: strip description after " - "
	const dashIndex = trimmed.indexOf(" - ");
	if (dashIndex > 0) return trimmed.slice(0, dashIndex).trim();

	return trimmed;
}

function buildClientPdfData(data: AnaliseData): AnaliseData {
	return {
		...data,
		pontosPeca: data.pontosPeca?.map((item) => ({
			...item,
			titulo: extractTitleIdentifier(item.titulo),
			descricao: truncateClientPdfText(item.descricao, CLIENT_PDF_DESCRIPTION_LIMIT),
		})),
		pontosQuestoes: data.pontosQuestoes?.map((item) => ({
			...item,
			titulo: extractTitleIdentifier(item.titulo),
			descricao: truncateClientPdfText(item.descricao, CLIENT_PDF_DESCRIPTION_LIMIT),
		})),
	};
}

// --- Background Graphics (Fênix) ---

/** Desenha a marca d'água principal da Fênix no centro da página */
function drawPhoenixWatermark(page: PDFPage, image: PDFImage) {
	// Queremos que a imagem cubra toda a página A4 (como um "cover" CSS).
	// Calculamos o fator de escala necessário para cobrir a largura OU a altura (o que for maior).
	const scale = Math.max(A4_WIDTH / image.width, A4_HEIGHT / image.height);
	const width = image.width * scale;
	const height = image.height * scale;

	// Centralizamos a imagem; a parte que excede a A4 será ignorada (crop)
	const x = (A4_WIDTH - width) / 2;
	const y = (A4_HEIGHT - height) / 2;

	page.drawImage(image, {
		x,
		y,
		width,
		height,
		opacity: 0.1, // Discreto e luxuoso
	});
}

/** Quebra texto em linhas que cabem na largura máxima */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
	const words = text.split(" ");
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		const testLine = currentLine ? `${currentLine} ${word}` : word;
		const testWidth = font.widthOfTextAtSize(testLine, fontSize);
		if (testWidth > maxWidth && currentLine) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			currentLine = testLine;
		}
	}
	if (currentLine) lines.push(currentLine);
	return lines.length ? lines : [""];
}

/** Desenha texto com word-wrap, retorna nova posição Y */
function drawWrappedText(
	page: PDFPage,
	text: string,
	x: number,
	y: number,
	font: PDFFont,
	fontSize: number,
	maxWidth: number,
	color = COLOR_BLACK,
): number {
	const lines = wrapText(text, font, fontSize, maxWidth);
	let currentY = y;
	for (const line of lines) {
		if (currentY < MARGIN_BOTTOM) break;
		page.drawText(line, { x, y: currentY, size: fontSize, font, color });
		currentY -= LINE_HEIGHT;
	}
	return currentY;
}

/** Desenha um bloco/caixa de conteúdo premium (UI moderna) */
function drawPremiumBox(
	page: PDFPage,
	x: number,
	y: number,
	width: number,
	height: number,
	accentColor: { red: number; green: number; blue: number }
) {
	const cAccent = rgb(accentColor.red, accentColor.green, accentColor.blue);

	// Fundo leve (Light Gray)
	page.drawRectangle({
		x,
		y: y - height,
		width,
		height,
		color: COLOR_LIGHT_GRAY,
	});

	// Barra de destaque lateral esquerda (Accent Line)
	page.drawRectangle({
		x,
		y: y - height,
		width: 4,
		height,
		color: cAccent,
	});
}

function drawSurfaceBox(
	page: PDFPage,
	x: number,
	y: number,
	width: number,
	height: number,
	options?: {
		fillColor?: RGB;
		borderColor?: RGB;
		accentColor?: RGB;
		accentHeight?: number;
		accentSide?: "top" | "left";
	},
) {
	const fillColor = options?.fillColor ?? COLOR_PAPER;
	const borderColor = options?.borderColor ?? COLOR_BORDER;
	const accentColor = options?.accentColor ?? COLOR_GOLD;
	const accentHeight = options?.accentHeight ?? 3;
	const accentSide = options?.accentSide ?? "top";

	page.drawRectangle({
		x,
		y: y - height,
		width,
		height,
		color: fillColor,
		borderColor,
		borderWidth: 1,
	});

	if (accentSide === "top") {
		page.drawRectangle({
			x,
			y: y - accentHeight,
			width,
			height: accentHeight,
			color: accentColor,
		});
		return;
	}

	page.drawRectangle({
		x,
		y: y - height,
		width: accentHeight,
		height,
		color: accentColor,
	});
}

function drawBadge(
	page: PDFPage,
	text: string,
	x: number,
	y: number,
	font: PDFFont,
	options?: {
		fontSize?: number;
		fillColor?: RGB;
		textColor?: RGB;
		borderColor?: RGB;
	},
): number {
	const fontSize = options?.fontSize ?? 8;
	const fillColor = options?.fillColor ?? COLOR_SOFT_GOLD;
	const textColor = options?.textColor ?? COLOR_RED;
	const borderColor = options?.borderColor ?? COLOR_GOLD;
	const horizontalPadding = 10;
	const verticalPadding = 6;
	const width = font.widthOfTextAtSize(text, fontSize) + horizontalPadding * 2;
	const height = fontSize + verticalPadding * 2;

	page.drawRectangle({
		x,
		y: y - height,
		width,
		height,
		color: fillColor,
		borderColor,
		borderWidth: 1,
	});
	page.drawText(text, {
		x: x + horizontalPadding,
		y: y - height + verticalPadding + 1,
		size: fontSize,
		font,
		color: textColor,
	});

	return width;
}

function drawHeroBanner(
	page: PDFPage,
	fontRegular: PDFFont,
	fontBold: PDFFont,
	options: {
		y: number;
		eyebrow: string;
		title: string;
		subtitle: string;
		badge: string;
		calloutTitle: string;
		calloutValue: string;
		calloutCaption: string;
	},
): number {
	const bannerHeight = 102;
	const rightCardWidth = 136;
	const contentX = MARGIN_LEFT;

	drawSurfaceBox(page, contentX, options.y, CONTENT_WIDTH, bannerHeight, {
		fillColor: COLOR_PAPER,
		borderColor: COLOR_BORDER,
		accentColor: COLOR_GOLD,
		accentSide: "top",
		accentHeight: 4,
	});

	page.drawRectangle({
		x: contentX,
		y: options.y - bannerHeight,
		width: 10,
		height: bannerHeight,
		color: COLOR_RED,
	});

	drawBadge(page, options.badge, contentX + 24, options.y - 14, fontBold, {
		fontSize: 7,
		fillColor: COLOR_SOFT_GOLD,
		textColor: COLOR_RED,
		borderColor: COLOR_GOLD,
	});

	page.drawText(options.eyebrow, {
		x: contentX + 24,
		y: options.y - 34,
		size: 8,
		font: fontBold,
		color: COLOR_GOLD,
	});

	page.drawText(options.title, {
		x: contentX + 24,
		y: options.y - 58,
		size: 24,
		font: fontBold,
		color: COLOR_BLACK,
	});

	const subtitleLines = wrapText(options.subtitle, fontRegular, 9, CONTENT_WIDTH - rightCardWidth - 72);
	let subtitleY = options.y - 76;
	for (const line of subtitleLines.slice(0, 2)) {
		page.drawText(line, {
			x: contentX + 24,
			y: subtitleY,
			size: 9,
			font: fontRegular,
			color: COLOR_MUTED,
		});
		subtitleY -= 12;
	}

	const rightX = contentX + CONTENT_WIDTH - rightCardWidth - 16;
	const rightY = options.y - 16;
	drawSurfaceBox(page, rightX, rightY, rightCardWidth, 70, {
		fillColor: COLOR_RED,
		borderColor: COLOR_RED,
		accentColor: COLOR_GOLD,
		accentSide: "top",
		accentHeight: 3,
	});
	page.drawText(options.calloutTitle, {
		x: rightX + 14,
		y: rightY - 20,
		size: 8,
		font: fontBold,
		color: COLOR_IVORY,
	});
	page.drawText(options.calloutValue, {
		x: rightX + 14,
		y: rightY - 42,
		size: 16,
		font: fontBold,
		color: COLOR_PAPER,
	});
	page.drawText(options.calloutCaption, {
		x: rightX + 14,
		y: rightY - 58,
		size: 7,
		font: fontRegular,
		color: COLOR_IVORY,
	});

	return options.y - bannerHeight - 18;
}

function drawMetadataGrid(
	page: PDFPage,
	fontRegular: PDFFont,
	fontBold: PDFFont,
	fields: Array<[string, string]>,
	y: number,
): number {
	const columnGap = 12;
	const cardWidth = (CONTENT_WIDTH - columnGap) / 2;
	const cardHeight = 38;
	const rowGap = 8;

	fields.forEach(([label, value], index) => {
		const column = index % 2;
		const row = Math.floor(index / 2);
		const cardX = MARGIN_LEFT + column * (cardWidth + columnGap);
		const cardY = y - row * (cardHeight + rowGap);

		drawSurfaceBox(page, cardX, cardY, cardWidth, cardHeight, {
			fillColor: index % 2 === 0 ? COLOR_PAPER : COLOR_IVORY,
			borderColor: COLOR_BORDER,
			accentColor: column === 0 ? COLOR_RED : COLOR_GOLD,
			accentSide: "left",
			accentHeight: 4,
		});

		page.drawText(label.toUpperCase(), {
			x: cardX + 14,
			y: cardY - 15,
			size: 6.5,
			font: fontBold,
			color: COLOR_GRAY,
		});

		const valueLines = wrapText(value || "-", fontRegular, 10, cardWidth - 28);
		let valueY = cardY - 29;
		for (const line of valueLines.slice(0, 2)) {
			page.drawText(line, {
				x: cardX + 14,
				y: valueY,
				size: 10,
				font: fontRegular,
				color: COLOR_BLACK,
			});
			valueY -= 11;
		}
	});

	const rows = Math.ceil(fields.length / 2);
	return y - rows * (cardHeight + rowGap) - 8;
}

function drawMetricCards(
	page: PDFPage,
	fontBold: PDFFont,
	metrics: Array<{ label: string; value: string; tone: "red" | "gold" | "neutral" }>,
	y: number,
): number {
	const gap = 12;
	const cols = metrics.length;
	const cardWidth = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
	const cardHeight = 54;

	metrics.forEach((metric, index) => {
		const x = MARGIN_LEFT + index * (cardWidth + gap);
		const accentColor = metric.tone === "red" ? COLOR_RED : metric.tone === "gold" ? COLOR_GOLD : COLOR_ORANGE;
		const fillColor = metric.tone === "red" ? COLOR_SOFT_RED : metric.tone === "gold" ? COLOR_SOFT_GOLD : COLOR_IVORY;

		drawSurfaceBox(page, x, y, cardWidth, cardHeight, {
			fillColor,
			borderColor: COLOR_BORDER,
			accentColor,
			accentSide: "top",
			accentHeight: 3,
		});

		page.drawText(metric.label.toUpperCase(), {
			x: x + 12,
			y: y - 16,
			size: 6.5,
			font: fontBold,
			color: COLOR_GRAY,
		});
		page.drawText(metric.value || "-", {
			x: x + 12,
			y: y - 37,
			size: 12,
			font: fontBold,
			color: COLOR_BLACK,
		});
	});

	return y - cardHeight - 16;
}

function drawNarrativePanel(
	page: PDFPage,
	fontRegular: PDFFont,
	fontBold: PDFFont,
	options: {
		y: number;
		title: string;
		text: string;
		eyebrow?: string;
		fillColor?: RGB;
		accentColor?: RGB;
	},
): number {
	const textLines = wrapText(options.text, fontRegular, 8.5, CONTENT_WIDTH - 30);
	const boxHeight = textLines.length * 11 + 40;

	drawSurfaceBox(page, MARGIN_LEFT, options.y, CONTENT_WIDTH, boxHeight, {
		fillColor: options.fillColor ?? COLOR_SOFT_RED,
		borderColor: COLOR_BORDER,
		accentColor: options.accentColor ?? COLOR_RED,
		accentSide: "left",
		accentHeight: 5,
	});

	let textY = options.y - 18;
	if (options.eyebrow) {
		page.drawText(options.eyebrow.toUpperCase(), {
			x: MARGIN_LEFT + 18,
			y: textY,
			size: 6.5,
			font: fontBold,
			color: options.accentColor ?? COLOR_RED,
		});
		textY -= 12;
	}

	page.drawText(options.title, {
		x: MARGIN_LEFT + 18,
		y: textY,
		size: 12,
		font: fontBold,
		color: COLOR_BLACK,
	});
	textY -= 16;

	for (const line of textLines) {
		page.drawText(line, {
			x: MARGIN_LEFT + 18,
			y: textY,
			size: 8.5,
			font: fontRegular,
			color: COLOR_MUTED,
		});
		textY -= 11;
	}

	return options.y - boxHeight - 18;
}

/** Desenha o footer padrão */
function drawFooter(page: PDFPage, font: PDFFont, pageLabel?: string) {
	const footerY = 30;
	const footerText = "Dra. Amanda Sousa Advocacia e Consultoria Jurídica – Método Fênix © TODOS OS DIREITOS RESERVADOS";
	const footerContact = "@dra.amandasousadv | 85992091821 | www.amandasousaprev.adv.br";

	// Linha separadora
	page.drawLine({
		start: { x: MARGIN_LEFT, y: footerY + 20 },
		end: { x: A4_WIDTH - MARGIN_RIGHT, y: footerY + 20 },
		thickness: 1,
		color: COLOR_RED,
	});

	const footerFontSize = 7;
	const fw1 = font.widthOfTextAtSize(footerText, footerFontSize);
	page.drawText(footerText, {
		x: (A4_WIDTH - fw1) / 2,
		y: footerY + 6,
		size: footerFontSize,
		font,
		color: COLOR_GRAY,
	});

	const fw2 = font.widthOfTextAtSize(footerContact, footerFontSize);
	page.drawText(footerContact, {
		x: (A4_WIDTH - fw2) / 2,
		y: footerY - 4,
		size: footerFontSize,
		font,
		color: COLOR_GRAY,
	});

	if (pageLabel) {
		page.drawText(pageLabel, {
			x: A4_WIDTH - MARGIN_RIGHT - font.widthOfTextAtSize(pageLabel, 8),
			y: footerY + 6,
			size: 8,
			font,
			color: COLOR_RED,
		});
	}
}

// --- Paginação dinâmica ---

const MIN_CONTENT_Y = MARGIN_BOTTOM + 40;

interface PdfState {
	doc: PDFDocument;
	page: PDFPage;
	y: number;
	pageNum: number;
	fenixImage: PDFImage;
	fontRegular: PDFFont;
	fontBold: PDFFont;
}

function startNewPage(state: PdfState): void {
	drawFooter(state.page, state.fontRegular, String(state.pageNum).padStart(2, "0"));
	state.pageNum++;
	state.page = state.doc.addPage(PageSizes.A4);
	drawPhoenixWatermark(state.page, state.fenixImage);
	state.y = A4_HEIGHT - MARGIN_TOP;
}

function ensureSpace(state: PdfState, neededHeight: number): void {
	if (state.y - neededHeight < MIN_CONTENT_Y) {
		startNewPage(state);
	}
}

function drawListSectionPaginated(
	state: PdfState,
	options: {
		eyebrow: string;
		title: string;
		items: Array<{ titulo?: string; descricao?: string; valor?: string }>;
		emptyMessage: string;
		accentColor: RGB;
		fillColor: RGB;
	},
): void {
	const { fontRegular, fontBold } = state;
	const rowHeight = 46;
	const cardHeight = 34;

	ensureSpace(state, 80);

	state.page.drawText(options.eyebrow.toUpperCase(), {
		x: MARGIN_LEFT,
		y: state.y,
		size: 7,
		font: fontBold,
		color: options.accentColor,
	});
	state.page.drawText(options.title, {
		x: MARGIN_LEFT,
		y: state.y - 16,
		size: 13,
		font: fontBold,
		color: COLOR_BLACK,
	});
	state.y -= 28;

	if (options.items.length === 0) {
		const boxHeight = 46 + 18;
		drawSurfaceBox(state.page, MARGIN_LEFT, state.y, CONTENT_WIDTH, boxHeight, {
			fillColor: options.fillColor,
			borderColor: COLOR_BORDER,
			accentColor: options.accentColor,
			accentSide: "top",
			accentHeight: 3,
		});
		state.page.drawText(options.emptyMessage, {
			x: MARGIN_LEFT + 16,
			y: state.y - 28,
			size: 9,
			font: fontRegular,
			color: COLOR_MUTED,
		});
		state.y -= boxHeight + 18;
		return;
	}

	for (let index = 0; index < options.items.length; index++) {
		const item = options.items[index];

		ensureSpace(state, rowHeight + 10);

		const cardX = MARGIN_LEFT + 12;
		const cardY = state.y;
		const cardWidth = CONTENT_WIDTH - 24;
		const badgeSize = 18;
		const valueText = item.valor || "";
		const valueWidth = Math.max(fontBold.widthOfTextAtSize(valueText, 8) + 18, 48);

		drawSurfaceBox(state.page, cardX, cardY, cardWidth, cardHeight, {
			fillColor: index % 2 === 0 ? COLOR_PAPER : COLOR_IVORY,
			borderColor: COLOR_BORDER,
			accentColor: options.accentColor,
			accentSide: "left",
			accentHeight: 3,
		});

		state.page.drawRectangle({
			x: cardX + 10,
			y: cardY - 8 - badgeSize,
			width: badgeSize,
			height: badgeSize,
			color: options.accentColor,
		});
		state.page.drawText(String(index + 1).padStart(2, "0"), {
			x: cardX + 14,
			y: cardY - 20,
			size: 7,
			font: fontBold,
			color: COLOR_PAPER,
		});

		drawBadge(state.page, valueText, cardX + cardWidth - valueWidth - 10, cardY - 8, fontBold, {
			fontSize: 8,
			fillColor: COLOR_SOFT_GOLD,
			textColor: COLOR_RED,
			borderColor: COLOR_GOLD,
		});

		const textStartX = cardX + 38;
		const availableTextWidth = cardWidth - 38 - valueWidth - 20;

		state.page.drawText(fitTextToWidth(item.titulo || "-", fontBold, 9, availableTextWidth), {
			x: textStartX,
			y: cardY - 16,
			size: 9,
			font: fontBold,
			color: COLOR_BLACK,
		});
		state.page.drawText(fitTextToWidth(item.descricao || "", fontRegular, 7.5, availableTextWidth), {
			x: textStartX,
			y: cardY - 28,
			size: 7.5,
			font: fontRegular,
			color: COLOR_GRAY,
		});

		state.y -= rowHeight;
	}

	state.y -= 18;
}

function drawNarrativePanelPaginated(
	state: PdfState,
	options: {
		title: string;
		text: string;
		eyebrow?: string;
		fillColor?: RGB;
		accentColor?: RGB;
	},
): void {
	const textLines = wrapText(options.text, state.fontRegular, 8.5, CONTENT_WIDTH - 30);
	const boxHeight = textLines.length * 11 + 40;

	ensureSpace(state, boxHeight);

	state.y = drawNarrativePanel(state.page, state.fontRegular, state.fontBold, {
		y: state.y,
		...options,
	});
}

// --- Geração do Relatório (cliente) ---

async function generateRelatorioPdf(data: AnaliseData, fenixImageBytes: Buffer): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
	const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
	const fenixImage = await doc.embedPng(fenixImageBytes);
	const clientData = buildClientPdfData(data);

	const page1 = doc.addPage(PageSizes.A4);
	drawPhoenixWatermark(page1, fenixImage);

	const state: PdfState = {
		doc,
		page: page1,
		y: A4_HEIGHT - MARGIN_TOP,
		pageNum: 1,
		fenixImage,
		fontRegular,
		fontBold,
	};

	state.y = drawHeroBanner(state.page, fontRegular, fontBold, {
		y: state.y,
		eyebrow: "Relatório de viabilidade jurídica",
		title: "Método Fênix",
		subtitle: "Documento visual do potencial de ganho identificado na análise, com conteúdo resumido para proteção anti-plágio.",
		badge: "PDF DO CLIENTE",
		calloutTitle: "Formato",
		calloutValue: "Resumido",
		calloutCaption: "Teses macro e valores",
	});

	state.y = drawMetadataGrid(
		state.page,
		fontRegular,
		fontBold,
		[
			["Documento", "Visão resumida protegida"],
			["Inscrição", "XXXX"],
			["Exame", "XXXXX"],
			["Seccional", "XXXX"],
			["Nome do Examinando", data.nomeExaminando || "-"],
			["Área Jurídica", "XXXX"],
			["Nota Informada", "XXXXX"],
			["Status", "Análise concluída"],
		],
		state.y,
	);

	state.y = drawMetricCards(
		state.page,
		fontBold,
		[
			{ label: "Potencial na Peça", value: clientData.subtotalPeca || "0,00", tone: "gold" },
			{ label: "Potencial em Questões", value: clientData.subtotalQuestoes || "0,00", tone: "red" },
		],
		state.y,
	);

	const obsText =
		'Este é um relatório de viabilidade e não o recurso final. Ele apresenta apenas os tópicos macro (os "títulos" das teses) e seus respectivos valores, sem a argumentação jurídica detalhada. Esta medida é necessária para proteger o trabalho intelectual envolvido na análise - que é realizada de forma minuciosa e pessoal - e evitar o plágio. O objetivo é comprovar a análise e o potencial de ganho.';

	drawNarrativePanelPaginated(state, {
		title: "Observação importante",
		text: obsText,
		eyebrow: "Proteção intelectual",
		fillColor: COLOR_SOFT_RED,
		accentColor: COLOR_RED,
	});

	drawListSectionPaginated(state, {
		eyebrow: "Peça profissional",
		title: "Potencial de ganhos identificado na peça",
		items: (clientData.pontosPeca || []).map((item) => ({
			titulo: item.titulo,
			descricao: item.descricao,
			valor: item.valor,
		})),
		emptyMessage: "Nenhum ponto de peça foi identificado para este relatório.",
		accentColor: COLOR_GOLD,
		fillColor: COLOR_SOFT_GOLD,
	});

	drawListSectionPaginated(state, {
		eyebrow: "Questões discursivas",
		title: "Ganhos possíveis nas questões",
		items: (clientData.pontosQuestoes || []).map((item) => ({
			titulo: item.titulo,
			descricao: item.descricao,
			valor: item.valor,
		})),
		emptyMessage: "Nenhum ponto de questão foi identificado para este relatório.",
		accentColor: COLOR_RED,
		fillColor: COLOR_SOFT_RED,
	});

	drawNarrativePanelPaginated(state, {
		title: "Conclusão geral",
		text: data.conclusao || "Sem conclusão informada.",
		eyebrow: "Síntese final",
		fillColor: COLOR_SOFT_GOLD,
		accentColor: COLOR_GOLD,
	});

	drawFooter(state.page, fontRegular, String(state.pageNum).padStart(2, "0"));

	return doc.save();
}

// --- Geração da Argumentação (sistema) ---

async function generateArgumentacaoPdf(data: AnaliseData, fenixImageBytes: Buffer): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
	const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
	const fenixImage = await doc.embedPng(fenixImageBytes);

	const page = doc.addPage(PageSizes.A4);
	let y = A4_HEIGHT - MARGIN_TOP;

	// Fênix Background Watermark
	drawPhoenixWatermark(page, fenixImage);

	// Título Premium Argumentação
	page.drawText("DOCUMENTO JURÍDICO INTERNO", {
		x: MARGIN_LEFT,
		y,
		size: 11,
		font: fontBold,
		color: COLOR_GOLD,
	});
	y -= 25;
	page.drawText("ARGUMENTAÇÃO DE RECURSO", {
		x: MARGIN_LEFT,
		y,
		size: 26,
		font: fontBold,
		color: COLOR_BLACK,
	});
	y -= 40;

	// Cabeçalho com todos os dados
	const headerFields = [
		["Descrição do Exame:", data.exameDescricao || ""],
		["Inscrição:", data.inscricao || ""],
		["Nome do Examinando:", data.nomeExaminando || ""],
		["Seccional:", data.seccional || ""],
		["Área Jurídica:", data.areaJuridica || ""],
		["Nota Final:", data.notaFinal || ""],
		["Situação:", data.situacao || ""],
	];

	for (const [label, value] of headerFields) {
		page.drawText(label, { x: MARGIN_LEFT, y, size: 10, font: fontBold, color: COLOR_BLACK });
		const labelWidth = fontBold.widthOfTextAtSize(label, 10);
		page.drawText(` ${value}`, { x: MARGIN_LEFT + labelWidth, y, size: 10, font: fontRegular, color: COLOR_BLACK });
		y -= LINE_HEIGHT;
	}
	y -= 5;

	// Linha separadora elegante
	page.drawLine({
		start: { x: MARGIN_LEFT, y },
		end: { x: A4_WIDTH - MARGIN_RIGHT, y },
		thickness: 0.5,
		color: COLOR_GRAY,
	});
	y -= SECTION_GAP + 10;

	// Argumentação
	page.drawText("Argumentação para Fundamentação do Recurso", {
		x: MARGIN_LEFT,
		y,
		size: 13,
		font: fontBold,
		color: COLOR_RED,
	});
	y -= 20;

	for (const arg of data.argumentacao || []) {
		const lines = wrapText(`• ${arg}`, fontRegular, 9, CONTENT_WIDTH - 15);
		for (const line of lines) {
			if (y < MARGIN_BOTTOM + 40) {
				// Nova página se necessário
				drawFooter(page, fontRegular);
				const newPage = doc.addPage(PageSizes.A4);
				drawPhoenixWatermark(newPage, fenixImage);
				y = A4_HEIGHT - MARGIN_TOP;
				// Continua desenhando na nova página
				newPage.drawText(line, { x: MARGIN_LEFT + 10, y, size: 9, font: fontRegular, color: COLOR_BLACK });
				y -= 13;
				// Nota: simplificação — para argumentações muito longas, precisaria refatorar
				continue;
			}
			page.drawText(line, { x: MARGIN_LEFT + 10, y, size: 9, font: fontRegular, color: COLOR_BLACK });
			y -= 13;
		}
		y -= 4; // gap entre argumentos
	}

	drawFooter(page, fontRegular);

	return doc.save();
}

// --- Orquestrador principal ---

/**
 * Gera os 2 PDFs da análise validada e faz upload para o MinIO.
 *
 * - PDF 1 (relatório): dados mascarados para o cliente
 * - PDF 2 (argumentação): dados completos para consulta interna
 */
export async function generateAnalisePdfs(
	data: AnaliseData,
	leadID: string,
): Promise<{ analiseUrl: string; argumentacaoUrl: string }> {
	console.log(`[PDF-Generation] Generating PDFs for lead: ${leadID}`);

	const safeData = sanitizeAnaliseData(data);

	// Ler a imagem da fênix de public/fenix.png
	const imagePath = join(process.cwd(), "public", "fenix.png");
	const fenixImageBytes = readFileSync(imagePath);

	// Gerar os 2 PDFs em paralelo
	const [relatorioBytes, argumentacaoBytes] = await Promise.all([
		generateRelatorioPdf(safeData, fenixImageBytes),
		generateArgumentacaoPdf(safeData, fenixImageBytes),
	]);

	console.log(
		`[PDF-Generation] PDFs generated. Relatorio: ${relatorioBytes.length} bytes, Argumentacao: ${argumentacaoBytes.length} bytes`,
	);

	// Upload paralelo para MinIO
	const [relatorioUpload, argumentacaoUpload] = await Promise.all([
		uploadToMinIO(Buffer.from(relatorioBytes), `analise-relatorio-${leadID}.pdf`, "application/pdf", false),
		uploadToMinIO(Buffer.from(argumentacaoBytes), `analise-argumentacao-${leadID}.pdf`, "application/pdf", false),
	]);

	console.log(`[PDF-Generation] Uploaded. analiseUrl: ${relatorioUpload.url}, argumentacaoUrl: ${argumentacaoUpload.url}`);

	return {
		analiseUrl: relatorioUpload.url,
		argumentacaoUrl: argumentacaoUpload.url,
	};
}
