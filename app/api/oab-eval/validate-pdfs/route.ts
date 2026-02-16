//app/api/oab-eval/validate-pdfs/route.ts
import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { join } from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
	try {
		console.log(`[OAB-EVAL::VALIDATE] Executando teste de validação dos PDFs`);

		// Execute the validation script
		const scriptPath = join(process.cwd(), "temp/check_oab.ts");
		const output = execSync(`npx tsx ${scriptPath}`, {
			encoding: "utf-8",
			cwd: process.cwd(),
			maxBuffer: 1024 * 1024 * 10, // 10MB buffer
		});

		// Parse the output to extract the table and detailed results
		const lines = output.split("\n");
		const tableStart = lines.findIndex((line) => line.includes("┌─────────┬"));
		const tableEnd = lines.findIndex((line, index) => index > tableStart && line.includes("└─────────┴"));

		let tableSection = "";
		let detailsSection = "";

		if (tableStart !== -1 && tableEnd !== -1) {
			tableSection = lines.slice(tableStart, tableEnd + 1).join("\n");
			detailsSection = lines.slice(tableEnd + 1).join("\n");
		} else {
			tableSection = output;
		}

		// Count successful and failed PDFs
		const successCount = (output.match(/ok.*true/g) || []).length;
		const totalCount = 7; // We know there are 7 PDFs
		const failedCount = totalCount - successCount;

		return NextResponse.json({
			success: true,
			output,
			tableSection,
			detailsSection,
			summary: {
				total: totalCount,
				successful: successCount,
				failed: failedCount,
				allPassed: failedCount === 0,
			},
			message: `Validação concluída: ${successCount}/${totalCount} PDFs passaram no teste`,
		});
	} catch (error) {
		console.error("[OAB-EVAL::VALIDATE] Erro:", error);

		// If it's an execution error, try to capture the output
		const errorOutput = (error as any).stdout || (error as any).stderr || "";

		return NextResponse.json(
			{
				success: false,
				error: (error as Error).message || "Falha ao executar teste de validação",
				output: errorOutput,
			},
			{ status: 500 },
		);
	}
}
