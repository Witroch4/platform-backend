import { NextResponse } from "next/server";
import { openaiService } from "@/services/openai";
import { auth } from "@/auth";

// POST /api/chatwitia/images/variations - Create image variations
export async function POST(req: Request) {
	try {
		// Autenticação opcional com Auth.js v5
		const session = await auth();

		const formData = await req.formData();
		const image = formData.get("image") as File;
		const model = (formData.get("model") as string) || undefined;
		const n = formData.get("n") ? Number.parseInt(formData.get("n") as string) : undefined;
		const size = (formData.get("size") as string) || undefined;
		const responseFormat = (formData.get("response_format") as "url" | "b64_json") || undefined;
		const user = (formData.get("user") as string) || undefined;

		if (!image) {
			return NextResponse.json({ error: "No image provided" }, { status: 400 });
		}

		console.log(`Creating variation of image: ${image.name}`);

		const options = {
			model,
			n,
			size,
			responseFormat,
			user,
		};

		const response = await openaiService.createImageVariation(image, options);

		return NextResponse.json(response);
	} catch (error) {
		console.error("Error creating image variations:", error);
		return NextResponse.json(
			{ error: "Error creating image variations", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}
