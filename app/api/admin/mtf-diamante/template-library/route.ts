import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { TemplateLibraryService, type CreateTemplateLibraryData } from "@/app/lib/template-library-service";

// GET - Get library items
export async function GET(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(request.url);
		const rawType = searchParams.get("type");
		const rawScope = searchParams.get("scope");

		const type =
			rawType === "template"
				? "WHATSAPP_OFFICIAL"
				: rawType === "interactive_message"
					? "INTERACTIVE_MESSAGE"
					: (rawType as "WHATSAPP_OFFICIAL" | "INTERACTIVE_MESSAGE" | "AUTOMATION_REPLY" | null);

		const scope =
			rawScope === "global"
				? "GLOBAL"
				: rawScope === "account_specific"
					? "PRIVATE"
					: (rawScope as "GLOBAL" | "PRIVATE" | null);
		const category = searchParams.get("category");
		const search = searchParams.get("search");

		let templates;

		if (search) {
			templates = await TemplateLibraryService.searchTemplates(search, session.user.id, type || undefined);
		} else if (category) {
			templates = await TemplateLibraryService.getTemplatesByCategory(category, session.user.id);
		} else {
			templates = await TemplateLibraryService.getLibraryItems(session.user.id, type || undefined, scope || undefined);
		}

		return NextResponse.json({ templates });
	} catch (error) {
		console.error("Error fetching template library:", error);
		return NextResponse.json({ error: "Failed to fetch template library" }, { status: 500 });
	}
}

// POST - Create new template library item
export async function POST(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = await request.json();
		const { name, description, type: rawBodyType, scope: rawBodyScope, content, language, tags } = body;

		const bodyType =
			rawBodyType === "template"
				? "WHATSAPP_OFFICIAL"
				: rawBodyType === "interactive_message"
					? "INTERACTIVE_MESSAGE"
					: (rawBodyType as "WHATSAPP_OFFICIAL" | "INTERACTIVE_MESSAGE" | "AUTOMATION_REPLY");

		const bodyScope =
			rawBodyScope === "global"
				? "GLOBAL"
				: rawBodyScope === "account_specific"
					? "PRIVATE"
					: (rawBodyScope as "GLOBAL" | "PRIVATE");

		// Validate required fields
		if (!name || !rawBodyType || !rawBodyScope || !content) {
			return NextResponse.json({ error: "Missing required fields: name, type, scope, content" }, { status: 400 });
		}

		// Validate type
		if (!["WHATSAPP_OFFICIAL", "INTERACTIVE_MESSAGE", "AUTOMATION_REPLY"].includes(bodyType)) {
			return NextResponse.json({ error: "Invalid type" }, { status: 400 });
		}

		// Validate scope
		if (!["GLOBAL", "PRIVATE"].includes(bodyScope)) {
			return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
		}

		// Only admins can create global templates
		if (bodyScope === "GLOBAL" && session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
			return NextResponse.json({ error: "Only administrators can create global templates" }, { status: 403 });
		}

		const templateData: CreateTemplateLibraryData = {
			name,
			description,
			type: bodyType,
			scope: bodyScope,
			content,
			language,
			tags,
			createdById: session.user.id,
		};

		const template = await TemplateLibraryService.saveToLibrary(templateData);

		return NextResponse.json({ template }, { status: 201 });
	} catch (error) {
		console.error("Error creating template library item:", error);
		return NextResponse.json({ error: "Failed to create template library item" }, { status: 500 });
	}
}
