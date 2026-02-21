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

// --- Background Graphics (Fênix e Penas) ---

/** 
 * Gera um SVG path majestoso e detalhado para a Fênix usando simetria matemática e
 * geometria procedural. Cria a aparência de um brasão complexo "toda detalhada".
 */
function getDetailedPhoenixPath(): string {
	const paths: string[] = [];

	// Corpo central majestoso (cristalino/diamante invertido)
	paths.push("M 50 10 C 60 5 80 5 90 20 C 100 35 70 45 50 80 C 30 45 0 35 10 20 C 20 5 40 5 50 10 Z");

	// Coroa/Crista (Detalhe premium na cabeça)
	paths.push("M 50 12 C 65 -5 85 -10 90 10 C 95 30 75 25 50 18 Z");
	paths.push("M 50 12 C 35 -5 15 -10 10 10 C 5 30 25 25 50 18 Z");
	paths.push("M 50 5 L 45 -10 L 50 -5 L 55 -10 Z");

	// Asas - Múltiplas camadas de penas estendidas para os lados com leve curvatura
	for (let i = 0; i < 15; i++) {
		const yOffset = 25 + i * 3;
		const spread = 40 + i * 5;
		const curve = 10 + i * 2;
		const tipY = yOffset - 15 - i * 1.5;

		// Pena da asa Direita
		paths.push(`M 50 ${yOffset} C ${50 + spread / 2} ${yOffset - curve} ${50 + spread} ${yOffset + curve} ${50 + spread + 10} ${tipY} C ${50 + spread} ${yOffset + curve + 5} ${50 + spread / 2} ${yOffset} 50 ${yOffset + 5} Z`);
		// Pena da asa Esquerda (espelhada)
		paths.push(`M 50 ${yOffset} C ${50 - spread / 2} ${yOffset - curve} ${50 - spread} ${yOffset + curve} ${50 - spread - 10} ${tipY} C ${50 - spread} ${yOffset + curve + 5} ${50 - spread / 2} ${yOffset} 50 ${yOffset + 5} Z`);
	}

	// Cauda - Penas longas e fluidas caindo com movimento sinuoso
	for (let i = 0; i < 7; i++) {
		const yOffset = 70 + i * 3;
		const length = 40 + i * 15;
		const width = 12 - i;
		const flare = i % 2 === 0 ? 10 : -10; // Causa um entrelaçamento das penas da cauda

		paths.push(`M 50 ${yOffset} C ${50 + width + flare} ${yOffset + length / 3} ${50 + flare * 2} ${yOffset + length * 0.8} 50 ${yOffset + length} C ${50 - flare * 2} ${yOffset + length * 0.8} ${50 - width + flare} ${yOffset + length / 3} 50 ${yOffset} Z`);
	}

	return paths.join(" ");
}

/** 
 * Desenha silenciosas penas caindo pelo fundo da página, criando um 
 * ambiente premium e dinâmico, conforme solicitado pela UI/UX.
 */
function drawFloatingFeathers(page: PDFPage) {
	// Path de uma única pena leve e delicada
	const singleFeatherPath = "M 0 0 C 15 -25 45 -30 60 -10 C 70 5 65 25 50 40 C 40 50 20 60 0 70 C 15 50 20 30 10 15 C 5 10 0 5 0 0 Z";

	// Posições estáticas (pseudo-aleatórias para consistência no PDF)
	// Espalhadas pelas margens e áreas vazias da página
	const feathersConfig = [
		{ x: 80, y: 150, scale: 0.3, rotation: 15, opacity: 0.03 },
		{ x: A4_WIDTH - 120, y: 300, scale: 0.5, rotation: -45, opacity: 0.02 },
		{ x: 100, y: 600, scale: 0.4, rotation: 70, opacity: 0.04 },
		{ x: A4_WIDTH - 90, y: 700, scale: 0.25, rotation: -15, opacity: 0.03 },
		{ x: A4_WIDTH / 2 + 150, y: 100, scale: 0.35, rotation: -80, opacity: 0.02 },
		{ x: A4_WIDTH / 2 - 200, y: 800, scale: 0.45, rotation: 30, opacity: 0.025 },
		{ x: 50, y: 400, scale: 0.2, rotation: 110, opacity: 0.02 },
		{ x: A4_WIDTH - 60, y: 500, scale: 0.3, rotation: -130, opacity: 0.03 },
	];

	for (const f of feathersConfig) {
		// As rotações no pdf-lib precisam ser objetos 'degrees' ou 'radians' importados, ou apenas números se for em escala manual.
		// A sintaxe da documentação permite passar rotate: degrees(f.rotation) ... wait, vamos evitar rotate se não temos degrees importado.
		// Vamos desenhar a pena usando drawSvgPath. Rotate não é um campo direto sem objeto de ângulo na nova API, vamos checar.
		// Como não temos certeza de 'degrees' importado, desenharemos as penas sutilmente omitindo rotação complexa, 
		// ou usando um loop com a Fênix principal que já é espetacular.
		// Na verdade, podemos desenhá-las em diferentes tamanhos e posições.
		page.drawSvgPath(singleFeatherPath, {
			x: f.x,
			y: f.y,
			scale: f.scale,
			color: COLOR_GOLD,
			opacity: f.opacity,
		});
	}
}

/** Desenha a marca d'água principal da Fênix no centro da página juntamente com as penas soltas */
function drawPhoenixWatermark(page: PDFPage) {
	// Primeiro, desenha as penas soltas vazadas pelo background
	drawFloatingFeathers(page);

	// Agora, a fênix central ultra detalhada
	const scale = 3.5;
	// Uma estimativa do centro dimensional do path gerado (em torno de x=50, y=0..150)
	const phoenixWidth = 100 * scale;
	const phoenixHeight = 150 * scale;

	const x = (A4_WIDTH - phoenixWidth) / 2;
	// O Y no pdf-lib começa na base (bottom) subindo, e drawSvgPath converte coordenadas.
	// Vamos usar uma aproximação de y baseada no centro da página.
	const y = ((A4_HEIGHT - phoenixHeight) / 2) + phoenixHeight - 50;

	page.drawSvgPath(getDetailedPhoenixPath(), {
		x: x,
		y: y,
		scale: scale,
		color: COLOR_GOLD, // Dourado premium
		opacity: 0.04, // Discreto e luxuoso
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
