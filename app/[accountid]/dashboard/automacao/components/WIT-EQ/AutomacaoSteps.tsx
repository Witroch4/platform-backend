"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PreviewPhoneMockup from "../PreviewPhoneMockup";
import { useParams } from "next/navigation";

interface InstagramUserData {
	id: string;
	username: string;
	media_count: number;
	profile_picture_url?: string;
}

export interface InstagramMediaItem {
	id: string;
	caption?: string;
	media_url?: string;
	media_type?: string;
	thumbnail_url?: string;
	media_product_type?: string;
	like_count?: number;
	comments_count?: number;
}

type ToggleValue = "publicar" | "comentarios" | "dm";

interface OutrosRecursosState {
	responderPublico: boolean;
	pedirEmailPro: boolean;
	pedirParaSeguirPro: boolean;
	contatoSemClique: boolean;
}

interface AutomacaoStepsProps {
	instagramUser: InstagramUserData | null;
	selectedPost: InstagramMediaItem | null;
}

export default function AutomacaoSteps({ instagramUser, selectedPost }: AutomacaoStepsProps) {
	const params = useParams<{ accountid: string }>();
	const providerAccountId = params?.accountid;

	if (!providerAccountId) {
		throw new Error("providerAccountId é obrigatório");
	}

	// Controla a etapa atual
	const [step, setStep] = useState(1);

	// Estado para definir se uma postagem específica foi selecionada ou se é "qualquer"
	const [anyMediaSelected, setAnyMediaSelected] = useState(false);

	// Substitui o antigo selectedOptionPalavra (string) por um estado booleano:
	// anyWord = true  -> "qualquer palavra"
	// anyWord = false -> "uma palavra ou expressão específica"
	const [anyWord, setAnyWord] = useState(false);
	const [palavrasChave, setPalavrasChave] = useState("");

	// --------------- ETAPA 2 --------------- //
	const [bemVindoTitulo] = useState("Inicialmente, eles receberão uma DM de boas-vindas");
	const [bemVindoSubtitulo] = useState("Primeiro, é enviada a DM de abertura, seguida pela mensagem com o link.");

	// Frase de boas-vindas que aparece no preview
	const [fraseBoasVindas, setFraseBoasVindas] = useState(
		"Olá! Eu estou muito feliz que você está aqui, muito obrigado pelo seu interesse 😊\n\nClique abaixo e eu vou te mandar o link em um segundo ✨",
	);

	// Texto do quick reply, p. ex.: "Me envie o link"
	const [quickReplyTexto, setQuickReplyTexto] = useState("Me envie o link");

	// --------------- ETAPA 3 --------------- //
	const [tituloEtapa3] = useState("Logo depois, a DM com o link será enviada");
	const [mensagemEtapa3, setMensagemEtapa3] = useState("Obrigado por ter respondido segue o nosso link do produto");
	const [linkEtapa3, setLinkEtapa3] = useState("https://witdev.com.br");
	const [legendaBotaoEtapa3, setLegendaBotaoEtapa3] = useState("Segue Nosso Site");

	// --------------- ETAPA 4 --------------- //
	const [outrosRecursos, setOutrosRecursos] = useState<OutrosRecursosState>({
		responderPublico: false,
		pedirEmailPro: false,
		pedirParaSeguirPro: false,
		contatoSemClique: false,
	});

	// FUNÇÃO PRINCIPAL PARA SALVAR A AUTOMACAO
	async function salvarAutomacao() {
		try {
			const payload = {
				// Etapa 1
				selectedMediaId: anyMediaSelected ? null : selectedPost?.id || null,
				anyMediaSelected: anyMediaSelected,
				anyword: anyWord,
				palavrasChave: anyWord ? null : palavrasChave,
				// Etapa 2
				fraseBoasVindas,
				quickReplyTexto,
				// Etapa 3
				mensagemEtapa3,
				linkEtapa3,
				legendaBotaoEtapa3,
				// Etapa 4
				responderPublico: outrosRecursos.responderPublico,
				pedirEmailPro: outrosRecursos.pedirEmailPro,
				pedirParaSeguirPro: outrosRecursos.pedirParaSeguirPro,
				contatoSemClique: outrosRecursos.contatoSemClique,
				// Adicionar providerAccountId
				providerAccountId,
			};

			const res = await fetch(`/api/automacao?providerAccountId=${providerAccountId}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const errData = await res.json();
				throw new Error(errData.error || "Erro ao salvar automação.");
			}

			const data = await res.json();
			console.log("Automação salva com sucesso:", data);
			alert("Automação configurada e salva!");
		} catch (error: any) {
			console.error("Erro ao salvar automação:", error.message);
			alert("Falha ao salvar automação: " + error.message);
		}
	}

	// Estado para controlar a visualização do preview (toggle)
	const [toggleValue, setToggleValue] = useState<ToggleValue>("dm");
	const [commentContent, setCommentContent] = useState("");

	// --------------- FUNÇÕES DE VALIDAÇÃO --------------- //
	const canGoNextStep = (): boolean => {
		switch (step) {
			case 1:
				// Se for "uma palavra específica", exige que o usuário preencha as palavras
				if (!anyWord) {
					return palavrasChave.trim().length > 0;
				}
				return true;
			case 2:
				return fraseBoasVindas.trim().length > 0 && quickReplyTexto.trim().length > 0;
			case 3:
				return mensagemEtapa3.trim().length > 0 && linkEtapa3.trim().length > 0 && legendaBotaoEtapa3.trim().length > 0;
			case 4:
				return true;
			default:
				return true;
		}
	};

	const handleNext = () => {
		if (canGoNextStep()) {
			setStep((prev) => prev + 1);
		} else {
			alert("Preencha todos os campos obrigatórios antes de prosseguir!");
		}
	};

	const handleFinalizar = () => {
		alert("Automação finalizada!");
	};

	const handleCheckboxChange = (field: keyof OutrosRecursosState) => {
		setOutrosRecursos((prev) => ({
			...prev,
			[field]: !prev[field],
		}));
	};

	// --------------- RENDERIZAÇÃO DAS ETAPAS --------------- //
	const renderStep1 = () => {
		return (
			<div style={{ padding: 16, border: "1px solid #444", borderRadius: 8, marginBottom: 16 }}>
				<h2>Etapa 1</h2>
				<p>E esse comentário possui:</p>
				<label style={{ display: "block", marginBottom: 8 }}>
					<input
						type="radio"
						name="palavraOuQualquer"
						value="especifica"
						checked={!anyWord}
						onChange={() => setAnyWord(false)}
					/>
					&nbsp; Uma palavra ou expressão específica
				</label>
				{!anyWord && (
					<div style={{ marginLeft: 24, marginBottom: 8 }}>
						<p>Use vírgulas para separar as palavras (por exemplo: Preço, Link, Comprar)</p>
						<input
							type="text"
							placeholder="Digite suas palavras-chave separadas por vírgula"
							value={palavrasChave}
							onChange={(e) => setPalavrasChave(e.target.value)}
							style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #ccc" }}
						/>
					</div>
				)}
				<label style={{ display: "block", marginTop: 8 }}>
					<input
						type="radio"
						name="palavraOuQualquer"
						value="qualquer"
						checked={anyWord}
						onChange={() => setAnyWord(true)}
					/>
					&nbsp; Qualquer palavra
				</label>
			</div>
		);
	};

	const renderStep2 = () => {
		return (
			<div style={{ padding: 16, border: "1px solid #444", borderRadius: 8, marginBottom: 16 }}>
				<h2>Etapa 2</h2>
				<h3>{bemVindoTitulo}</h3>
				<p>{bemVindoSubtitulo}</p>
				<label style={{ display: "block", margin: "12px 0 4px" }}>Frase de boas-vindas</label>
				<textarea
					rows={4}
					value={fraseBoasVindas}
					onChange={(e) => setFraseBoasVindas(e.target.value)}
					style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #ccc" }}
				/>
				<label style={{ display: "block", margin: "12px 0 4px" }}>Quick Reply (ex.: "Me envie o link")</label>
				<input
					type="text"
					value={quickReplyTexto}
					onChange={(e) => setQuickReplyTexto(e.target.value)}
					style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #ccc" }}
				/>
			</div>
		);
	};

	const renderStep3 = () => {
		return (
			<div style={{ padding: 16, border: "1px solid #444", borderRadius: 8, marginBottom: 16 }}>
				<h2>Etapa 3</h2>
				<h3>{tituloEtapa3}</h3>
				<label style={{ display: "block", margin: "12px 0 4px" }}>Escreva uma mensagem</label>
				<textarea
					rows={3}
					style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #ccc" }}
					placeholder="Exemplo: Obrigado por ter respondido, segue o nosso link do produto"
					value={mensagemEtapa3}
					onChange={(e) => setMensagemEtapa3(e.target.value)}
				/>
				<label style={{ display: "block", margin: "12px 0 4px" }}>Adicionar um link</label>
				<input
					type="url"
					style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #ccc" }}
					placeholder="Exemplo: https://witdev.com.br"
					value={linkEtapa3}
					onChange={(e) => setLinkEtapa3(e.target.value)}
				/>
				<label style={{ display: "block", margin: "12px 0 4px" }}>
					Adicione legenda ao botão (exemplo: Nosso Produto)
				</label>
				<input
					type="text"
					style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid #ccc" }}
					placeholder="Exemplo: Segue Nosso Site"
					value={legendaBotaoEtapa3}
					onChange={(e) => setLegendaBotaoEtapa3(e.target.value)}
				/>
			</div>
		);
	};

	const renderStep4 = () => {
		return (
			<div style={{ padding: 16, border: "1px solid #444", borderRadius: 8, marginBottom: 16 }}>
				<h2>Etapa 4</h2>
				<p>Outros recursos para automatizar:</p>
				<label style={{ display: "block", marginBottom: 8 }}>
					<input
						type="checkbox"
						checked={outrosRecursos.responderPublico}
						onChange={() => handleCheckboxChange("responderPublico")}
					/>
					&nbsp; Responder ao comentário de forma pública
				</label>
				<label style={{ display: "block", marginBottom: 8 }}>
					<input
						type="checkbox"
						checked={outrosRecursos.pedirEmailPro}
						onChange={() => handleCheckboxChange("pedirEmailPro")}
					/>
					&nbsp; Pedir email <strong>(PRO)</strong>
				</label>
				<label style={{ display: "block", marginBottom: 8 }}>
					<input
						type="checkbox"
						checked={outrosRecursos.pedirParaSeguirPro}
						onChange={() => handleCheckboxChange("pedirParaSeguirPro")}
					/>
					&nbsp; Pedir para seguir antes de enviar o link <strong>(PRO)</strong>
				</label>
				<label style={{ display: "block", marginBottom: 8 }}>
					<input
						type="checkbox"
						checked={outrosRecursos.contatoSemClique}
						onChange={() => handleCheckboxChange("contatoSemClique")}
					/>
					&nbsp; Entrar em contato caso não cliquem no link
				</label>
			</div>
		);
	};

	const renderCurrentStep = () => {
		switch (step) {
			case 1:
				return renderStep1();
			case 2:
				return renderStep2();
			case 3:
				return renderStep3();
			case 4:
				return renderStep4();
			default:
				return (
					<div style={{ textAlign: "center", padding: 16 }}>
						<h2>Formulário concluído!</h2>
						<p>Suas automações foram configuradas com sucesso.</p>
					</div>
				);
		}
	};

	const getCommentContent = () => {
		if (!anyWord) {
			return palavrasChave;
		} else {
			return "qualquer";
		}
	};

	return (
		<div style={{ display: "flex", gap: 20 }}>
			{/* COLUNA ESQUERDA: FORMULÁRIO DE VÁRIAS ETAPAS */}
			<div style={{ flex: 1 }}>
				{renderCurrentStep()}
				{step <= 4 ? (
					<Button variant="outline" onClick={handleNext} style={{ marginTop: 8 }}>
						Próximo
					</Button>
				) : (
					<Button variant="default" onClick={handleFinalizar} style={{ marginTop: 8 }}>
						Concluir
					</Button>
				)}
				<Button variant="outline" onClick={salvarAutomacao} style={{ marginTop: 8 }}>
					Salvar Automação
				</Button>
			</div>

			{/* COLUNA DIREITA: PREVIEW */}
			<div style={{ flex: 1, position: "relative" }}>
				<h3 style={{ marginBottom: 10 }}>Preview (Simulação)</h3>
				<PreviewPhoneMockup
					selectedPost={selectedPost}
					instagramUser={instagramUser}
					toggleValue={toggleValue}
					commentContent={getCommentContent()}
					dmWelcomeMessage={fraseBoasVindas}
					dmQuickReply={quickReplyTexto}
					dmSecondMessage={mensagemEtapa3}
					dmLink={linkEtapa3}
					dmButtonLabel={legendaBotaoEtapa3}
				/>
				<div style={{ marginTop: 16, display: "flex", gap: 8 }}>
					<Button variant="outline" onClick={() => setToggleValue("publicar")}>
						Publicar
					</Button>
					<Button variant="outline" onClick={() => setToggleValue("comentarios")}>
						Comentários
					</Button>
					<Button variant="outline" onClick={() => setToggleValue("dm")}>
						DM
					</Button>
				</div>
			</div>
		</div>
	);
}
