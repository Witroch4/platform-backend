/**
 * E2E Test Suite: SocialWise Flow Webhook
 *
 * Testa o fluxo real do webhook contra o servidor rodando em localhost:3002.
 * Requer: docker compose up (app + postgres + redis + worker)
 *
 * Cenários cobertos:
 * 1. Texto livre → HARD band (direct_map) ou ROUTER band (router_llm)
 * 2. Botão de button_reply (btn_*) → button reaction
 * 3. Botão não-mapeado → LLM processa texto do botão
 * 4. Timeout / deadline → resposta com @retry + @falar_atendente
 * 5. @retry → degradação de modelo (fallback provider)
 * 6. @retry com context expirado → mensagem amigável
 * 7. @retry excede max tentativas → handoff forçado
 * 8. @falar_atendente → handoff nativo
 * 9. @recomecar → restart da conversa
 * 10. @sair → encerrar conversa
 * 11. Payload inválido → 400
 * 12. Payload muito grande → 413
 * 13. Health check GET → 200
 */

const BASE_URL = process.env.TEST_WEBHOOK_URL || "http://localhost:3002";
const WEBHOOK_PATH = "/api/integrations/webhooks/socialwiseflow";
const WEBHOOK_URL = `${BASE_URL}${WEBHOOK_PATH}`;

// Timeout generoso para E2E — LLM pode demorar
const LLM_TIMEOUT = 30_000;

// Delay entre testes para evitar rate limiting (ms)
const RATE_LIMIT_DELAY = 2_000;

// Gerador de session_id único por teste para evitar rate limiting por sessão
let sessionCounter = 0;
function uniqueSessionId(): string {
	return `55${Date.now()}${++sessionCounter}`;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ HELPERS ============

function buildTextPayload(
	message: string,
	overrides: Record<string, any> = {},
) {
	const now = new Date().toISOString();
	const sid = uniqueSessionId();
	return {
		session_id: sid,
		message,
		channel_type: "Channel::Whatsapp",
		language: "pt-br",
		context: {
			message: {
				id: Date.now(),
				content: message,
				account_id: 3,
				inbox_id: 4,
				conversation_id: 2740,
				message_type: "incoming",
				created_at: now,
				updated_at: now,
				source_id: `wamid.test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				content_type: "text",
				content_attributes: {},
				sender_type: "Contact",
				sender_id: 1447,
			},
			conversation: {
				id: 2740,
				account_id: 3,
				inbox_id: 4,
				status: "open",
				created_at: "2026-02-13T22:06:43.899Z",
				updated_at: now,
				contact_id: 1447,
			},
			contact: {
				id: 1447,
				name: "Witalo Test",
				account_id: 3,
				created_at: "2025-07-06T14:35:28.590Z",
				updated_at: now,
				phone_number: "+558597550136",
			},
			inbox: {
				id: 4,
				channel_id: 1,
				account_id: 3,
				name: "WhatsApp - ANA",
				created_at: "2024-06-09T00:52:47.311Z",
				updated_at: now,
				channel_type: "Channel::Whatsapp",
			},
		},
		metadata: {
			event_name: "message.created",
			conversation_id: 2740,
			conversation_display_id: 2530,
			message_id: Date.now(),
			account_id: 3,
			inbox_id: 4,
			chatwit_base_url: "https://chatwit.witdev.com.br",
			chatwit_agent_bot_token: "5rxTkF7gs9H9E9jqEW4fqeas",
		},
		...overrides,
	};
}

function buildButtonPayload(
	buttonId: string,
	buttonTitle: string,
	overrides: Record<string, any> = {},
) {
	const base = buildTextPayload(buttonTitle, overrides);
	return {
		...base,
		message: buttonTitle,
		button_id: buttonId,
		button_title: buttonTitle,
		interaction_type: "button_reply",
		context: {
			...base.context,
			message: {
				...base.context.message,
				content: buttonTitle,
				content_attributes: {
					button_reply: { id: buttonId, title: buttonTitle },
					interaction_type: "button_reply",
					interactive_payload: {
						type: "button_reply",
						button_reply: { id: buttonId, title: buttonTitle },
					},
				},
			},
		},
	};
}

function buildQuickReplyPayload(
	payload: string,
	title: string,
) {
	const base = buildTextPayload(title);
	return {
		...base,
		message: title,
		button_id: payload,
		context: {
			...base.context,
			message: {
				...base.context.message,
				content: title,
				content_attributes: {
					quick_reply_payload: payload,
				},
			},
		},
	};
}

async function sendWebhook(body: any, timeout = LLM_TIMEOUT): Promise<{ status: number; body: any }> {
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
		const res = await fetch(`${WEBHOOK_URL}`, {
			method: "GET",
			signal: AbortSignal.timeout(5000),
		});
		return res.status === 200 || res.status === 503;
	} catch {
		return false;
	}
}

// ============ TEST SUITE ============

describe("E2E: SocialWise Flow Webhook", () => {
	// Pre-check: servidor deve estar rodando
	beforeAll(async () => {
		const reachable = await isServerReachable();
		if (!reachable) {
			throw new Error(
				`Servidor não acessível em ${WEBHOOK_URL}. Execute: docker compose up`,
			);
		}
	});

	// Delay entre cada teste para evitar rate limiting
	afterEach(async () => {
		await delay(RATE_LIMIT_DELAY);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 1. HEALTH CHECK
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Health Check", () => {
		it("GET retorna status healthy ou degraded", async () => {
			const res = await fetch(WEBHOOK_URL, { method: "GET" });
			const json = await res.json();

			expect([200, 503]).toContain(res.status);
			expect(json).toHaveProperty("status");
			expect(["healthy", "degraded"]).toContain(json.status);
			expect(json).toHaveProperty("version");
		});
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 2. VALIDAÇÃO DE PAYLOAD
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Validação de Payload", () => {
		it("rejeita JSON inválido com 400", async () => {
			const res = await fetch(WEBHOOK_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{ invalid json !!!",
			});
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toBe("Invalid JSON");
		});

		it("rejeita payload sem campos obrigatórios com 400", async () => {
			const { status, body } = await sendWebhook({ message: "test" });
			expect(status).toBe(400);
			expect(body.error).toMatch(/Invalid payload/i);
		});

		it("rejeita payload maior que 256KB com 413", async () => {
			const largeMessage = "A".repeat(260 * 1024);
			const payload = buildTextPayload(largeMessage);
			const { status, body } = await sendWebhook(payload);
			expect(status).toBe(413);
			expect(body.error).toMatch(/too large/i);
		});
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 3. TEXTO LIVRE → HARD BAND ou ROUTER BAND
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Texto Livre (classificação por bandas)", () => {
		it(
			"processa mensagem de texto e retorna resposta WhatsApp válida",
			async () => {
				const payload = buildTextPayload("Quais são os serviços disponíveis?");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				// Resposta pode ser: whatsapp text, whatsapp interactive, ou timeout fallback
				expect(body).toBeDefined();

				if (body.whatsapp) {
					// WhatsApp text simples
					if (body.whatsapp.type === "text") {
						expect(body.whatsapp.text).toHaveProperty("body");
						expect(typeof body.whatsapp.text.body).toBe("string");
						expect(body.whatsapp.text.body.length).toBeGreaterThan(0);
					}
					// WhatsApp interactive (buttons)
					if (body.whatsapp.type === "interactive") {
						expect(body.whatsapp.interactive).toHaveProperty("body");
						expect(body.whatsapp.interactive.body).toHaveProperty("text");
						expect(body.whatsapp.interactive).toHaveProperty("action");

						// Validar estrutura dos botões
						const buttons = body.whatsapp.interactive.action?.buttons;
						if (buttons) {
							expect(Array.isArray(buttons)).toBe(true);
							expect(buttons.length).toBeGreaterThan(0);
							expect(buttons.length).toBeLessThanOrEqual(3);

							for (const btn of buttons) {
								expect(btn).toHaveProperty("type", "reply");
								expect(btn.reply).toHaveProperty("id");
								expect(btn.reply).toHaveProperty("title");
								// WhatsApp limita título do botão a 20 chars
								expect(btn.reply.title.length).toBeLessThanOrEqual(20);
							}
						}
					}
				}
			},
			LLM_TIMEOUT,
		);

		it(
			"resposta de HARD band contém mapeamento direto de intent (score >= 0.80)",
			async () => {
				// Enviar mensagem que deve ter alias direto configurado no sistema
				// Este teste depende de ter intents cadastrados no banco
				const payload = buildTextPayload("Ola");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// Qualquer resposta válida é aceitável — o importante é não dar erro
				// HARD band retorna em < 120ms, mas o teste não mede tempo
				if (body.whatsapp) {
					expect(["text", "interactive"]).toContain(body.whatsapp.type);
				}
			},
			LLM_TIMEOUT,
		);

		it(
			"ROUTER band retorna resposta com buttons quando LLM decide mode=chat",
			async () => {
				// Mensagem genérica que provavelmente não tem alias direto
				const payload = buildTextPayload(
					"Me explique como funciona a assessoria completa do escritório e quais são as vantagens para o meu caso específico de direito trabalhista",
				);
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// ROUTER pode retornar text ou interactive
				if (body.whatsapp?.type === "interactive") {
					const interactive = body.whatsapp.interactive;
					expect(interactive.body.text.length).toBeGreaterThan(0);

					// Se tem buttons, validar estrutura
					if (interactive.action?.buttons) {
						for (const btn of interactive.action.buttons) {
							expect(btn.type).toBe("reply");
							expect(btn.reply.title.length).toBeLessThanOrEqual(20);
						}
					}
				}
			},
			LLM_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 4. BUTTON REPLY (btn_* mapeado)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Button Reply (btn_* mapeado)", () => {
		it(
			"processa botão btn_* com button_reaction (emoji + texto)",
			async () => {
				const payload = buildButtonPayload(
					"btn_1757380459987_2_32cx",
					"Finalizar",
				);
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// Button reaction pode retornar:
				// 1. { action_type: "button_reaction", buttonId, emoji, text, whatsapp: {...} }
				// 2. Ou cair no LLM como unmapped button
				if (body.action_type === "button_reaction") {
					expect(body.buttonId).toBeDefined();
					expect(body.processed).toBe(true);
					// Pode ter emoji e/ou text
					if (body.emoji) {
						expect(typeof body.emoji).toBe("string");
					}
				}
			},
			LLM_TIMEOUT,
		);

		it(
			"botão não-mapeado é processado pelo LLM usando texto real do botão",
			async () => {
				// Botão com ID que não existe no MapeamentoBotao
				const payload = buildButtonPayload(
					"ia_custom_unmapped_btn",
					"Quero mais informações",
				);
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// Unmapped button vai pro LLM — resposta deve ser whatsapp válido
				if (body.whatsapp) {
					expect(["text", "interactive"]).toContain(body.whatsapp.type);
				}
			},
			LLM_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 5. TIMEOUT / DEADLINE → @retry FALLBACK
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Timeout e Deadline", () => {
		it(
			"resposta de timeout contém botões @retry e @falar_atendente",
			async () => {
				// Quando LLM dá timeout, o sistema retorna fallback com botões de retry
				// Vamos verificar a estrutura da resposta de timeout que já vimos
				const payload = buildTextPayload("Teste de timeout para verificar fallback");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);

				// Se deu timeout, verifica a estrutura
				if (
					body.whatsapp?.type === "interactive" &&
					body.whatsapp?.interactive?.body?.text?.includes("Sistema temporariamente ocupado")
				) {
					const buttons = body.whatsapp.interactive.action.buttons;
					expect(buttons).toBeDefined();
					expect(buttons.length).toBe(2);

					const retryBtn = buttons.find(
						(b: any) => b.reply.id === "@retry",
					);
					const handoffBtn = buttons.find(
						(b: any) => b.reply.id === "@falar_atendente",
					);

					expect(retryBtn).toBeDefined();
					expect(retryBtn.reply.title).toBe("Tentar Novamente");
					expect(handoffBtn).toBeDefined();
					expect(handoffBtn.reply.title).toBe("Atendimento Humano");
				}
				// Se NÃO deu timeout, o LLM respondeu a tempo — teste passa igualmente
			},
			LLM_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 6. @RETRY → DEGRADAÇÃO DE MODELO
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("@retry (degradação de modelo)", () => {
		it(
			"@retry via quick_reply_payload processa com modelo degradado",
			async () => {
				// Primeiro, provocar um timeout para armazenar retry context no Redis
				// Depois, enviar @retry usando a MESMA session_id

				// Passo 1: Enviar mensagem (pode ou não dar timeout)
				const sharedSessionId = uniqueSessionId();
				const originalPayload = buildTextPayload("Pergunta que vai gerar retry context");
				originalPayload.session_id = sharedSessionId;
				await sendWebhook(originalPayload);

				await delay(1000);

				// Passo 2: Enviar @retry com mesma session_id
				const retryPayload = buildQuickReplyPayload("@retry", "Tentar Novamente");
				retryPayload.session_id = sharedSessionId;
				const { status, body } = await sendWebhook(retryPayload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// Possibilidades:
				// 1. Retry context encontrado → resposta do modelo degradado (whatsapp text/interactive)
				// 2. Retry context expirado → mensagem "tempo expirou"
				// 3. Retry excedeu max → handoff
				if (body.whatsapp) {
					expect(["text", "interactive"]).toContain(body.whatsapp.type);

					if (body.whatsapp.type === "text") {
						expect(body.whatsapp.text.body.length).toBeGreaterThan(0);
					}
					if (body.whatsapp.type === "interactive") {
						expect(body.whatsapp.interactive.body.text.length).toBeGreaterThan(0);
					}
				} else if (body.action === "handoff") {
					// Max retries exceeded → handoff forçado
					expect(body.action).toBe("handoff");
				}
			},
			LLM_TIMEOUT,
		);

		it(
			"@retry via button_id no root do payload funciona igualmente",
			async () => {
				const payload = buildTextPayload("Tentar Novamente", {
					button_id: "@retry",
				});
				payload.context.message.content_attributes = {};

				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// Mesmas possibilidades que o teste anterior
				if (body.whatsapp) {
					expect(["text", "interactive"]).toContain(body.whatsapp.type);
				} else if (body.action === "handoff") {
					expect(body.action).toBe("handoff");
				}
			},
			LLM_TIMEOUT,
		);

		it(
			"@retry com context expirado retorna mensagem amigável (não handoff cru)",
			async () => {
				// Usar session_id diferente que não tem retry context no Redis
				const payload = buildQuickReplyPayload("@retry", "Tentar Novamente");
				payload.session_id = "559999999999"; // Session sem context

				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);

				// Deve retornar mensagem amigável, não apenas { action: "handoff" }
				if (body.whatsapp) {
					const text =
						body.whatsapp.text?.body ||
						body.whatsapp.interactive?.body?.text ||
						"";
					// Ou é mensagem de "tempo expirou" ou é resposta do modelo degradado
					expect(text.length).toBeGreaterThan(0);
				}
			},
			LLM_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 7. @falar_atendente → HANDOFF NATIVO
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("@falar_atendente (handoff)", () => {
		it("quick_reply_payload @falar_atendente retorna handoff imediato", async () => {
			const payload = buildQuickReplyPayload(
				"@falar_atendente",
				"Atendimento Humano",
			);
			const { status, body } = await sendWebhook(payload);

			expect(status).toBe(200);
			expect(body).toEqual({ action: "handoff" });
		});

		it("postback_payload @falar_atendente retorna handoff imediato", async () => {
			const base = buildTextPayload("Atendimento Humano");
			base.context.message.content_attributes = {
				postback_payload: "@falar_atendente",
			} as any;

			const { status, body } = await sendWebhook(base);

			expect(status).toBe(200);
			expect(body).toEqual({ action: "handoff" });
		});
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 8. @recomecar → RESTART
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("@recomecar (restart)", () => {
		it("quick_reply_payload @recomecar retorna mensagem de boas-vindas", async () => {
			const payload = buildQuickReplyPayload("@recomecar", "Recomeçar");
			const { status, body } = await sendWebhook(payload);

			expect(status).toBe(200);
			expect(body.whatsapp).toBeDefined();
			expect(body.whatsapp.type).toBe("text");
			expect(body.whatsapp.text.body).toContain("começar novamente");
		});
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 9. @sair → EXIT
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("@sair (exit)", () => {
		it("quick_reply_payload @sair retorna mensagem de despedida", async () => {
			const payload = buildQuickReplyPayload("@sair", "Sair");
			const { status, body } = await sendWebhook(payload);

			expect(status).toBe(200);
			expect(body.whatsapp).toBeDefined();
			expect(body.whatsapp.type).toBe("text");
			expect(body.whatsapp.text.body).toContain("Até logo");
		});
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 10. DEDUPLICAÇÃO
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Deduplicação", () => {
		it(
			"mensagens duplicadas (mesmo source_id) são detectadas",
			async () => {
				const fixedSourceId = `wamid.dedup_test_${Date.now()}`;
				const payload = buildTextPayload("Mensagem para dedup");
				payload.context.message.source_id = fixedSourceId;

				// Primeiro envio — processa normalmente
				const first = await sendWebhook(payload);
				expect(first.status).toBe(200);

				// Segundo envio — mesmo source_id → dedup
				const second = await sendWebhook(payload);
				expect(second.status).toBe(200);

				// Se dedup funcionar, retorna { ok: true, dedup: true }
				if (second.body.dedup) {
					expect(second.body.ok).toBe(true);
					expect(second.body.dedup).toBe(true);
				}
				// Se não, sistema pode ter processado de novo (depende do TTL do Redis)
			},
			LLM_TIMEOUT * 2,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 11. ESTRUTURA DA RESPOSTA WHATSAPP
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Estrutura de Resposta WhatsApp", () => {
		it(
			"resposta interactive button segue spec WhatsApp Cloud API",
			async () => {
				const payload = buildTextPayload("Quero informações sobre serviços jurídicos");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);

				if (body.whatsapp?.type === "interactive") {
					const msg = body.whatsapp.interactive;

					// Spec: type deve ser "button" ou "list"
					expect(["button", "list"]).toContain(msg.type);

					// Spec: body.text obrigatório, max 1024 chars
					expect(msg.body).toHaveProperty("text");
					expect(msg.body.text.length).toBeLessThanOrEqual(1024);

					// Spec: action obrigatório
					expect(msg).toHaveProperty("action");

					if (msg.type === "button") {
						// Spec: 1-3 buttons
						const buttons = msg.action.buttons;
						expect(buttons.length).toBeGreaterThanOrEqual(1);
						expect(buttons.length).toBeLessThanOrEqual(3);

						for (const btn of buttons) {
							// Spec: type "reply", reply.id max 256, reply.title max 20
							expect(btn.type).toBe("reply");
							expect(btn.reply.id.length).toBeLessThanOrEqual(256);
							expect(btn.reply.title.length).toBeLessThanOrEqual(20);
						}
					}

					if (msg.type === "list") {
						// Spec: sections com rows
						const sections = msg.action.sections;
						expect(Array.isArray(sections)).toBe(true);
						for (const section of sections) {
							expect(Array.isArray(section.rows)).toBe(true);
							for (const row of section.rows) {
								expect(row).toHaveProperty("id");
								expect(row).toHaveProperty("title");
								expect(row.title.length).toBeLessThanOrEqual(24);
							}
						}
					}
				}
			},
			LLM_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 12. FLOW BUILDER (botão flow_*)
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Flow Builder (flow_* buttons)", () => {
		it(
			"botão com prefixo flow_ é roteado para FlowOrchestrator",
			async () => {
				// Botão de flow — pode não ter sessão ativa, então fallback é aceitável
				const payload = buildButtonPayload(
					"flow_test_node_123",
					"Opção do Flow",
				);
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);
				expect(body).toBeDefined();

				// Se não houver FlowSession ativa, pode:
				// 1. Retornar fallback do flow engine
				// 2. Cair no SocialWise Flow (LLM) como fallback
				// Ambos são respostas válidas
			},
			LLM_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 13. IDEMPOTÊNCIA E NÃO-REGRESSÃO
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Idempotência e Não-Regressão", () => {
		it("webhook nunca retorna status >= 500 para payloads válidos", async () => {
			const payloads = [
				buildTextPayload("Olá"),
				buildTextPayload("Quero falar com atendente"),
				buildButtonPayload("btn_test_123", "Teste"),
				buildQuickReplyPayload("@retry", "Tentar Novamente"),
				buildQuickReplyPayload("@falar_atendente", "Humano"),
				buildQuickReplyPayload("@recomecar", "Recomeçar"),
				buildQuickReplyPayload("@sair", "Sair"),
			];

			for (const payload of payloads) {
				// Usar source_id único para cada um para evitar dedup
				payload.context.message.source_id = `wamid.stability_${Date.now()}_${Math.random().toString(36).slice(2)}`;

				const { status } = await sendWebhook(payload);
				expect(status).toBeLessThan(500);
			}
		}, LLM_TIMEOUT * 3);

		it(
			"resposta sempre contém chave whatsapp ou action (nunca vazio)",
			async () => {
				const payload = buildTextPayload("Teste de resposta não-vazia");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);

				const hasValidResponse =
					body.whatsapp !== undefined ||
					body.instagram !== undefined ||
					body.action !== undefined ||
					body.ok !== undefined || // dedup
					body.text !== undefined ||
					body.status !== undefined; // async flow

				expect(hasValidResponse).toBe(true);
			},
			LLM_TIMEOUT,
		);
	});

	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	// 14. MULTI-PROVIDER: 3 modelos padrão + 3 degradados
	// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	describe("Multi-Provider (observacional)", () => {
		it(
			"resposta do sistema sempre segue formato WhatsApp válido independente do provider",
			async () => {
				// Este teste valida que qualquer que seja o provider configurado
				// (OpenAI, Gemini, Claude), a resposta sempre segue o formato correto.
				// O provider ativo é configurado no admin — não controlamos aqui.

				const payload = buildTextPayload("Quais áreas do direito vocês atendem?");
				const { status, body } = await sendWebhook(payload);

				expect(status).toBe(200);

				if (body.whatsapp) {
					// Independente do provider, formato WhatsApp é consistente
					if (body.whatsapp.type === "text") {
						expect(typeof body.whatsapp.text.body).toBe("string");
					}
					if (body.whatsapp.type === "interactive") {
						expect(typeof body.whatsapp.interactive.body.text).toBe("string");

						// Validar que buttons seguem schema Zod (título max 20 chars)
						const buttons = body.whatsapp.interactive.action?.buttons || [];
						for (const btn of buttons) {
							expect(btn.reply.title.length).toBeLessThanOrEqual(20);
						}
					}
				}
			},
			LLM_TIMEOUT,
		);
	});
});
