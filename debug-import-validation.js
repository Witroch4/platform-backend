const fs = require("fs");
const path = require("path");

// Lê o arquivo JSON que está sendo importado
const jsonPath = path.join(
	__dirname,
	"components",
	"interactive-messages_cmet9venv000hl92r1wwbxyoe_2025-09-08-23-43-07.json",
);
const importData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

console.log("=== ARQUIVO JSON ORIGINAL ===");
console.log(JSON.stringify(importData, null, 2));

// Simula a função normalizeImportedMessage
const normalizeImportedMessage = (m) => {
	const header = m.header || m.content?.header;
	const body = m.body || m.content?.body;
	const footer = m.footer || m.content?.footer;
	const action = m.action || m.content?.action;
	const type = m.type || m.content?.type || (action?.buttons ? "button" : "text");

	return {
		name: m.name || m.nome || "",
		type,
		header: header
			? {
					type: header.type,
					content: header.text || header.content || header.media_url || "",
					media_url: header.media_url,
				}
			: undefined,
		body: { text: body?.text || "" },
		footer: footer ? { text: footer.text || "" } : undefined,
		action: action ? { ...action } : undefined,
	};
};

console.log("\n=== MENSAGENS NORMALIZADAS ===");
const normalizedMessages = importData.messages.map((m) => {
	const normalized = normalizeImportedMessage(m);
	console.log("\n--- Mensagem:", normalized.name, "---");
	console.log(JSON.stringify(normalized, null, 2));
	return normalized;
});

// Simula o que seria enviado para a API
console.log("\n=== PAYLOAD PARA API ===");
const payloadExample = {
	inboxId: importData.inboxId,
	message: normalizedMessages[0],
	reactions: [], // No JSON não há reações definidas
};

console.log(JSON.stringify(payloadExample, null, 2));

// Verifica campos obrigatórios baseado no schema da API
console.log("\n=== VALIDAÇÃO DOS CAMPOS ===");
normalizedMessages.forEach((msg, idx) => {
	console.log(`\nMensagem ${idx + 1}: ${msg.name}`);

	// Verifica campos obrigatórios
	if (!msg.name || msg.name.length === 0) {
		console.log("❌ name: vazio ou ausente");
	} else {
		console.log("✅ name: OK");
	}

	if (!msg.type) {
		console.log("❌ type: ausente");
	} else {
		console.log(`✅ type: ${msg.type}`);
	}

	if (!msg.body?.text || msg.body.text.length === 0) {
		console.log("❌ body.text: vazio ou ausente");
	} else {
		console.log(`✅ body.text: ${msg.body.text.length} caracteres`);
	}

	// Verifica header se presente
	if (msg.header) {
		if (!msg.header.type) {
			console.log("❌ header.type: ausente");
		} else {
			console.log(`✅ header.type: ${msg.header.type}`);
		}

		if (msg.header.type !== "text" && !msg.header.content && !msg.header.media_url) {
			console.log("❌ header: mídia sem URL");
		}
	}

	// Verifica footer se presente
	if (msg.footer && (!msg.footer.text || msg.footer.text.length > 60)) {
		console.log(`❌ footer.text: ${msg.footer.text?.length || 0} caracteres (máximo 60)`);
	} else if (msg.footer) {
		console.log("✅ footer.text: OK");
	}

	// Verifica action se presente
	if (msg.action) {
		if (msg.action.buttons && Array.isArray(msg.action.buttons)) {
			console.log(`✅ action.buttons: ${msg.action.buttons.length} botões`);
			msg.action.buttons.forEach((btn, btnIdx) => {
				if (!btn.id) {
					console.log(`❌ button[${btnIdx}].id: ausente`);
				}
				if (!btn.title) {
					console.log(`❌ button[${btnIdx}].title: ausente`);
				}
			});
		}
	}
});
