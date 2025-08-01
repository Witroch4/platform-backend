// route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { unifyFilesToPdf, savePdfToMinIO, type Environment } from "./utils";
import './config';

const prisma = new PrismaClient();

// Tipos para uso com Prisma
interface ArquivoLeadChatwit {
  id: string;
  fileType: string;
  dataUrl: string;
  pdfConvertido?: string | null;
  leadId: string;
}

interface LeadChatwit {
  id: string;
  sourceId: string;
  name?: string | null;
  nomeReal?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  thumbnail?: string | null;
  concluido: boolean;
  anotacoes?: string | null;
  pdfUnificado?: string | null;
  leadUrl?: string | null;
  fezRecurso: boolean;
  datasRecurso?: string | null;
  usuarioChatwitId: string;
  arquivos: ArquivoLeadChatwit[];
}

/**
 * GET handler – usado para recuperar a URL do PDF unificado.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const leadId = url.searchParams.get("leadId");
    const usuarioId = url.searchParams.get("usuarioId");
    
    if (!leadId && !usuarioId) {
      return NextResponse.json({ error: "ID do lead ou do usuário é obrigatório" }, { status: 400 });
    }
    
    let pdfUrl: string | null = null;
    
    if (leadId) {
      // Buscar o lead específico
      const lead = await prisma.leadOabData.findUnique({
        where: { id: leadId },
      });
      
      if (!lead || !lead.pdfUnificado) {
        return NextResponse.json({ error: "PDF unificado não encontrado para esse lead" }, { status: 404 });
      }
      
      pdfUrl = lead.pdfUnificado;
    }
    else if (usuarioId) {
      // Buscar os leads do usuário que tenham PDF unificado
      const leads = await prisma.leadOabData.findMany({
        where: {
          usuarioChatwitId: usuarioId,
          pdfUnificado: { not: null }
        },
        take: 1
      });
      
      if (leads.length === 0 || !leads[0].pdfUnificado) {
        return NextResponse.json({ error: "Nenhum PDF unificado encontrado para esse usuário" }, { status: 404 });
      }
      
      pdfUrl = leads[0].pdfUnificado;
    }
    
    if (!pdfUrl) {
      return NextResponse.json({ error: "PDF unificado não encontrado" }, { status: 404 });
    }
    
    return NextResponse.redirect(pdfUrl);
  } catch (error: any) {
    console.error("[API Unify] Erro ao buscar PDF unificado:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

/**
 * POST handler – unifica os arquivos e salva o PDF no MinIO.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await request.json();
    const { leadId, usuarioId } = payload;
    
    if (!leadId && !usuarioId) {
      return NextResponse.json({ error: "ID do lead ou do usuário é obrigatório" }, { status: 400 });
    }
    
    let arquivos: ArquivoLeadChatwit[] = [];
    let fileName = "";
    
    if (leadId) {
      // Buscar os arquivos de um lead específico
      const results = await prisma.arquivoLeadOab.findMany({
        where: { leadOabDataId: leadId },
      });
      arquivos = results.map(({ leadOabDataId, ...arquivo }) => ({
        ...arquivo,
        leadId: leadOabDataId,
      }));
      
      if (arquivos.length === 0) {
        return NextResponse.json({ error: "Nenhum arquivo encontrado para esse lead" }, { status: 404 });
      }
      
      fileName = `lead_${leadId}_unificado_${new Date().getTime()}.pdf`;
      
      console.log(`[API Unify] Processando ${arquivos.length} arquivo(s) para o lead ${leadId}`);
      
      // OTIMIZAÇÃO: Se há apenas um arquivo PDF, usar diretamente sua URL
      if (arquivos.length === 1 && arquivos[0].fileType.toLowerCase() === 'pdf') {
        const unicoArquivoPdf = arquivos[0];
        
        console.log(`[API Unify] Único arquivo PDF detectado para o lead ${leadId}. Usando diretamente: ${unicoArquivoPdf.dataUrl}`);
        
        // Atualizar o registro do Lead com a URL do PDF existente
        await prisma.leadOabData.update({
          where: { id: leadId },
          data: { pdfUnificado: unicoArquivoPdf.dataUrl },
        });
        
        return NextResponse.json({
          success: true,
          message: "PDF único definido como unificado (sem processamento necessário)",
          pdfUrl: unicoArquivoPdf.dataUrl,
          optimized: true,
        });
      }
    } 
    else if (usuarioId) {
      // Buscar todos os leads do usuário com seus arquivos
      const leads = await prisma.leadOabData.findMany({
        where: { usuarioChatwitId: usuarioId },
        include: { arquivos: true },
      });

      arquivos = leads.flatMap((lead: LeadChatwit) =>
        lead.arquivos.map(({ leadOabDataId, ...arquivo }) => ({
          ...arquivo,
          leadId: leadOabDataId,
        }))
      );
      
      if (arquivos.length === 0) {
        return NextResponse.json({ error: "Nenhum arquivo encontrado para os leads desse usuário" }, { status: 404 });
      }
      
      fileName = `usuario_${usuarioId}_todos_leads_unificado_${new Date().getTime()}.pdf`;
      
      console.log(`[API Unify] Processando ${arquivos.length} arquivo(s) para o usuário ${usuarioId}`);
      
      // Para usuário, sempre unificar mesmo se for um só arquivo (pode ser de múltiplos leads)
    }
    
    // Continuar com unificação normal para múltiplos arquivos ou cenário de usuário
    const fileObjects = arquivos.map((arquivo: ArquivoLeadChatwit) => ({
      url: arquivo.dataUrl,
      name: `arquivo_${arquivo.id}.${arquivo.fileType}`
    }));
    
    console.log(`[API Unify] Unificando ${fileObjects.length} arquivos...`);
    
    // Unificar os PDFs
    const pdfBuffer = await unifyFilesToPdf(fileObjects);
    
    // Salvar o PDF no MinIO
    const pdfUrl = await savePdfToMinIO(pdfBuffer, fileName, process.env.S3Bucket || "chatwit", process.env.NODE_ENV || "development");
    
    // Atualizar o registro do Lead com a URL do PDF unificado
    if (leadId) {
      await prisma.leadOabData.update({
        where: { id: leadId },
        data: { pdfUnificado: pdfUrl },
      });
      
      console.log(`[API Unify] PDF unificado criado para o lead ${leadId}: ${pdfUrl}`);
    }
    
    return NextResponse.json({
      success: true,
      message: "Arquivos unificados com sucesso",
      pdfUrl,
      filesProcessed: fileObjects.length,
    });
  } catch (error: any) {
    console.error("[API Unify] Erro ao unificar arquivos:", error);
    return NextResponse.json({
      error: "Erro interno ao unificar arquivos",
      details: error.message,
    }, { status: 500 });
  }
}
