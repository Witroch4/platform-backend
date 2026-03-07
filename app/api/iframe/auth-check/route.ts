import { NextRequest, NextResponse } from "next/server";
import { getPrismaInstance } from "@/lib/connections";

interface AuthorizedDomain {
	id: string;
	domain: string;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const { referrer } = await request.json();

		if (!referrer) {
			return NextResponse.json({ authorized: false, error: "Referrer não encontrado" }, { status: 400 });
		}

		const prisma = getPrismaInstance();

		// URLs padrão autorizadas (incluindo a URL do Chatwit)
		const defaultAuthorizedDomains = [
			"https://chatwit.witdev.com.br",
			"http://localhost:3000", // Para desenvolvimento
			"https://localhost:3000",
		];

		// Buscar domínios autorizados no banco
		const authorizedDomains = await prisma.iframeAuthorizedDomain.findMany({
			where: { isActive: true },
			select: { domain: true },
		});

		// Combinar domínios padrão com os cadastrados
		const allAuthorizedDomains = [
			...defaultAuthorizedDomains,
			...authorizedDomains.map((d: { domain: string }) => d.domain),
		];

		// Verificar se o referrer está autorizado
		const referrerUrl = new URL(referrer);
		const referrerOrigin = `${referrerUrl.protocol}//${referrerUrl.hostname}${referrerUrl.port ? ":" + referrerUrl.port : ""}`;

		const isAuthorized = allAuthorizedDomains.some((domain) => {
			try {
				const authorizedUrl = new URL(domain);
				const authorizedOrigin = `${authorizedUrl.protocol}//${authorizedUrl.hostname}${authorizedUrl.port ? ":" + authorizedUrl.port : ""}`;
				return referrerOrigin === authorizedOrigin;
			} catch {
				return false;
			}
		});

		if (isAuthorized) {
			// Log do acesso autorizado para auditoria
			await prisma.auditLog.create({
				data: {
					userId: null,
					action: "iframe_access_authorized",
					resourceType: "iframe_access",
					details: {
						referrer,
						timestamp: new Date().toISOString(),
						userAgent: request.headers.get("user-agent") || "unknown",
					},
				},
			});

			return NextResponse.json({ authorized: true });
		} else {
			// Log da tentativa de acesso não autorizada
			await prisma.auditLog.create({
			data: {
					userId: null,
					action: "iframe_access_denied",
					resourceType: "iframe_access",
					details: {
						referrer,
						timestamp: new Date().toISOString(),
						userAgent: request.headers.get("user-agent") || "unknown",
					},
				},
			});

			return NextResponse.json({ authorized: false, error: "Domínio não autorizado" }, { status: 403 });
		}
	} catch (error) {
		console.error("Erro na verificação de autorização iframe:", error);
		return NextResponse.json({ authorized: false, error: "Erro interno do servidor" }, { status: 500 });
	}
}
