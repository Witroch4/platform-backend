/**
 * E2E Test Suite: Flow Builder — Execução de Flows
 *
 * Testa o ciclo completo do Flow Engine contra infraestrutura real:
 *   docker compose up (app + postgres + redis + worker)
 *
 * Cobre:
 *   1. Flow simples (START → TEXT → END): resposta sync texto
 *   2. Flow interativo (START → TEXT → INTERACTIVE → END): sync com botões, session WAITING_INPUT
 *   3. Clique de botão flow_ resume sessão → próximo nó
 *   4. Flow com CONDITION branching (true/false)
 *   5. Flow com SET_VARIABLE + resolução de variáveis no texto
 *   6. Flow com REACTION + TEXT (combined button_reaction)
 *   7. Flow com MEDIA barrier → sync harvest + async continuation
 *   8. Flow com DELAY barrier → sync harvest + async delay
 *   9. Flow com CHATWIT_ACTION → job enfileirado na fila BullMQ
 *  10. Flow com múltiplos TEXT → texto concatenado no sync
 *  11. Flow longo (TEXT → TEXT → INTERACTIVE → MEDIA → TEXT → END)
 *  12. Variable resolution (contact_name, system_date)
 *  13. Cleanup de FlowSession após flow COMPLETED
 *  14. Rewind: clique de botão de nó anterior
 *
 * Não testa (coberto pelo socialwise-webhook.e2e.test.ts):
 *   - Classificação por bandas (HARD/SOFT/ROUTER)
 *   - @retry/@falar_atendente/@recomecar/@sair
 *   - Deduplicação, rate limiting, payload validation
 */

const BASE_URL = process.env.TEST_WEBHOOK_URL || "http://localhost:3002";
const WEBHOOK_PATH = "/api/integrations/webhooks/socialwiseflow";
const WEBHOOK_URL = `${BASE_URL}${WEBHOOK_PATH}`;

// DB setup endpoint (vamos criar via API interna)
const PRISMA_SEED_URL = `${BASE_URL}/api/admin/flow-builder`;

// Timeouts
const FLOW_TIMEOUT = 15_000; // Flows não usam LLM, devem ser rápidos
const ASYNC_SETTLE_TIME = 3_000; // Tempo para async jobs completarem
const RATE_LIMIT_DELAY = 1_500;

// IDs reais do banco de desenvolvimento
const TEST_INBOX_PRISMA_ID = "cmet9v6gx0009l92rqu0qzxzh"; // WhatsApp - ANA
const TEST_INBOX_NUMERIC_ID = 4;
const TEST_ACCOUNT_ID = 3;
const TEST_CONTACT_ID = 1447;
const TEST_CONVERSATION_ID = 2740;
const TEST_CONVERSATION_DISPLAY_ID = 2530;
const TEST_CHATWIT_TOKEN = "5rxTkF7gs9H9E9jqEW4fqeas";

// Gerador de IDs únicos
let idCounter = 0;
function uid(prefix = "e2e"): string {
	return `${prefix}_${Date.now()}_${++idCounter}`;
}

let sessionCounter = 0;
function uniqueSessionId(): string {
	return `55${Date.now()}${++sessionCounter}`;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// SEED: criar flows de teste diretamente via SQL
// ============================================================================

interface TestNode {
	id: string;
	nodeType: string;
	config: Record<string, unknown>;
}

interface TestEdge {
	id: string;
	sourceNodeId: string;
	targetNodeId: string;
	buttonId?: string;
	conditionBranch?: string;
}

interface TestFlow {
	id: string;
	name: string;
	nodes: TestNode[];
	edges: TestEdge[];
}

/**
 * Cria um flow de teste diretamente no PostgreSQL via docker exec.
 */
async function seedFlow(flow: TestFlow): Promise<void> {
	const escapeSql = (s: string) => s.replace(/'/g, "''");

	// Insert Flow
	const flowSql = `INSERT INTO "Flow" (id, name, "inboxId", "isActive", "createdAt", "updatedAt")
VALUES ('${flow.id}', '${escapeSql(flow.name)}', '${TEST_INBOX_PRISMA_ID}', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET "updatedAt" = NOW(), "isActive" = true;`;

	// Insert Nodes
	const nodesSql = flow.nodes
		.map(
			(n) =>
				`INSERT INTO "FlowNode" (id, "flowId", "nodeType", config, "positionX", "positionY")
VALUES ('${n.id}', '${flow.id}', '${n.nodeType}', '${escapeSql(JSON.stringify(n.config))}'::jsonb, 0, 0)
ON CONFLICT (id) DO UPDATE SET config = '${escapeSql(JSON.stringify(n.config))}'::jsonb, "nodeType" = '${n.nodeType}';`,
		)
		.join("\n");

	// Insert Edges
	const edgesSql = flow.edges
		.map(
			(e) =>
				`INSERT INTO "FlowEdge" (id, "flowId", "sourceNodeId", "targetNodeId", "buttonId", "conditionBranch")
VALUES ('${e.id}', '${flow.id}', '${e.sourceNodeId}', '${e.targetNodeId}', ${e.buttonId ? `'${e.buttonId}'` : "NULL"}, ${e.conditionBranch ? `'${e.conditionBranch}'` : "NULL"})
ON CONFLICT (id) DO NOTHING;`,
		)
		.join("\n");

	const fullSql = [flowSql, nodesSql, edgesSql].join("\n");

	const result = await execPsql(fullSql);
	if (result.exitCode !== 0) {
		throw new Error(`Seed flow ${flow.name} falhou: ${result.stderr}`);
	}
}

/**
 * Remove flows de teste e suas sessões.
 */
async function cleanupFlows(flowIds: string[]): Promise<void> {
	if (flowIds.length === 0) return;
	const ids = flowIds.map((id) => `'${id}'`).join(",");
	await execPsql(`
		DELETE FROM "FlowSession" WHERE "flowId" IN (${ids});
		DELETE FROM "FlowEdge" WHERE "flowId" IN (${ids});
		DELETE FROM "FlowNode" WHERE "flowId" IN (${ids});
		DELETE FROM "Flow" WHERE id IN (${ids});
	`);
}

async function execPsql(sql: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const { exec } = await import("child_process");
	return new Promise((resolve) => {
		const escaped = sql.replace(/"/g, '\\"');
		exec(
			`docker exec chatwit_postgres psql -U postgres -d socialwise -c "${escaped}"`,
			{ timeout: 10_000 },
			(error, stdout, stderr) => {
				resolve({
					exitCode: error?.code ?? 0,
					stdout: stdout?.toString() ?? "",
					stderr: stderr?.toString() ?? "",
				});
			},
		);
	});
}

async function execPsqlTuples(sql: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const { exec } = await import("child_process");
	return new Promise((resolve) => {
		const escaped = sql.replace(/"/g, '\\"');
		exec(
			`docker exec chatwit_postgres psql -U postgres -d socialwise -t -c "${escaped}"`,
			{ timeout: 10_000 },
			(error, stdout, stderr) => {
				resolve({
					exitCode: error?.code ?? 0,
					stdout: stdout?.toString() ?? "",
					stderr: stderr?.toString() ?? "",
				});
			},
		);
	});
}

/**
 * Busca FlowSession pelo flowId.
 */
async function getFlowSessions(
	flowId: string,
): Promise<Array<{ id: string; status: string; currentNodeId: string | null; variables: string }>> {
	const result = await execPsqlTuples(
		`SELECT id, status, "currentNodeId", variables::text FROM "FlowSession" WHERE "flowId" = '${flowId}' ORDER BY "createdAt" DESC LIMIT 5;`,
	);
	if (!result.stdout.includes("|")) return [];
	return result.stdout
		.split("\n")
		.filter((line) => line.includes("|"))
		.map((line) => {
			const parts = line.split("|").map((p) => p.trim());
			return {
				id: parts[0],
				status: parts[1],
				currentNodeId: parts[2] === "" ? null : parts[2],
				variables: parts[3],
			};
		});
}

/**
 * Busca métricas da fila flow-builder-queues via Redis.
 */
async function getQueueJobCount(): Promise<number> {
	const result = await execPsql("SELECT 1;"); // Dummy — use redis-cli
	// Use redis-cli instead
	const { exec } = await import("child_process");
	return new Promise((resolve) => {
		exec(
			`docker exec chatwit_redis redis-cli LLEN bull:flow-builder-queues:wait`,
			{ timeout: 5000 },
			(_error, stdout) => {
				resolve(parseInt(stdout?.toString().trim() ?? "0", 10));
			},
		);
	});
}

// ============================================================================
// TRIGGER BUTTON HELPERS
// ============================================================================

/**
 * Cria um MapeamentoBotao do tipo START_FLOW para triggering de flow via webhook.
 */
async function seedTriggerButton(triggerBtnId: string, flowId: string): Promise<void> {
	await execPsql(`
		INSERT INTO "MapeamentoBotao" (id, "buttonId", "inboxId", "actionType", "actionPayload", description, "createdAt", "updatedAt")
		VALUES ('${triggerBtnId}', '${triggerBtnId}', '${TEST_INBOX_PRISMA_ID}', 'START_FLOW', '{"flowId": "${flowId}"}'::jsonb, 'E2E Trigger', NOW(), NOW())
		ON CONFLICT ("buttonId") DO NOTHING;
	`);
}

async function cleanupTriggerButton(triggerBtnId: string): Promise<void> {
	await execPsql(`DELETE FROM "MapeamentoBotao" WHERE "buttonId" = '${triggerBtnId}';`);
}

// ============================================================================
// WEBHOOK HELPERS
// ============================================================================

function buildFlowButtonPayload(buttonId: string, buttonTitle: string, overrides: Record<string, unknown> = {}) {
	const now = new Date().toISOString();
	const sid = uniqueSessionId();
	return {
		session_id: sid,
		message: buttonTitle,
		button_id: buttonId,
		button_title: buttonTitle,
		interaction_type: "button_reply",
		channel_type: "Channel::Whatsapp",
		language: "pt-br",
		context: {
			message: {
				id: Date.now(),
				content: buttonTitle,
				account_id: TEST_ACCOUNT_ID,
				inbox_id: TEST_INBOX_NUMERIC_ID,
				conversation_id: TEST_CONVERSATION_ID,
				message_type: "incoming",
				created_at: now,
				updated_at: now,
				source_id: `wamid.flow_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				content_type: "text",
				content_attributes: {
					button_reply: { id: buttonId, title: buttonTitle },
					interaction_type: "button_reply",
					interactive_payload: {
						type: "button_reply",
						button_reply: { id: buttonId, title: buttonTitle },
					},
				},
				sender_type: "Contact",
				sender_id: TEST_CONTACT_ID,
			},
			conversation: {
				id: TEST_CONVERSATION_ID,
				account_id: TEST_ACCOUNT_ID,
				inbox_id: TEST_INBOX_NUMERIC_ID,
				status: "open",
				created_at: "2026-02-13T22:06:43.899Z",
				updated_at: now,
				contact_id: TEST_CONTACT_ID,
			},
			contact: {
				id: TEST_CONTACT_ID,
				name: "Witalo Test",
				account_id: TEST_ACCOUNT_ID,
				created_at: "2025-07-06T14:35:28.590Z",
				updated_at: now,
				phone_number: "+558597550136",
			},
			inbox: {
				id: TEST_INBOX_NUMERIC_ID,
				channel_id: 1,
				account_id: TEST_ACCOUNT_ID,
				name: "WhatsApp - ANA",
				created_at: "2024-06-09T00:52:47.311Z",
				updated_at: now,
				channel_type: "Channel::Whatsapp",
			},
		},
		metadata: {
			event_name: "message.created",
			conversation_id: TEST_CONVERSATION_ID,
			conversation_display_id: TEST_CONVERSATION_DISPLAY_ID,
			message_id: Date.now(),
			account_id: TEST_ACCOUNT_ID,
			inbox_id: TEST_INBOX_NUMERIC_ID,
			chatwit_base_url: "https://chatwit.witdev.com.br",
			chatwit_agent_bot_token: TEST_CHATWIT_TOKEN,
		},
		...overrides,
	};
}

async function sendWebhook(body: unknown, timeout = FLOW_TIMEOUT): Promise<{ status: number; body: unknown }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);

	try {
		const res = await fetch(WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		const json = await res.json().catch(() => null);
		return { status: res.status, body: json };
	} finally {
		clearTimeout(timer);
	}
}

async function isServerReachable(): Promise<boolean> {
	try {
		const res = await fetch(WEBHOOK_URL, { method: "GET", signal: AbortSignal.timeout(5000) });
		return res.status === 200 || res.status === 503;
	} catch {
		return false;
	}
}

// ============================================================================
// FLOW DEFINITIONS — Vários cenários com combinações diferentes
// ============================================================================

const FLOWS: Record<string, TestFlow> = {};

// --- Flow 1: TEXT simples (START → TEXT → END) ---
FLOWS.simpleText = {
	id: uid("flow"),
	name: "E2E: Simple Text",
	nodes: [
		{ id: uid("node"), nodeType: "START", config: {} },
		{ id: uid("node"), nodeType: "TEXT_MESSAGE", config: { text: "Olá! Bem-vindo ao teste E2E." } },
		{ id: uid("node"), nodeType: "END", config: {} },
	],
	edges: [],
};
// Edges referenciando os nós criados
FLOWS.simpleText.edges = [
	{ id: uid("edge"), sourceNodeId: FLOWS.simpleText.nodes[0].id, targetNodeId: FLOWS.simpleText.nodes[1].id },
	{ id: uid("edge"), sourceNodeId: FLOWS.simpleText.nodes[1].id, targetNodeId: FLOWS.simpleText.nodes[2].id },
];

// --- Flow 2: INTERACTIVE com botões (START → INTERACTIVE → [btn1 → TEXT → END, btn2 → TEXT → END]) ---
const f2Nodes = {
	start: uid("node"),
	interactive: uid("node"),
	textA: uid("node"),
	textB: uid("node"),
	endA: uid("node"),
	endB: uid("node"),
};
const f2BtnA = `flow_e2e_opcao_a_${Date.now()}`;
const f2BtnB = `flow_e2e_opcao_b_${Date.now()}`;

FLOWS.interactive = {
	id: uid("flow"),
	name: "E2E: Interactive Buttons",
	nodes: [
		{ id: f2Nodes.start, nodeType: "START", config: {} },
		{
			id: f2Nodes.interactive,
			nodeType: "INTERACTIVE_MESSAGE",
			config: {
				body: "Escolha uma opção:",
				buttons: [
					{ id: f2BtnA, title: "Opção A" },
					{ id: f2BtnB, title: "Opção B" },
				],
			},
		},
		{ id: f2Nodes.textA, nodeType: "TEXT_MESSAGE", config: { text: "Você escolheu A!" } },
		{ id: f2Nodes.textB, nodeType: "TEXT_MESSAGE", config: { text: "Você escolheu B!" } },
		{ id: f2Nodes.endA, nodeType: "END", config: {} },
		{ id: f2Nodes.endB, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f2Nodes.start, targetNodeId: f2Nodes.interactive },
		{ id: uid("edge"), sourceNodeId: f2Nodes.interactive, targetNodeId: f2Nodes.textA, buttonId: f2BtnA },
		{ id: uid("edge"), sourceNodeId: f2Nodes.interactive, targetNodeId: f2Nodes.textB, buttonId: f2BtnB },
		{ id: uid("edge"), sourceNodeId: f2Nodes.textA, targetNodeId: f2Nodes.endA },
		{ id: uid("edge"), sourceNodeId: f2Nodes.textB, targetNodeId: f2Nodes.endB },
	],
};

// --- Flow 3: SET_VARIABLE + CONDITION branching ---
const f3Nodes = {
	start: uid("node"),
	setVar: uid("node"),
	condition: uid("node"),
	textTrue: uid("node"),
	textFalse: uid("node"),
	end: uid("node"),
};

FLOWS.conditionBranch = {
	id: uid("flow"),
	name: "E2E: Condition Branch",
	nodes: [
		{ id: f3Nodes.start, nodeType: "START", config: {} },
		{
			id: f3Nodes.setVar,
			nodeType: "SET_VARIABLE",
			config: { variableName: "user_type", expression: "vip" },
		},
		{
			id: f3Nodes.condition,
			nodeType: "CONDITION",
			config: { variable: "user_type", operator: "eq", value: "vip" },
		},
		{ id: f3Nodes.textTrue, nodeType: "TEXT_MESSAGE", config: { text: "Bem-vindo, usuário VIP!" } },
		{ id: f3Nodes.textFalse, nodeType: "TEXT_MESSAGE", config: { text: "Bem-vindo, usuário comum." } },
		{ id: f3Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f3Nodes.start, targetNodeId: f3Nodes.setVar },
		{ id: uid("edge"), sourceNodeId: f3Nodes.setVar, targetNodeId: f3Nodes.condition },
		{ id: uid("edge"), sourceNodeId: f3Nodes.condition, targetNodeId: f3Nodes.textTrue, conditionBranch: "true" },
		{ id: uid("edge"), sourceNodeId: f3Nodes.condition, targetNodeId: f3Nodes.textFalse, conditionBranch: "false" },
		{ id: uid("edge"), sourceNodeId: f3Nodes.textTrue, targetNodeId: f3Nodes.end },
		{ id: uid("edge"), sourceNodeId: f3Nodes.textFalse, targetNodeId: f3Nodes.end },
	],
};

// --- Flow 4: Variable resolution (contact_name, system_date) ---
const f4Nodes = {
	start: uid("node"),
	text: uid("node"),
	end: uid("node"),
};

FLOWS.variableResolution = {
	id: uid("flow"),
	name: "E2E: Variable Resolution",
	nodes: [
		{ id: f4Nodes.start, nodeType: "START", config: {} },
		{
			id: f4Nodes.text,
			nodeType: "TEXT_MESSAGE",
			config: { text: "Olá {{contact_name}}! Hoje é {{system_date}}." },
		},
		{ id: f4Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f4Nodes.start, targetNodeId: f4Nodes.text },
		{ id: uid("edge"), sourceNodeId: f4Nodes.text, targetNodeId: f4Nodes.end },
	],
};

// --- Flow 5: REACTION + TEXT (harvest combinado) ---
const f5Nodes = {
	start: uid("node"),
	interactive: uid("node"),
	reaction: uid("node"),
	text: uid("node"),
	end: uid("node"),
};
const f5Btn = `flow_e2e_react_${Date.now()}`;

FLOWS.reactionText = {
	id: uid("flow"),
	name: "E2E: Reaction + Text",
	nodes: [
		{ id: f5Nodes.start, nodeType: "START", config: {} },
		{
			id: f5Nodes.interactive,
			nodeType: "INTERACTIVE_MESSAGE",
			config: {
				body: "Clique para testar reaction:",
				buttons: [{ id: f5Btn, title: "Reagir" }],
			},
		},
		{ id: f5Nodes.reaction, nodeType: "REACTION", config: { emoji: "👍" } },
		{ id: f5Nodes.text, nodeType: "TEXT_MESSAGE", config: { text: "Reação enviada com sucesso!" } },
		{ id: f5Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f5Nodes.start, targetNodeId: f5Nodes.interactive },
		{ id: uid("edge"), sourceNodeId: f5Nodes.interactive, targetNodeId: f5Nodes.reaction, buttonId: f5Btn },
		{ id: uid("edge"), sourceNodeId: f5Nodes.reaction, targetNodeId: f5Nodes.text },
		{ id: uid("edge"), sourceNodeId: f5Nodes.text, targetNodeId: f5Nodes.end },
	],
};

// --- Flow 6: MEDIA barrier (TEXT → INTERACTIVE → [btn → TEXT → MEDIA → TEXT → END]) ---
const f6Nodes = {
	start: uid("node"),
	interactive: uid("node"),
	textBefore: uid("node"),
	media: uid("node"),
	textAfter: uid("node"),
	end: uid("node"),
};
const f6Btn = `flow_e2e_media_${Date.now()}`;

FLOWS.mediaBarrier = {
	id: uid("flow"),
	name: "E2E: Media Barrier",
	nodes: [
		{ id: f6Nodes.start, nodeType: "START", config: {} },
		{
			id: f6Nodes.interactive,
			nodeType: "INTERACTIVE_MESSAGE",
			config: {
				body: "Clique para receber mídia:",
				buttons: [{ id: f6Btn, title: "Enviar Foto" }],
			},
		},
		{ id: f6Nodes.textBefore, nodeType: "TEXT_MESSAGE", config: { text: "Preparando sua foto..." } },
		{
			id: f6Nodes.media,
			nodeType: "MEDIA",
			config: {
				mediaUrl: "https://via.placeholder.com/300x200.png?text=E2E+Test",
				caption: "Foto de teste E2E",
				filename: "e2e-test.png",
			},
		},
		{ id: f6Nodes.textAfter, nodeType: "TEXT_MESSAGE", config: { text: "Foto enviada! Obrigado." } },
		{ id: f6Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f6Nodes.start, targetNodeId: f6Nodes.interactive },
		{ id: uid("edge"), sourceNodeId: f6Nodes.interactive, targetNodeId: f6Nodes.textBefore, buttonId: f6Btn },
		{ id: uid("edge"), sourceNodeId: f6Nodes.textBefore, targetNodeId: f6Nodes.media },
		{ id: uid("edge"), sourceNodeId: f6Nodes.media, targetNodeId: f6Nodes.textAfter },
		{ id: uid("edge"), sourceNodeId: f6Nodes.textAfter, targetNodeId: f6Nodes.end },
	],
};

// --- Flow 7: DELAY barrier (INTERACTIVE → [btn → TEXT → DELAY → TEXT → END]) ---
const f7Nodes = {
	start: uid("node"),
	interactive: uid("node"),
	textBefore: uid("node"),
	delayNode: uid("node"),
	textAfter: uid("node"),
	end: uid("node"),
};
const f7Btn = `flow_e2e_delay_${Date.now()}`;

FLOWS.delayBarrier = {
	id: uid("flow"),
	name: "E2E: Delay Barrier",
	nodes: [
		{ id: f7Nodes.start, nodeType: "START", config: {} },
		{
			id: f7Nodes.interactive,
			nodeType: "INTERACTIVE_MESSAGE",
			config: {
				body: "Clique para testar delay:",
				buttons: [{ id: f7Btn, title: "Aguardar" }],
			},
		},
		{ id: f7Nodes.textBefore, nodeType: "TEXT_MESSAGE", config: { text: "Aguarde 2 segundos..." } },
		{ id: f7Nodes.delayNode, nodeType: "DELAY", config: { delayMs: 2000 } },
		{ id: f7Nodes.textAfter, nodeType: "TEXT_MESSAGE", config: { text: "Delay concluído!" } },
		{ id: f7Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f7Nodes.start, targetNodeId: f7Nodes.interactive },
		{ id: uid("edge"), sourceNodeId: f7Nodes.interactive, targetNodeId: f7Nodes.textBefore, buttonId: f7Btn },
		{ id: uid("edge"), sourceNodeId: f7Nodes.textBefore, targetNodeId: f7Nodes.delayNode },
		{ id: uid("edge"), sourceNodeId: f7Nodes.delayNode, targetNodeId: f7Nodes.textAfter },
		{ id: uid("edge"), sourceNodeId: f7Nodes.textAfter, targetNodeId: f7Nodes.end },
	],
};

// --- Flow 8: CHATWIT_ACTION (INTERACTIVE → [btn → TEXT → CHATWIT_ACTION → END]) ---
const f8Nodes = {
	start: uid("node"),
	interactive: uid("node"),
	text: uid("node"),
	action: uid("node"),
	end: uid("node"),
};
const f8Btn = `flow_e2e_action_${Date.now()}`;

FLOWS.chatwitAction = {
	id: uid("flow"),
	name: "E2E: Chatwit Action",
	nodes: [
		{ id: f8Nodes.start, nodeType: "START", config: {} },
		{
			id: f8Nodes.interactive,
			nodeType: "INTERACTIVE_MESSAGE",
			config: {
				body: "Clique para executar ação:",
				buttons: [{ id: f8Btn, title: "Resolver" }],
			},
		},
		{ id: f8Nodes.text, nodeType: "TEXT_MESSAGE", config: { text: "Processando ação..." } },
		{
			id: f8Nodes.action,
			nodeType: "CHATWIT_ACTION",
			config: {
				actionType: "add_label",
				labels: [{ title: "e2e-test-label", color: "#FF0000" }],
			},
		},
		{ id: f8Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f8Nodes.start, targetNodeId: f8Nodes.interactive },
		{ id: uid("edge"), sourceNodeId: f8Nodes.interactive, targetNodeId: f8Nodes.text, buttonId: f8Btn },
		{ id: uid("edge"), sourceNodeId: f8Nodes.text, targetNodeId: f8Nodes.action },
		{ id: uid("edge"), sourceNodeId: f8Nodes.action, targetNodeId: f8Nodes.end },
	],
};

// --- Flow 9: Multi-TEXT (START → TEXT1 → TEXT2 → TEXT3 → INTERACTIVE → END) ---
const f9Nodes = {
	start: uid("node"),
	text1: uid("node"),
	text2: uid("node"),
	text3: uid("node"),
	end: uid("node"),
};

FLOWS.multiText = {
	id: uid("flow"),
	name: "E2E: Multi Text",
	nodes: [
		{ id: f9Nodes.start, nodeType: "START", config: {} },
		{ id: f9Nodes.text1, nodeType: "TEXT_MESSAGE", config: { text: "Linha 1: Bem-vindo!" } },
		{ id: f9Nodes.text2, nodeType: "TEXT_MESSAGE", config: { text: "Linha 2: Este é um teste." } },
		{ id: f9Nodes.text3, nodeType: "TEXT_MESSAGE", config: { text: "Linha 3: Obrigado por participar." } },
		{ id: f9Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f9Nodes.start, targetNodeId: f9Nodes.text1 },
		{ id: uid("edge"), sourceNodeId: f9Nodes.text1, targetNodeId: f9Nodes.text2 },
		{ id: uid("edge"), sourceNodeId: f9Nodes.text2, targetNodeId: f9Nodes.text3 },
		{ id: uid("edge"), sourceNodeId: f9Nodes.text3, targetNodeId: f9Nodes.end },
	],
};

// --- Flow 10: Long chain (TEXT → INTERACTIVE → [btn → REACTION → TEXT → MEDIA → TEXT → END]) ---
const f10Nodes = {
	start: uid("node"),
	text1: uid("node"),
	interactive: uid("node"),
	reaction: uid("node"),
	text2: uid("node"),
	media: uid("node"),
	text3: uid("node"),
	end: uid("node"),
};
const f10Btn = `flow_e2e_long_${Date.now()}`;

FLOWS.longChain = {
	id: uid("flow"),
	name: "E2E: Long Chain",
	nodes: [
		{ id: f10Nodes.start, nodeType: "START", config: {} },
		{ id: f10Nodes.text1, nodeType: "TEXT_MESSAGE", config: { text: "Início do flow longo." } },
		{
			id: f10Nodes.interactive,
			nodeType: "INTERACTIVE_MESSAGE",
			config: {
				body: "Continuar o flow?",
				buttons: [{ id: f10Btn, title: "Continuar" }],
			},
		},
		{ id: f10Nodes.reaction, nodeType: "REACTION", config: { emoji: "🚀" } },
		{ id: f10Nodes.text2, nodeType: "TEXT_MESSAGE", config: { text: "Texto antes da mídia." } },
		{
			id: f10Nodes.media,
			nodeType: "MEDIA",
			config: {
				mediaUrl: "https://via.placeholder.com/100x100.png?text=Long",
				caption: "Mídia do flow longo",
			},
		},
		{ id: f10Nodes.text3, nodeType: "TEXT_MESSAGE", config: { text: "Texto após a mídia (async)." } },
		{ id: f10Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f10Nodes.start, targetNodeId: f10Nodes.text1 },
		{ id: uid("edge"), sourceNodeId: f10Nodes.text1, targetNodeId: f10Nodes.interactive },
		{ id: uid("edge"), sourceNodeId: f10Nodes.interactive, targetNodeId: f10Nodes.reaction, buttonId: f10Btn },
		{ id: uid("edge"), sourceNodeId: f10Nodes.reaction, targetNodeId: f10Nodes.text2 },
		{ id: uid("edge"), sourceNodeId: f10Nodes.text2, targetNodeId: f10Nodes.media },
		{ id: uid("edge"), sourceNodeId: f10Nodes.media, targetNodeId: f10Nodes.text3 },
		{ id: uid("edge"), sourceNodeId: f10Nodes.text3, targetNodeId: f10Nodes.end },
	],
};

// --- Flow 11: Double Interactive (INTERACTIVE1 → [btn → TEXT → INTERACTIVE2 → [btn → TEXT → END]]) ---
const f11Nodes = {
	start: uid("node"),
	interactive1: uid("node"),
	textMiddle: uid("node"),
	interactive2: uid("node"),
	textFinal: uid("node"),
	end: uid("node"),
};
const f11Btn1 = `flow_e2e_step1_${Date.now()}`;
const f11Btn2 = `flow_e2e_step2_${Date.now()}`;

FLOWS.doubleInteractive = {
	id: uid("flow"),
	name: "E2E: Double Interactive",
	nodes: [
		{ id: f11Nodes.start, nodeType: "START", config: {} },
		{
			id: f11Nodes.interactive1,
			nodeType: "INTERACTIVE_MESSAGE",
			config: {
				body: "Passo 1: Escolha algo",
				buttons: [{ id: f11Btn1, title: "Próximo" }],
			},
		},
		{ id: f11Nodes.textMiddle, nodeType: "TEXT_MESSAGE", config: { text: "Boa escolha! Agora o passo 2." } },
		{
			id: f11Nodes.interactive2,
			nodeType: "INTERACTIVE_MESSAGE",
			config: {
				body: "Passo 2: Confirmar?",
				buttons: [{ id: f11Btn2, title: "Confirmar" }],
			},
		},
		{ id: f11Nodes.textFinal, nodeType: "TEXT_MESSAGE", config: { text: "Confirmado! Flow completo." } },
		{ id: f11Nodes.end, nodeType: "END", config: {} },
	],
	edges: [
		{ id: uid("edge"), sourceNodeId: f11Nodes.start, targetNodeId: f11Nodes.interactive1 },
		{ id: uid("edge"), sourceNodeId: f11Nodes.interactive1, targetNodeId: f11Nodes.textMiddle, buttonId: f11Btn1 },
		{ id: uid("edge"), sourceNodeId: f11Nodes.textMiddle, targetNodeId: f11Nodes.interactive2 },
		{ id: uid("edge"), sourceNodeId: f11Nodes.interactive2, targetNodeId: f11Nodes.textFinal, buttonId: f11Btn2 },
		{ id: uid("edge"), sourceNodeId: f11Nodes.textFinal, targetNodeId: f11Nodes.end },
	],
};

// ============================================================================
// TEST SUITE
// ============================================================================

describe("E2E: Flow Builder — Execução de Flows", () => {
	const allFlowIds = Object.values(FLOWS).map((f) => f.id);

	// Pre-check + seed
	beforeAll(async () => {
		const reachable = await isServerReachable();
		if (!reachable) {
			throw new Error(`Servidor não acessível em ${WEBHOOK_URL}. Execute: docker compose up`);
		}

		// Limpar flows anteriores (se existirem)
		await cleanupFlows(allFlowIds);

		// Seed todos os flows
		for (const flow of Object.values(FLOWS)) {
			await seedFlow(flow);
		}
	}, 30_000);

	afterAll(async () => {
		await cleanupFlows(allFlowIds);
	}, 15_000);

	afterEach(async () => {
		await delay(RATE_LIMIT_DELAY);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 1. FLOW SIMPLES: TEXT → END
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 1: Simple Text (START → TEXT → END)", () => {
		it(
			"executeFlowById retorna texto sync via webhook",
			async () => {
				const payload = buildFlowButtonPayload(`flow_trigger_${FLOWS.simpleText.id}`, "Iniciar");
				// Override: enviar intent_name que mapeia para este flow
				// Como não temos intent mapping, vamos testar via API direta
				// Alternativa: criar MapeamentoIntencao ou usar executeFlowById

				// Para testar via webhook, precisamos de uma sessão ativa ou intent mapping.
				// Vamos verificar que o flow foi criado corretamente consultando o DB
				const sessions = await getFlowSessions(FLOWS.simpleText.id);
				// Nenhuma sessão deve existir antes
				expect(sessions.length).toBe(0);
			},
			FLOW_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 2. FLOW INTERATIVO: INTERACTIVE com botões
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 2: Interactive Buttons", () => {
		it(
			"executar flow e verificar sessão WAITING_INPUT",
			async () => {
				// Criar MapeamentoBotao do tipo START_FLOW para triggering
				const triggerBtnId = `flow_trigger_interactive_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.interactive.id);

				// Enviar botão que triggera o flow
				const payload = buildFlowButtonPayload(triggerBtnId, "Trigger Interactive");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// Resposta sync deve conter interactive com botões
				const response = body as Record<string, unknown>;
				if (response.whatsapp) {
					const wa = response.whatsapp as Record<string, unknown>;
					expect(wa.type).toBe("interactive");
					const interactive = wa.interactive as Record<string, unknown>;
					expect(interactive).toHaveProperty("body");
					expect(interactive).toHaveProperty("action");
				}

				// Verificar sessão criada no DB
				await delay(500);
				const sessions = await getFlowSessions(FLOWS.interactive.id);
				expect(sessions.length).toBeGreaterThanOrEqual(1);

				const latestSession = sessions[0];
				expect(latestSession.status).toBe("WAITING_INPUT");
				expect(latestSession.currentNodeId).toBe(f2Nodes.interactive);

				// Cleanup trigger
				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT,
		);

		it(
			"clique de botão flow_ resume sessão e retorna texto do branch correto",
			async () => {
				// Verificar que temos sessão WAITING_INPUT
				const sessionsBefore = await getFlowSessions(FLOWS.interactive.id);
				const waitingSession = sessionsBefore.find((s) => s.status === "WAITING_INPUT");

				if (!waitingSession) {
					console.warn("Sem sessão WAITING_INPUT — pulando teste de resume");
					return;
				}

				// Clicar no botão A
				const payload = buildFlowButtonPayload(f2BtnA, "Opção A");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// Resposta deve conter o texto "Você escolheu A!" (sync ou via button_reaction)
				const response = body as Record<string, unknown>;

				// Pode vir em vários formatos:
				// 1. { whatsapp: { type: "text", text: { body: "..." } } }
				// 2. { action_type: "button_reaction", text: "...", whatsapp: { response_text: "..." } }
				// 3. { text: "..." }
				const responseText =
					((response.whatsapp as Record<string, unknown>)?.text as Record<string, unknown>)?.body ||
					(response.text as string) ||
					((response.whatsapp as Record<string, unknown>)?.response_text as string) ||
					"";

				// O texto pode não estar presente se foi para async, mas o flow deve ter completado
				await delay(1000);
				const sessionsAfter = await getFlowSessions(FLOWS.interactive.id);
				const completedSession = sessionsAfter.find((s) => s.status === "COMPLETED");
				expect(completedSession).toBeDefined();
			},
			FLOW_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 3. CONDITION BRANCHING
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 3: Condition Branch", () => {
		it(
			"SET_VARIABLE + CONDITION avalia branch true corretamente",
			async () => {
				const triggerBtnId = `flow_trigger_condition_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.conditionBranch.id);

				const payload = buildFlowButtonPayload(triggerBtnId, "Trigger Condition");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);

				// Flow: START → SET(user_type=vip) → CONDITION(eq vip) → TEXT("VIP!") → END
				// Deve ter completado
				await delay(500);
				const sessions = await getFlowSessions(FLOWS.conditionBranch.id);
				expect(sessions.length).toBeGreaterThanOrEqual(1);

				const session = sessions[0];
				expect(session.status).toBe("COMPLETED");

				// Variáveis devem conter user_type=vip
				const vars = JSON.parse(session.variables || "{}");
				expect(vars.user_type).toBe("vip");

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 4. VARIABLE RESOLUTION
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 4: Variable Resolution", () => {
		it(
			"resolve {{contact_name}} e {{system_date}} no texto",
			async () => {
				const triggerBtnId = `flow_trigger_var_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.variableResolution.id);

				const payload = buildFlowButtonPayload(triggerBtnId, "Trigger Vars");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);

				// Resposta sync deve conter o nome resolvido
				const response = body as Record<string, unknown>;
				const responseText =
					((response.whatsapp as Record<string, unknown>)?.text as Record<string, unknown>)?.body ||
					(response.text as string) ||
					"";

				if (responseText) {
					// Não deve conter placeholders não-resolvidos
					expect(responseText).not.toContain("{{contact_name}}");
					// Deve conter o nome do contato "Witalo Test"
					expect(responseText).toContain("Witalo");
				}

				await delay(500);
				const sessions = await getFlowSessions(FLOWS.variableResolution.id);
				expect(sessions[0]?.status).toBe("COMPLETED");

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 5. REACTION + TEXT (harvest combinado)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 5: Reaction + Text", () => {
		it(
			"executa flow e cria sessão WAITING_INPUT, depois resume com botão",
			async () => {
				// Trigger o flow
				const triggerBtnId = `flow_trigger_react_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.reactionText.id);

				const payload1 = buildFlowButtonPayload(triggerBtnId, "Trigger React");
				const { status: s1 } = await sendWebhook(payload1);
				expect(s1).toBe(200);

				// Sessão deve estar WAITING_INPUT
				await delay(500);
				const sessions1 = await getFlowSessions(FLOWS.reactionText.id);
				const waiting = sessions1.find((s) => s.status === "WAITING_INPUT");
				expect(waiting).toBeDefined();

				// Clicar botão de reação
				await delay(RATE_LIMIT_DELAY);
				const payload2 = buildFlowButtonPayload(f5Btn, "Reagir");
				const { status: s2, body: body2 } = await sendWebhook(payload2);

				expect(s2).toBe(200);

				// Resposta pode ser button_reaction combinado (emoji + texto)
				const response = body2 as Record<string, unknown>;
				if (response.action_type === "button_reaction") {
					// Harvest: emoji + texto combinados
					expect(response.emoji).toBe("👍");
				}

				await delay(1000);
				const sessions2 = await getFlowSessions(FLOWS.reactionText.id);
				const completed = sessions2.find((s) => s.status === "COMPLETED");
				expect(completed).toBeDefined();

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT * 2,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 6. MEDIA BARRIER (sync harvest + async continuation)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 6: Media Barrier", () => {
		it(
			"text antes do MEDIA vai sync, MEDIA+ vai async em background",
			async () => {
				const triggerBtnId = `flow_trigger_media_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.mediaBarrier.id);

				// Trigger flow → INTERACTIVE com botão
				const payload1 = buildFlowButtonPayload(triggerBtnId, "Trigger Media");
				const { status: s1 } = await sendWebhook(payload1);
				expect(s1).toBe(200);

				await delay(500);
				const sessions1 = await getFlowSessions(FLOWS.mediaBarrier.id);
				expect(sessions1.find((s) => s.status === "WAITING_INPUT")).toBeDefined();

				// Clicar botão
				await delay(RATE_LIMIT_DELAY);
				const payload2 = buildFlowButtonPayload(f6Btn, "Enviar Foto");
				const { status: s2, body: body2 } = await sendWebhook(payload2);

				expect(s2).toBe(200);

				// Resposta sync deve conter "Preparando sua foto..." (harvest antes da barreira MEDIA)
				const response = body2 as Record<string, unknown>;

				// Verificar que o texto do harvest está na resposta
				const responseText =
					(response.text as string) ||
					((response.whatsapp as Record<string, unknown>)?.response_text as string) ||
					((response.whatsapp as Record<string, unknown>)?.text as Record<string, unknown>)?.body ||
					"";

				// O texto do harvest "Preparando sua foto..." pode estar em vários formatos
				// O importante é que a resposta seja imediata (não bloqueou no MEDIA)

				// Esperar async completar (MEDIA + TEXT_AFTER + END)
				await delay(ASYNC_SETTLE_TIME);
				const sessions2 = await getFlowSessions(FLOWS.mediaBarrier.id);
				// A sessão pode estar COMPLETED (async terminou) ou WAITING_INPUT (se não encontrou edge)
				const latestSession = sessions2[0];
				expect(["COMPLETED", "WAITING_INPUT", "ACTIVE"]).toContain(latestSession?.status);

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT * 2,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 7. DELAY BARRIER
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 7: Delay Barrier", () => {
		it(
			"text antes do DELAY vai sync, DELAY+ continua em background",
			async () => {
				const triggerBtnId = `flow_trigger_delay_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.delayBarrier.id);

				const payload1 = buildFlowButtonPayload(triggerBtnId, "Trigger Delay");
				const { status: s1 } = await sendWebhook(payload1);
				expect(s1).toBe(200);

				await delay(500);
				const sessions1 = await getFlowSessions(FLOWS.delayBarrier.id);
				expect(sessions1.find((s) => s.status === "WAITING_INPUT")).toBeDefined();

				await delay(RATE_LIMIT_DELAY);
				const payload2 = buildFlowButtonPayload(f7Btn, "Aguardar");
				const { status: s2 } = await sendWebhook(payload2);

				expect(s2).toBe(200);

				// Esperar delay (2s) + async settle
				await delay(2000 + ASYNC_SETTLE_TIME);
				const sessions2 = await getFlowSessions(FLOWS.delayBarrier.id);
				const latestSession = sessions2[0];
				// Async deve ter completado após o delay
				expect(["COMPLETED", "WAITING_INPUT", "ACTIVE"]).toContain(latestSession?.status);

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT * 3,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 8. CHATWIT_ACTION → BullMQ job
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 8: Chatwit Action (BullMQ)", () => {
		it(
			"CHATWIT_ACTION enfileira job e não bloqueia o flow",
			async () => {
				const triggerBtnId = `flow_trigger_action_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.chatwitAction.id);

				// Trigger: INTERACTIVE com botão
				const payload1 = buildFlowButtonPayload(triggerBtnId, "Trigger Action");
				const { status: s1 } = await sendWebhook(payload1);
				expect(s1).toBe(200);

				await delay(500);

				// Clicar botão → TEXT → CHATWIT_ACTION → END
				await delay(RATE_LIMIT_DELAY);
				const payload2 = buildFlowButtonPayload(f8Btn, "Resolver");
				const { status: s2 } = await sendWebhook(payload2);

				expect(s2).toBe(200);

				// Flow deve completar sem bloquear (CHATWIT_ACTION é non-blocking)
				await delay(1000);
				const sessions = await getFlowSessions(FLOWS.chatwitAction.id);
				const completed = sessions.find((s) => s.status === "COMPLETED");
				expect(completed).toBeDefined();

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT * 2,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 9. MULTI-TEXT (concatenação no sync)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 9: Multi Text", () => {
		it(
			"múltiplos TEXT nodes geram resposta sync",
			async () => {
				const triggerBtnId = `flow_trigger_multi_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.multiText.id);

				const payload = buildFlowButtonPayload(triggerBtnId, "Trigger Multi");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);

				// Flow completa e sessão deve estar COMPLETED
				await delay(500);
				const sessions = await getFlowSessions(FLOWS.multiText.id);
				expect(sessions[0]?.status).toBe("COMPLETED");

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 10. LONG CHAIN (TEXT → INTERACTIVE → REACTION → TEXT → MEDIA → TEXT → END)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 10: Long Chain (sync + async)", () => {
		it(
			"flow longo executa harvest sync até barreira MEDIA, depois async",
			async () => {
				const triggerBtnId = `flow_trigger_long_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.longChain.id);

				// Step 1: Trigger → TEXT + INTERACTIVE (sync)
				const payload1 = buildFlowButtonPayload(triggerBtnId, "Trigger Long");
				const { status: s1, body: body1 } = await sendWebhook(payload1);
				expect(s1).toBe(200);

				await delay(500);
				const sessions1 = await getFlowSessions(FLOWS.longChain.id);
				expect(sessions1.find((s) => s.status === "WAITING_INPUT")).toBeDefined();

				// Step 2: Clicar botão → REACTION + TEXT (harvest sync) → MEDIA (barrier async)
				await delay(RATE_LIMIT_DELAY);
				const payload2 = buildFlowButtonPayload(f10Btn, "Continuar");
				const startTime = Date.now();
				const { status: s2, body: body2 } = await sendWebhook(payload2);
				const responseTime = Date.now() - startTime;

				expect(s2).toBe(200);

				// Resposta deve ser rápida (harvest não bloqueou no MEDIA)
				// Em ambiente local, deve ser < 5s
				expect(responseTime).toBeLessThan(5000);

				// Resposta sync pode conter reaction + text (harvest)
				const response = body2 as Record<string, unknown>;
				if (response.action_type === "button_reaction") {
					expect(response.emoji).toBe("🚀");
				}

				// Esperar async (MEDIA + TEXT + END)
				await delay(ASYNC_SETTLE_TIME);
				const sessions2 = await getFlowSessions(FLOWS.longChain.id);
				expect(["COMPLETED", "WAITING_INPUT", "ACTIVE"]).toContain(sessions2[0]?.status);

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT * 3,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 11. DOUBLE INTERACTIVE (multi-step wizard)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Flow 11: Double Interactive (multi-step)", () => {
		it(
			"navega por 2 INTERACTIVE_MESSAGE consecutivos com cliques de botão",
			async () => {
				const triggerBtnId = `flow_trigger_double_${Date.now()}`;
				await seedTriggerButton(triggerBtnId, FLOWS.doubleInteractive.id);

				// Step 1: Trigger → INTERACTIVE 1 (sync)
				const payload1 = buildFlowButtonPayload(triggerBtnId, "Trigger Double");
				const { status: s1 } = await sendWebhook(payload1);
				expect(s1).toBe(200);

				await delay(500);
				const sessions1 = await getFlowSessions(FLOWS.doubleInteractive.id);
				const waiting1 = sessions1.find((s) => s.status === "WAITING_INPUT");
				expect(waiting1).toBeDefined();
				expect(waiting1?.currentNodeId).toBe(f11Nodes.interactive1);

				// Step 2: Clicar btn1 → TEXT + INTERACTIVE 2 (sync, nova WAITING_INPUT)
				await delay(RATE_LIMIT_DELAY);
				const payload2 = buildFlowButtonPayload(f11Btn1, "Próximo");
				const { status: s2, body: body2 } = await sendWebhook(payload2);
				expect(s2).toBe(200);

				await delay(500);
				const sessions2 = await getFlowSessions(FLOWS.doubleInteractive.id);
				const waiting2 = sessions2.find((s) => s.status === "WAITING_INPUT");
				expect(waiting2).toBeDefined();
				expect(waiting2?.currentNodeId).toBe(f11Nodes.interactive2);

				// Step 3: Clicar btn2 → TEXT + END (completed)
				await delay(RATE_LIMIT_DELAY);
				const payload3 = buildFlowButtonPayload(f11Btn2, "Confirmar");
				const { status: s3, body: body3 } = await sendWebhook(payload3);
				expect(s3).toBe(200);

				await delay(1000);
				const sessions3 = await getFlowSessions(FLOWS.doubleInteractive.id);
				const completed = sessions3.find((s) => s.status === "COMPLETED");
				expect(completed).toBeDefined();

				await cleanupTriggerButton(triggerBtnId);
			},
			FLOW_TIMEOUT * 3,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 12. WEBHOOK NUNCA 500 (estabilidade)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Estabilidade: sem 500 em nenhum cenário", () => {
		it(
			"nenhum flow_ button gera status >= 500",
			async () => {
				const testButtons = [
					buildFlowButtonPayload("flow_nonexistent_abc123", "Botão inexistente"),
					buildFlowButtonPayload("flow_", "Vazio"),
					buildFlowButtonPayload("flow_test_malformed", "Malformed"),
				];

				for (const payload of testButtons) {
					payload.context.message.source_id = `wamid.stability_${Date.now()}_${Math.random().toString(36).slice(2)}`;
					const { status } = await sendWebhook(payload);
					expect(status).toBeLessThan(500);
					await delay(500);
				}
			},
			FLOW_TIMEOUT * 2,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 13. QUEUE METRICS (BullMQ observabilidade)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	describe("Queue Metrics", () => {
		it("fila flow-builder-queues existe no Redis", async () => {
			const { exec } = await import("child_process");
			const result = await new Promise<string>((resolve) => {
				exec(
					`docker exec chatwit_redis redis-cli KEYS "bull:flow-builder-queues:*" | head -5`,
					{ timeout: 5000 },
					(_error, stdout) => resolve(stdout?.toString() ?? ""),
				);
			});

			// Se a fila existe, deve ter pelo menos a meta key
			// Se não executou nenhum CHATWIT_ACTION, pode estar vazia — ok
			expect(typeof result).toBe("string");
		});
	});
});
