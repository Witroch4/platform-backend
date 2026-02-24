import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id)
		return NextResponse.json(
			{ error: "Usuário não autenticado." },
			{ status: 401 },
		);

	const { html, leadId } = await req.json();
	if (!html || !leadId) {
		return NextResponse.json(
			{ error: "html e leadId são obrigatórios." },
			{ status: 400 },
		);
	}

	const HTMLtoDOCX = (await import("html-to-docx")).default;

	const wrappedHtml = `
		<html>
		<head><style>
			body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; }
			h1 { font-size: 16pt; font-weight: bold; }
			h2 { font-size: 14pt; font-weight: bold; }
			h3 { font-size: 13pt; font-weight: bold; }
		</style></head>
		<body>${html}</body>
		</html>
	`;

	const result = await HTMLtoDOCX(wrappedHtml, null, {
		table: { row: { cantSplit: true } },
		footer: true,
		pageNumber: true,
	});

	// html-to-docx returns Buffer on Node.js, Blob in browser
	const buffer =
		result instanceof Buffer
			? result
			: Buffer.from(await (result as Blob).arrayBuffer());

	return new NextResponse(buffer, {
		headers: {
			"Content-Type":
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"Content-Disposition": `attachment; filename="recurso_${leadId}.docx"`,
		},
	});
}
