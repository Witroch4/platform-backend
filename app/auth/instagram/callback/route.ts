// app/auth/instagram/callback/route.ts
import { NextResponse } from "next/server";
import { auth, update } from "@/auth";
import { getPrismaInstance } from "@/lib/connections";
const prisma = getPrismaInstance();

export const runtime = "nodejs";

export async function GET(request: Request) {
	try {
		const url = new URL(request.url);
		const code = url.searchParams.get("code");
		if (!code) {
			console.error("Nenhum code fornecido na query string.");
			return new NextResponse("Faltando code", { status: 400 });
		}

		console.log(`Code recebido: ${code}`);

		// Captura as variáveis de ambiente
		const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID!;
		const clientSecret = process.env.INSTAGRAM_APP_SECRET!;
		const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI!;
		const nextAuthUrl = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI!;

		// Logs para depuração
		console.log("=== VARIÁVEIS DE AMBIENTE DEBUG ===");
		console.log(`NEXT_PUBLIC_INSTAGRAM_APP_ID: ${clientId}`);
		console.log(`INSTAGRAM_APP_SECRET: ${clientSecret ? "Configurado (valor oculto)" : "Não configurado"}`);
		console.log(`NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI: ${redirectUri}`);
		console.log(`NEXTAUTH_URL: ${nextAuthUrl || "Não configurado"}`);
		console.log("==================================");
		console.log(`redirectUri atual: ${redirectUri}`);

		// Troca do código pelo token curto
		const tokenResp = await fetch("https://api.instagram.com/oauth/access_token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: "authorization_code",
				redirect_uri: redirectUri,
				code,
			}),
		});

		if (!tokenResp.ok) {
			const errorText = await tokenResp.text();
			console.error("Erro ao obter token curto prazo:", errorText);
			return new NextResponse("Erro token curto prazo", { status: 500 });
		}

		const tokenRespText = await tokenResp.text();
		// Corrige a resposta para que user_id seja uma string
		const fixedRespText = tokenRespText.replace(/"user_id":\s*(\d+)/, '"user_id":"$1"');

		const shortTokenData = JSON.parse(fixedRespText) as {
			access_token: string;
			user_id: string;
		};

		const shortLivedToken = shortTokenData.access_token;
		console.log(`Token curto prazo (PARCIAL): ${shortLivedToken.slice(0, 3)}...`);
		console.log("User ID app-scoped:", shortTokenData.user_id);

		// Troca pelo token longo usando o método que funcionou corretamente
		console.log("Iniciando processo de troca por token longo...");
		console.log("Usando técnica de troca de token via Graph API");

		// Método 1: Usando a API do Instagram Graph para troca de token
		const exchangeUrl = new URL("https://graph.instagram.com/access_token");
		exchangeUrl.search = new URLSearchParams({
			grant_type: "ig_exchange_token",
			client_secret: clientSecret,
			access_token: shortLivedToken,
		}).toString();

		const longTokenResp = await fetch(exchangeUrl.toString());

		if (!longTokenResp.ok) {
			const errorText = await longTokenResp.text();
			console.error("Erro ao obter token longo prazo:", errorText);
			return new NextResponse("Erro ao obter token de longa duração", { status: 500 });
		}

		const respText = await longTokenResp.text();
		console.log(`Resposta da troca de token: ${respText}`);

		const longTokenData = JSON.parse(respText) as {
			access_token: string;
			token_type: string;
			expires_in: number;
		};

		const finalToken = longTokenData.access_token;
		const expiresAt = Math.floor(Date.now() / 1000) + longTokenData.expires_in;
		console.log(`Token longo prazo (PARCIAL): ${finalToken.slice(0, 3)}...`);
		console.log(
			`Token expira em: ${longTokenData.expires_in} segundos (aproximadamente ${Math.floor(longTokenData.expires_in / 86400)} dias)`,
		);

		// Verifica se o usuário está autenticado
		const session = await auth();
		if (!session?.user) {
			console.error("Usuário não autenticado.");
			return new NextResponse("Usuário não autenticado", { status: 401 });
		}

		const userId = session.user.id;
		console.log(`Usuário logado (ID interno): ${userId}`);

		// Busca dados adicionais do Instagram
		const meUrl = `https://graph.instagram.com/me?fields=id,username,media_count,account_type,user_id&access_token=${finalToken}`;
		const meResp = await fetch(meUrl);

		let igBusinessId: string | null = null;
		let username: string | null = null;

		if (!meResp.ok) {
			const errorText = await meResp.text();
			console.error("Erro ao buscar /me:", errorText);
		} else {
			const meData = (await meResp.json()) as {
				id: string;
				username: string;
				account_type: string;
				user_id?: string;
			};
			console.log("meData:", meData);
			username = meData.username || null;
			if (meData.user_id) {
				igBusinessId = meData.user_id;
				console.log(`Conta BUSINESS ID (user_id) = ${igBusinessId}`);
			}
		}

		// Procura uma conta já cadastrada com o mesmo providerAccountId
		const existingAccountWithSameId = await prisma.account.findFirst({
			where: {
				providerAccountId: shortTokenData.user_id,
				provider: "instagram",
			},
		});

		const userIgAccounts = await prisma.account.findMany({
			where: {
				userId,
				provider: "instagram",
			},
		});

		let accountToUse;

		if (existingAccountWithSameId) {
			if (existingAccountWithSameId.userId !== userId) {
				console.log("Esta conta do Instagram já está conectada a outro usuário.");
				const baseUrl = process.env.NEXTAUTH_URL || "https://chatwit-social.witdev.com.br";
				return NextResponse.redirect(`${baseUrl}/registro/redesocial?error=account_already_connected`);
			}
			accountToUse = await prisma.account.update({
				where: { id: existingAccountWithSameId.id },
				data: {
					access_token: finalToken,
					expires_at: expiresAt,
					token_type: longTokenData.token_type,
					scope:
						"instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish",
					igUserId: igBusinessId ?? undefined,
					igUsername: username ?? undefined,
				},
			});
			console.log("Conta Instagram atualizada (mesmo providerAccountId).");
		} else {
			const isFirstInstagramAccount = userIgAccounts.length === 0;
			const newAccount = await prisma.account.create({
				data: {
					userId,
					provider: "instagram",
					type: "oauth",
					providerAccountId: shortTokenData.user_id,
					access_token: finalToken,
					expires_at: expiresAt,
					token_type: longTokenData.token_type,
					scope:
						"instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish",
					igUserId: igBusinessId,
					igUsername: username,
					isMain: isFirstInstagramAccount,
				},
			});
			console.log("Nova conta Instagram criada.");
			accountToUse = newAccount;
		}

		// Atualiza o token na sessão do usuário
		await update({
			user: {
				instagramAccessToken: finalToken,
				providerAccountId: shortTokenData.user_id,
			},
		});

		if (accountToUse) {
			const baseUrl = process.env.NEXTAUTH_URL || "https://chatwit-social.witdev.com.br";
			console.log(`Redirecionando para /gestao-social/${accountToUse.providerAccountId}/dashboard`);
			return NextResponse.redirect(`${baseUrl}/gestao-social/${accountToUse.providerAccountId}/dashboard`);
		} else {
			const baseUrl = process.env.NEXTAUTH_URL || "https://chatwit-social.witdev.com.br";
			console.log("Nenhuma conta encontrada, redirecionando para /registro/redesocial");
			return NextResponse.redirect(`${baseUrl}/registro/redesocial`);
		}
	} catch (err) {
		console.error("Erro no callback do Instagram:", err);
		return new NextResponse("Erro interno", { status: 500 });
	}
}
