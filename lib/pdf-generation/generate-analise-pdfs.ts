import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts, PageSizes } from "pdf-lib";
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

// --- Helpers ---

const PHOENIX_SVG_PATH = "M76.992 57.067c2.316 0.141 4.545-0.12 6.577-0.741-0.908-0.915-1.921-2.001-2.91-3.235-0.655-0.817-1.31-1.745-1.898-2.695-0.165-0.268-0.345-0.552-0.523-0.853-0.627-1.053-1.196-2.158-1.579-3.13... M44.604 16.9... (simplificado geometricamente)";
// Aqui substituímos pelo polyline premium para o pdf-lib:
// Um logo/brasão de Fênix em formato Path de SVG
const PHOENIX_PATH = "M50,10 C60,40 100,50 80,70 Q70,80 50,60 Q30,80 20,70 C0,50 40,40 50,10 Z M50,25 C55,25 60,30 50,45 C40,30 45,25 50,25 Z M30,50 C20,50 10,40 10,35 C15,45 25,48 30,50 Z M70,50 C80,50 90,40 90,35 C85,45 75,48 70,50 Z M40,65 Q50,90 60,65 Q50,75 40,65 Z M35,80 C40,95 50,100 50,100 C50,100 60,95 65,80 C60,90 50,95 50,95 C50,95 40,90 35,80 Z";

/** Desenha a marca d'água da Fênix no centro da página */
function drawPhoenixWatermark(page: PDFPage) {
	// Posição central da página A4
	const scale = 3.5;
	const phoenixWidth = 100 * scale;
	const phoenixHeight = 100 * scale;

	const x = (A4_WIDTH - phoenixWidth) / 2;
	const y = ((A4_HEIGHT - phoenixHeight) / 2) + phoenixHeight;

	page.drawSvgPath(PHOENIX_PATH, {
		x: x,
		y: y,
		scale: scale,
		color: COLOR_GOLD, // Dourado premium
		opacity: 0.05, // Discreto
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

/** Desenha o footer padrão */
function drawFooter(page: PDFPage, font: PDFFont) {
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
}

// --- Geração do Relatório (cliente) ---

async function generateRelatorioPdf(data: AnaliseData): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
	const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

	// ========== PÁGINA 1 ==========
	const page1 = doc.addPage(PageSizes.A4);
	let y = A4_HEIGHT - MARGIN_TOP;

	// Fênix Background Watermark
	drawPhoenixWatermark(page1);

	// Título Premium
	page1.drawText("RELATÓRIO DE VIABILIDADE JURÍDICA", {
		x: MARGIN_LEFT,
		y,
		size: 11,
		font: fontBold,
		color: COLOR_GOLD,
	});
	y -= 25;
	page1.drawText("MÉTODO FÊNIX", {
		x: MARGIN_LEFT,
		y,
		size: 26,
		font: fontBold,
		color: COLOR_RED,
	});
	y -= 40;

	// Cabeçalho com dados mascarados
	const headerFields = [
		["Descrição do Exame:", "XXXXX"],
		["Inscrição:", "XXXX"],
		["Nome do Examinando:", data.nomeExaminando || ""],
		["Seccional:", "XXXX"],
		["Área Jurídica:", "XXXX"],
		["Nota Final:", "XXXXX"],
		["Situação:", "ANÁLISE CONCLUÍDA"],
	];

	for (const [label, value] of headerFields) {
		page1.drawText(label, { x: MARGIN_LEFT, y, size: 10, font: fontBold, color: COLOR_BLACK });
		const labelWidth = fontBold.widthOfTextAtSize(label, 10);
		page1.drawText(` ${value}`, { x: MARGIN_LEFT + labelWidth, y, size: 10, font: fontRegular, color: COLOR_BLACK });
		y -= LINE_HEIGHT;
	}
	y -= 5;

	// Linha separadora elegante
	page1.drawLine({
		start: { x: MARGIN_LEFT, y },
		end: { x: A4_WIDTH - MARGIN_RIGHT, y },
		thickness: 0.5,
		color: COLOR_GRAY,
	});
	y -= SECTION_GAP + 10;

	// Observação Importante
	page1.drawText("Observação Importante", { x: MARGIN_LEFT, y, size: 13, font: fontBold, color: COLOR_RED });
	y -= 15;

	const obsText =
		'Este é um relatório de viabilidade e não o recurso final. Ele apresenta apenas os tópicos macro (os "títulos" das teses) e seus respectivos valores, sem a argumentação jurídica detalhada. Esta medida é necessária para proteger o trabalho intelectual envolvido na análise – que é realizada de forma minuciosa e pessoal – e evitar o plágio. O objetivo é comprovar a análise e o potencial de ganho.';

	// Box vermelho de observação
	const obsLines = wrapText(obsText, fontRegular, 9, CONTENT_WIDTH - 25);
	const obsBoxHeight = obsLines.length * 14 + 25;

	drawPremiumBox(
		page1,
		MARGIN_LEFT,
		y,
		CONTENT_WIDTH,
		obsBoxHeight,
		{ red: 0.682, green: 0.133, blue: 0.133 } // Accent Red
	);

	let obsY = y - 18;
	for (const line of obsLines) {
		page1.drawText(line, { x: MARGIN_LEFT + 15, y: obsY, size: 9, font: fontRegular, color: COLOR_BLACK });
		obsY -= 14;
	}
	y -= obsBoxHeight + SECTION_GAP + 10;

	// Seção I — Peça
	page1.drawText("I. Detalhamento do Potencial de Ganhos na Peça Profissional", {
		x: MARGIN_LEFT,
		y,
		size: 13,
		font: fontBold,
		color: COLOR_RED,
	});
	y -= 18;

	// Calcular altura do box da peça
	const pontosPeca = data.pontosPeca || [];
	const pecaItemsHeight = pontosPeca.length * LINE_HEIGHT + 45;

	drawPremiumBox(
		page1,
		MARGIN_LEFT,
		y,
		CONTENT_WIDTH,
		pecaItemsHeight,
		{ red: 0.854, green: 0.647, blue: 0.125 } // Accent Gold
	);

	let pecaY = y - 15;
	page1.drawText("Pontos identificados passíveis de acréscimo:", {
		x: MARGIN_LEFT + 10,
		y: pecaY,
		size: 10,
		font: fontBold,
		color: COLOR_BLACK,
	});
	pecaY -= LINE_HEIGHT;

	for (const ponto of pontosPeca) {
		page1.drawText(`• ${ponto.titulo}`, { x: MARGIN_LEFT + 20, y: pecaY, size: 9, font: fontBold, color: COLOR_BLACK });
		pecaY -= LINE_HEIGHT;
	}

	pecaY -= 4;
	page1.drawText("Subtotal Peça:", { x: MARGIN_LEFT + 10, y: pecaY, size: 10, font: fontBold, color: COLOR_BLACK });
	const stpLabelWidth = fontBold.widthOfTextAtSize("Subtotal Peça: ", 10);
	page1.drawText(`${data.subtotalPeca || "0"} pts`, {
		x: MARGIN_LEFT + 10 + stpLabelWidth,
		y: pecaY,
		size: 10,
		font: fontBold,
		color: COLOR_ORANGE,
	});

	drawFooter(page1, fontRegular);

	// ========== PÁGINA 2 ==========
	const page2 = doc.addPage(PageSizes.A4);
	let y2 = A4_HEIGHT - MARGIN_TOP;

	// Fênix Background Watermark
	drawPhoenixWatermark(page2);

	// Seção II — Questões
	page2.drawText("II. Detalhamento de Ganhos Possíveis nas Questões", {
		x: MARGIN_LEFT,
		y: y2,
		size: 13,
		font: fontBold,
		color: COLOR_RED,
	});
	y2 -= 18;

	const pontosQuestoes = data.pontosQuestoes || [];
	const questoesItemsHeight = pontosQuestoes.length * LINE_HEIGHT + 45;

	drawPremiumBox(
		page2,
		MARGIN_LEFT,
		y2,
		CONTENT_WIDTH,
		questoesItemsHeight,
		{ red: 0.682, green: 0.133, blue: 0.133 } // Accent Red
	);

	let questoesY = y2 - 18;
	for (const questao of pontosQuestoes) {
		const bulletText = `• ${questao.titulo}: `;
		page2.drawText(bulletText, {
			x: MARGIN_LEFT + 10,
			y: questoesY,
			size: 9,
			font: fontBold,
			color: COLOR_BLACK,
		});
		const bulletWidth = fontBold.widthOfTextAtSize(bulletText, 9);
		page2.drawText(`${questao.valor} pts`, {
			x: MARGIN_LEFT + 10 + bulletWidth,
			y: questoesY,
			size: 9,
			font: fontRegular,
			color: COLOR_GRAY,
		});
		questoesY -= LINE_HEIGHT;
	}

	questoesY -= 4;
	page2.drawText("Subtotal Questões:", {
		x: MARGIN_LEFT + 10,
		y: questoesY,
		size: 10,
		font: fontBold,
		color: COLOR_BLACK,
	});
	const stqLabelWidth = fontBold.widthOfTextAtSize("Subtotal Questões: ", 10);
	page2.drawText(`${data.subtotalQuestoes || "0"} pts`, {
		x: MARGIN_LEFT + 10 + stqLabelWidth,
		y: questoesY,
		size: 10,
		font: fontBold,
		color: COLOR_ORANGE,
	});

	y2 -= questoesItemsHeight + SECTION_GAP + 10;

	// Conclusão
	page2.drawText("Conclusão Geral", { x: MARGIN_LEFT, y: y2, size: 13, font: fontBold, color: COLOR_RED });
	y2 -= 18;
	drawWrappedText(page2, data.conclusao || "", MARGIN_LEFT, y2, fontRegular, 10, CONTENT_WIDTH, COLOR_BLACK);

	drawFooter(page2, fontRegular);

	return doc.save();
}

// --- Geração da Argumentação (sistema) ---

async function generateArgumentacaoPdf(data: AnaliseData): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
	const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

	const page = doc.addPage(PageSizes.A4);
	let y = A4_HEIGHT - MARGIN_TOP;

	// Fênix Background Watermark
	drawPhoenixWatermark(page);

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
				drawPhoenixWatermark(newPage);
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

	// Gerar os 2 PDFs em paralelo
	const [relatorioBytes, argumentacaoBytes] = await Promise.all([
		generateRelatorioPdf(data),
		generateArgumentacaoPdf(data),
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
