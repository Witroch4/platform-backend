//app/api/oab-eval/load-examples/route.ts
import { NextResponse } from "next/server";
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const dir = join(process.cwd(), 'lib/oab/pdf-exemplos-gabaritos');
    const files = readdirSync(dir).filter((f) => f.endsWith('.pdf'));
    
    console.log(`[OAB-EVAL::LOAD_EXAMPLES] Carregando ${files.length} PDFs de exemplo`);
    
    const fileData = files.map(fileName => {
      const filePath = join(dir, fileName);
      const buffer = readFileSync(filePath);
      return {
        name: fileName,
        buffer: Array.from(buffer) // Convert Buffer to array for JSON serialization
      };
    });
    
    return NextResponse.json({
      success: true,
      files: fileData,
      message: `${files.length} PDFs carregados da pasta de exemplos`
    });
    
  } catch (error) {
    console.error("[OAB-EVAL::LOAD_EXAMPLES] Erro:", error);
    return NextResponse.json({ 
      success: false,
      error: (error as Error).message || "Falha ao carregar PDFs de exemplo"
    }, { status: 500 });
  }
}