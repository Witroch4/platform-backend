const lote1 = "R$ 297,90"; // Assuming this should be 'lote1'
const analise = "R$ 27,90";
const lote2 = "R$ 287,90"; // This was the second declaration, now unique
const comecoLote1 = "13/03/2025 as 15:00";
const comecoLote2 = "13/03/2025 as 15:00";
const fim = "sábado as 5:00 da tarde";
const token =
	"EAAGIBII4GXQBO2qgvJ2jdcUmgkdqBo5bUKEanJWmCLpcZAsq0Ovpm4JNlrNLeZAv3OYNrdCqqQBAHfEfPFD0FPnZAOQJURB9GKcbjXeDpa83XdAsa3i6fTr23lBFM2LwUZC23xXrZAnB8QjCCFZBxrxlBvzPj8LsejvUjz0C04Q8Jsl8nTGHUd4ZBRPc4NiHFnc";
// Mantive a variável pix original, mas usarei o CNPJ no template, conforme seu log.
const pix = "57944155000101";
const pixCnpj = "57944155000101"; // CNPJ do seu log

const axios = require("axios");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// ATENÇÃO: O log indica v22.0, mas seu código original usa v18.0.
// É importante usar a mesma versão em todo o código para consistência.
// Se o erro persistir, tente alinhar todas as URLs para a mesma versão.
// Recommendation: Consider updating to v22.0 if your project supports it and it's stable.
const urlwhatsapp = "https://graph.facebook.com/v18.0/274633962398273/messages";
const configwhatsapp = {
	headers: {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	},
};

admin.initializeApp({
	databaseURL: "https://amandaoab-kiom-default-rtdb.firebaseio.com/",
});

exports.funcaoDialogflow = onRequest(async (req, res) => {
	try {
		console.log("Dialogflow Request body:", JSON.stringify(req.body));
		const intentName = req.body.queryResult.intent.displayName;
		const session = req.body.session;
		const witMASTER = session.split("/").pop().replace(/\D/g, "");

		if (intentName === "oab") {
			await oab(req, res, witMASTER);
		} else if (intentName === "atendimentohumano") {
			await atendimentohumano(req, res, witMASTER);
		} else if (intentName === "oab - pix") {
			// O nome da intenção foi mantido para corresponder ao Dialogflow
			await oabPix(req, res, witMASTER);
		} else {
			console.log(`Intenção desconhecida: ${intentName}`);
			res.sendStatus(200);
		}
	} catch (error) {
		console.error("Erro no fulfillment:", error);
		res.sendStatus(500);
	}
});

function sanitizeKey(key) {
	return key.replace(/[.#$[\]]/g, "_");
}

async function oab(req, res, witMASTER) {
	const parameters = req.body.queryResult.parameters;
	// It's safer to use optional chaining or a null check for nested properties.
	// Example: const nome = parameters?.person?.name || 'Cliente';
	const nome = parameters["person"] ? parameters["person"]["name"] : "Cliente"; // Added a fallback for 'nome'
	const sanitizedNumber = sanitizeKey(witMASTER);

	try {
		await admin.database().ref(`OAB_Leeds/${sanitizedNumber}`).set({
			nome: nome,
			numero: witMASTER,
		});
		console.log(`Dados salvos no banco para o usuário ${nome}`);
		// Corrected `lote1` to `lote2` or define `lote1`
		const messageText = `Últimas Vagas Lote 2- Sr(a) *${nome}*,\nPara a análise de pontos, cobro *${analise}*.\nEscolha a opção que melhor se encaixa:\n- Segundo Lote: Valor ${lote1} (Até 11/08 ou até acabar as vagas).\n\nO valor pago na análise será deduzido do total.\nEnvie o comprovante de pagamento para a chave Pix: CNPJ: ${pixCnpj}.\nEnvie a prova e o espelho (NÃO envie login e senha).\nObrigado. Escolha uma opção:`;
		const data = {
			messaging_product: "whatsapp",
			to: witMASTER,
			type: "interactive",
			interactive: {
				type: "button",
				header: {
					type: "image",
					image: { link: "https://amandasousaprev.adv.br/wp-content/uploads/2024/10/AmandaFOTO.jpg" },
				},
				body: { text: messageText },
				footer: { text: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" },
				action: {
					buttons: [
						{ type: "reply", reply: { id: "id_enviar_prova", title: "Enviar a Prova" } },
						{ type: "reply", reply: { id: "id_qual_pix", title: "Copiar o PIX?" } },
						{ type: "reply", reply: { id: "id_finalizar", title: "Foi Engano." } },
					],
				},
			},
		};
		await axios.post(urlwhatsapp, data, configwhatsapp);
		console.log("Mensagem interativa enviada com sucesso.");
		res.sendStatus(200);
	} catch (error) {
		console.error("Erro ao salvar no banco ou enviar mensagem:", error);
		res.sendStatus(500);
	}
}

async function atendimentohumano(req, res, witMASTER) {
	const data = {
		messaging_product: "whatsapp",
		to: witMASTER,
		type: "interactive",
		interactive: {
			type: "button",
			header: {
				type: "image",
				image: { link: "https://amandasousaprev.adv.br/wp-content/uploads/2024/10/AmandaFOTO.jpg" },
			},
			body: { text: "*Agradecemos por entrar em contato com o Escritório Dra. Amanda Sousa.*\n*MENU de atendimento*" },
			footer: { text: "Dra. Amanda Sousa Advocacia e Consultoria Jurídica™" },
			action: {
				buttons: [
					{ type: "reply", reply: { id: "id02", title: "Atendimento Humano" } },
					{ type: "reply", reply: { id: "id03", title: "OAB" } },
					{ type: "reply", reply: { id: "id11", title: "Não Quero" } },
				],
			},
		},
	};

	try {
		await axios.post(urlwhatsapp, data, configwhatsapp);
		console.log("Mensagem enviada com sucesso.");
		res.sendStatus(200);
	} catch (error) {
		console.error("Erro ao enviar mensagem:", error);
		res.sendStatus(500);
	}
}

async function oabPix(req, res, witMASTER) {
	const data = {
		messaging_product: "whatsapp",
		to: witMASTER,
		type: "template",
		template: {
			name: "pix",
			language: {
				code: "pt_BR",
			},
			components: [
				{
					type: "header",
					parameters: [
						{
							type: "image",
							image: {
								link: "https://amandasousaprev.adv.br/wp-content/uploads/2024/10/AmandaFOTO.jpg",
							},
						},
					],
				},
				{
					type: "body",
				},
				{
					type: "button",
					sub_type: "copy_code",
					index: "0",
					parameters: [
						{
							type: "coupon_code",
							coupon_code: pixCnpj,
						},
					],
				},
			],
		},
	};

	try {
		console.log('Enviando MENSAGEM DE TEMPLATE "pix":', JSON.stringify(data));
		await axios.post(urlwhatsapp, data, configwhatsapp);
		console.log('Template "pix" enviado com sucesso.');
		res.sendStatus(200);
	} catch (error) {
		if (error.response) {
			console.error("Erro ao enviar template:", JSON.stringify(error.response.data));
		} else {
			console.error("Erro na requisição para enviar template:", error.message);
		}
		res.sendStatus(500);
	}
}
