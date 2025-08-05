// app/api/admin/mtf-diamante/disparo/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPrismaInstance } from "@/lib/connections"
import { z } from "zod";
import { sendTemplateMessage } from "@/lib/whatsapp";

const disparoSchema = z.object({
  templateId: z.string().min(1, "Template é obrigatório"),
  selectedLeads: z.array(z.string()).min(1, "Selecione pelo menos um lead"),
  delayMinutes: z.number().min(0).default(0),
  parameters: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const appUserId = session.user.id;
    if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await request.json();
    const { templateId, selectedLeads, delayMinutes, parameters } =
      disparoSchema.parse(body);

    // Buscar o usuário Chatwit (opcional, pode não existir)
    const usuarioChatwit = await getPrismaInstance().usuarioChatwit.findFirst({
      where: { appUserId: appUserId },
      select: { id: true },
    });

    // A busca de template já está correta
    const template = await getPrismaInstance().template.findFirst({
      where: {
        id: templateId,
        createdById: session.user.id,
      },
      select: { id: true, name: true, status: true },
    });

    if (!template) {
      return NextResponse.json(
        {
          error: `Template com ID ${templateId} não encontrado para este usuário.`,
        },
        { status: 404 }
      );
    }

    if (template.status !== "APPROVED") {
      return NextResponse.json(
        { error: `Template não está aprovado (Status: ${template.status})` },
        { status: 400 }
      );
    }

    // --- CORREÇÃO APLICADA AQUI ---
    // Mapear os números de telefone para uma busca mais flexível, evitando duplicação
    const leadConditions: Array<
      { phone: { endsWith: string } } | { id: string }
    > = [];

    selectedLeads.forEach((leadIdentifier) => {
      const cleanNumber = leadIdentifier.replace(/\D/g, "");
      const isNumeric = /^\d+$/.test(leadIdentifier);

      if (isNumeric && cleanNumber.length >= 10) {
        // Se é um número, busca apenas por telefone
        leadConditions.push({
          phone: { endsWith: cleanNumber.slice(-11) },
        });
      } else {
        // Se não é um número, busca apenas por ID
        leadConditions.push({ id: leadIdentifier });
      }
    });

    const leadsRaw = await getPrismaInstance().lead.findMany({
      where: {
        AND: [
          { userId: session.user.id }, // Garante que o lead é do usuário
          { OR: leadConditions }, // Aplica as condições flexíveis de busca
        ],
      },
      select: { id: true, name: true, phone: true },
      distinct: ["id"], // Garante que não haverá leads duplicados
    });

    // Remove duplicatas por número de telefone (mantém apenas o primeiro lead de cada número)
    const phoneNumbersSeen = new Set<string>();
    const leads = leadsRaw.filter((lead) => {
      if (!lead.phone) return false;
      const cleanPhone = lead.phone.replace(/\D/g, "");
      if (phoneNumbersSeen.has(cleanPhone)) {
        console.log(
          `[Disparo Debug] Lead duplicado ignorado: ${lead.id} (${lead.phone}) - já existe lead com este número`
        );
        return false;
      }
      phoneNumbersSeen.add(cleanPhone);
      return true;
    });
    // --- FIM DA CORREÇÃO ---

    if (leads.length === 0) {
      return NextResponse.json(
        { error: "Nenhum lead válido encontrado na sua base de dados." },
        { status: 404 }
      );
    }

    // O restante do código de disparo continua igual
    const disparosData = leads.map((lead) => ({
      templateName: template.name,
      leadId: lead.id,
      status: "PENDING",
      scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000),
      parameters: parameters || {} as any,
      userId: appUserId,
    }));

    await getPrismaInstance().disparoMtfDiamante.createMany({
      data: disparosData,
      skipDuplicates: true,
    });

    if (delayMinutes === 0) {
      const resultados = await Promise.allSettled(
        leads.map(async (lead) => {
          try {
            // Buscar o template completo para analisar variáveis
            const templateCompleto = await getPrismaInstance().template.findFirst({
              where: {
                id: templateId,
                createdById: session.user.id,
              },
            });

            // Preparar nome do lead
            const nomeDoLead = lead.name || "Cliente";

            // Converter parameters para o formato esperado por sendTemplateMessage
            const sendOpts: any = {};

            // Auto-preencher variáveis com dados do lead
            if (templateCompleto?.simpleReplyText) {
              try {
                const components = JSON.parse(templateCompleto.simpleReplyText) as any[];
                const bodyComponent = components.find((c: any) => c.type === "BODY");

              if (bodyComponent?.text) {
                const placeholders =
                  bodyComponent.text.match(/\{\{(\d+)\}\}/g) || [];

                if (placeholders.length > 0) {
                  // Criar array de variáveis preenchidas automaticamente
                  const autoVars: string[] = [];

                  // Para cada placeholder, usar o nome do lead
                  for (let i = 0; i < placeholders.length; i++) {
                    autoVars.push(nomeDoLead);
                  }

                  console.log(
                    `[Disparo] Auto-preenchendo ${placeholders.length} variáveis com: "${nomeDoLead}"`
                  );
                  sendOpts.bodyVars = autoVars;
                }
              }
            } catch (error) {
              console.error('[Disparo] Erro ao processar componentes do template:', error);
            }
            }

            // Processar parâmetros manuais (sobrescreve auto-preenchimento se fornecido)
            if (
              parameters &&
              typeof parameters === "object" &&
              Object.keys(parameters).length > 0
            ) {
              // Se parameters é um objeto com chaves numéricas, converter para array
              const paramKeys = Object.keys(parameters).sort(
                (a, b) => Number(a) - Number(b)
              );
              if (
                paramKeys.length > 0 &&
                paramKeys.every((key) => /^\d+$/.test(key))
              ) {
                sendOpts.bodyVars = paramKeys.map((key) => (parameters as any)[key]);
                console.log(
                  `[Disparo] Usando parâmetros manuais: [${sendOpts.bodyVars.join(", ")}]`
                );
              } else {
                // Se parameters tem outras propriedades, mapear adequadamente
                if (
                  (parameters as any).bodyVars &&
                  Array.isArray((parameters as any).bodyVars) &&
                  (parameters as any).bodyVars.length > 0
                ) {
                  sendOpts.bodyVars = (parameters as any).bodyVars;
                  console.log(
                    `[Disparo] Usando bodyVars manuais: [${sendOpts.bodyVars.join(", ")}]`
                  );
                }
                if ((parameters as any).headerVar)
                  sendOpts.headerVar = (parameters as any).headerVar;
                if ((parameters as any).headerMedia)
                  sendOpts.headerMedia = (parameters as any).headerMedia;
                if ((parameters as any).buttonOverrides)
                  sendOpts.buttonOverrides = (parameters as any).buttonOverrides;
                if ((parameters as any).couponCode)
                  sendOpts.couponCode = (parameters as any).couponCode;
              }
            }
            const success = await sendTemplateMessage(
              lead.phone || "",
              template.name,
              sendOpts
            );
            await getPrismaInstance().disparoMtfDiamante.updateMany({
              where: {
                leadId: lead.id,
                templateName: template.name,
                status: "PENDING",
              },
              data: {
                status: success ? "SENT" : "FAILED",
                sentAt: new Date(),
                errorMessage: success ? null : "Falha no envio" as any,
              },
            });
            return { success };
          } catch (error) {
            await getPrismaInstance().disparoMtfDiamante.updateMany({
              where: {
                leadId: lead.id,
                templateName: template.name,
                status: "PENDING",
              },
              data: {
                status: "FAILED",
                errorMessage:
                  error instanceof Error ? error.message : "Erro desconhecido" as any,
              },
            });
            return { success: false };
          }
        })
      );
      const sucessos = resultados.filter(
        (r) => r.status === "fulfilled" && r.value.success
      ).length;
      return NextResponse.json({
        success: true,
        message: `Disparo concluído: ${sucessos} sucessos, ${leads.length - sucessos} falhas.`,
      });
    } else {
      return NextResponse.json({
        success: true,
        message: `Disparo agendado para ${delayMinutes} minutos.`,
      });
    }
  } catch (error) {
    console.error("[API /disparo] ERRO FATAL:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// A função GET não precisa de alteraçõ

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") || "1");
    const limit = Number.parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status");

    const whereClause: any = {
      userId: session.user.id,
    };

    if (status) {
      whereClause.status = status;
    }

    const [disparos, total] = await Promise.all([
      getPrismaInstance().disparoMtfDiamante.findMany({
        where: whereClause,
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      getPrismaInstance().disparoMtfDiamante.count({
        where: whereClause,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        disparos,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Erro ao buscar disparos:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
