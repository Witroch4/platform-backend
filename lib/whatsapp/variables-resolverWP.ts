/**
 * WhatsApp Variables Resolver
 *
 * Resolvedor de variáveis específico para payloads do WhatsApp
 * Integra com o sistema MTF Diamante para substituir variáveis em mensagens
 */

import { getPrismaInstance } from "../connections";
import { replaceVariablesInText } from "../mtf-diamante/variables-resolver";
import { resolveTextWithVariables } from "./variables-shared";

export interface WhatsAppVariableContext {
  userId?: string;
  inboxId?: string;
  contactPhone?: string;
  wamid?: string;
  correlationId?: string;
  personName?: string; // nome vindo do Dialogflow (parameters.person.name)
}

export class WhatsAppVariablesResolver {
  private userId: string | null = null;
  private context: WhatsAppVariableContext = {};
  private cachedLeadName: string | null = null;

  constructor(context: WhatsAppVariableContext = {}) {
    this.context = context;
    this.userId = context.userId || null;
  }

  /**
   * Retorna o userId associado (quando disponível)
   */
  getUserId(): string | null {
    return this.userId;
  }

  /**
   * Inicializa o resolvedor obtendo o userId do inboxId
   */
  async initialize(): Promise<void> {
    if (this.userId) {
      console.log(
        `[WhatsApp Variables] Already initialized with userId: ${this.userId}`
      );
      return;
    }

    if (!this.context.inboxId) {
      console.warn(
        "[WhatsApp Variables] No inboxId provided, cannot resolve user-specific variables"
      );
      return;
    }

    try {
      const prisma = getPrismaInstance();
      const inbox = await prisma.chatwitInbox.findFirst({
        where: { inboxId: this.context.inboxId },
        select: {
          usuarioChatwit: {
            select: {
              appUserId: true,
            },
          },
        },
      });

      this.userId = inbox?.usuarioChatwit?.appUserId || null;

      if (this.userId) {
        console.log(
          `[WhatsApp Variables] Initialized with userId: ${this.userId} from inboxId: ${this.context.inboxId}`
        );
      } else {
        console.warn(
          `[WhatsApp Variables] No userId found for inboxId: ${this.context.inboxId}`
        );
      }
    } catch (error) {
      console.error(
        `[WhatsApp Variables] Error getting userId from inboxId ${this.context.inboxId}:`,
        error
      );
    }
  }

  /**
   * Resolve variáveis em um texto
   */
  async resolveText(text: string): Promise<string> {
    if (!text) {
      console.log("[WhatsApp Variables] Empty text, skipping resolution");
      return text;
    }

    console.log(
      `[WhatsApp Variables] Resolving text: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`
    );

    let resolvedText = text;

    // 1. Resolver variáveis do sistema primeiro
    resolvedText = this.resolveSystemVariables(resolvedText);

    // 1.1 Resolver variável especial nome_lead com prioridade de produção
    if (resolvedText.includes("{{nome_lead}}")) {
      try {
        const nomeLead = await this.resolveNomeLead();
        resolvedText = resolvedText.replace(/\{\{nome_lead\}\}/g, nomeLead);
      } catch (e) {
        console.warn("[WhatsApp Variables] Failed to resolve {{nome_lead}}:", e);
        // fallback silencioso para manter placeholder ou substituir por Cliente
        resolvedText = resolvedText.replace(/\{\{nome_lead\}\}/g, "Cliente");
      }
    }

    // 2. Resolver placeholders nomeados localmente (permite preview/worker)
    try {
      resolvedText = resolveTextWithVariables(resolvedText, {}, {
        defaultLeadExampleName: "João",
      });
    } catch (e) {
      console.warn("[WhatsApp Variables] Named placeholder quick pass falhou:", e);
    }

    // 3. Resolver variáveis do MTF Diamante se userId estiver disponível
    // Isso inclui variáveis normais e a variável especial {{lote_ativo}}
    if (this.userId) {
      try {
        const originalText = resolvedText;
        resolvedText = await replaceVariablesInText(this.userId, resolvedText);

        if (originalText !== resolvedText) {
          console.log(
            `[WhatsApp Variables] MTF variables (including lote_ativo) resolved for user ${this.userId}`
          );
          console.log(
            `[WhatsApp Variables] Before: "${originalText.substring(0, 100)}${originalText.length > 100 ? "..." : ""}"`
          );
          console.log(
            `[WhatsApp Variables] After: "${resolvedText.substring(0, 100)}${resolvedText.length > 100 ? "..." : ""}"`
          );
        } else {
          console.log(
            `[WhatsApp Variables] No MTF variables found in text for user ${this.userId}`
          );
        }
      } catch (error) {
        console.error(
          `[WhatsApp Variables] Error resolving MTF variables for user ${this.userId}:`,
          error
        );
      }
    } else {
      console.log(
        "[WhatsApp Variables] No userId available, skipping MTF variable resolution"
      );
    }

    return resolvedText;
  }

  /**
   * Resolve o nome do lead seguindo prioridades:
   * 1) LeadOabData.nomeReal (quando houver lead associado ao telefone)
   * 2) Lead.name (nome salvo no lead)
   * 3) "Cliente" (fallback)
   */
  private async resolveNomeLead(): Promise<string> {
    if (this.cachedLeadName) return this.cachedLeadName;

    // Prioridade 1: nome vindo do webhook (Dialogflow person.name), quando fornecido no contexto
    const personName = (this.context as any).personName as string | undefined;
    if (personName && typeof personName === 'string' && personName.trim()) {
      this.cachedLeadName = personName.trim();
      return this.cachedLeadName;
    }

    const contactPhoneRaw = this.context.contactPhone || "";
    const contactPhone = String(contactPhoneRaw).replace(/\D/g, "");
    if (!contactPhone) {
      this.cachedLeadName = "Cliente";
      return this.cachedLeadName;
    }

    try {
      const prisma = getPrismaInstance();
      const lead = await prisma.lead.findFirst({
        where: { phone: contactPhone },
        include: { oabData: true },
      });

      const nomeFromOab = lead?.oabData?.nomeReal?.trim();
      if (nomeFromOab) {
        this.cachedLeadName = nomeFromOab;
        return this.cachedLeadName;
      }

      const nomeFromLead = lead?.name?.trim();
      if (nomeFromLead) {
        this.cachedLeadName = nomeFromLead;
        return this.cachedLeadName;
      }

      this.cachedLeadName = "Cliente";
      return this.cachedLeadName;
    } catch (error) {
      console.error("[WhatsApp Variables] Error resolving lead name:", error);
      this.cachedLeadName = "Cliente";
      return this.cachedLeadName;
    }
  }

  /**
   * Resolve variáveis do sistema (não específicas do usuário)
   */
  private resolveSystemVariables(text: string): string {
    const systemVariables: Record<string, string> = {
      "{{contact_phone}}": this.context.contactPhone || "",
      "{{wamid}}": this.context.wamid || "",
      "{{correlation_id}}": this.context.correlationId || "",
      "{{timestamp}}": new Date().toISOString(),
      "{{date}}": new Date().toLocaleDateString("pt-BR"),
      "{{time}}": new Date().toLocaleTimeString("pt-BR"),
    };

    let resolvedText = text;
    let hasSystemVariables = false;

    for (const [placeholder, value] of Object.entries(systemVariables)) {
      if (resolvedText.includes(placeholder)) {
        hasSystemVariables = true;
        resolvedText = resolvedText.replace(
          new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          value
        );
      }
    }

    if (hasSystemVariables) {
      console.log(`[WhatsApp Variables] System variables resolved`);
    }

    return resolvedText;
  }

  /**
   * Resolve variáveis em um objeto de mensagem interativa
   */
  async resolveInteractiveMessage(data: any): Promise<any> {
    console.log("[WhatsApp Variables] Resolving interactive message variables");

    const processedData = JSON.parse(JSON.stringify(data)); // Deep clone

    // Resolve variables in header text
    if (processedData.header?.type === "text" && processedData.header.content) {
      console.log("[WhatsApp Variables] Resolving header text");
      processedData.header.content = await this.resolveText(
        processedData.header.content
      );
    }

    // Resolve variables in body text
    if (processedData.body?.text) {
      console.log("[WhatsApp Variables] Resolving body text");
      processedData.body.text = await this.resolveText(processedData.body.text);
    }

    // Resolve variables in footer text
    if (processedData.footer?.text) {
      console.log("[WhatsApp Variables] Resolving footer text");
      processedData.footer.text = await this.resolveText(
        processedData.footer.text
      );
    }

    // Resolve variables in button titles
    if (processedData.action?.buttons) {
      console.log(
        `[WhatsApp Variables] Resolving ${processedData.action.buttons.length} button titles`
      );
      for (let i = 0; i < processedData.action.buttons.length; i++) {
        const button = processedData.action.buttons[i];
        if (button.title) {
          console.log(
            `[WhatsApp Variables] Resolving button ${i + 1} title: "${button.title}"`
          );
          button.title = await this.resolveText(button.title);
        }
      }
    }

    // Resolve variables in list sections and rows
    if (processedData.action?.sections) {
      console.log(
        `[WhatsApp Variables] Resolving ${processedData.action.sections.length} list sections`
      );
      for (let i = 0; i < processedData.action.sections.length; i++) {
        const section = processedData.action.sections[i];
        if (section.title) {
          console.log(
            `[WhatsApp Variables] Resolving section ${i + 1} title: "${section.title}"`
          );
          section.title = await this.resolveText(section.title);
        }
        if (section.rows) {
          for (let j = 0; j < section.rows.length; j++) {
            const row = section.rows[j];
            if (row.title) {
              console.log(
                `[WhatsApp Variables] Resolving row ${j + 1} title: "${row.title}"`
              );
              row.title = await this.resolveText(row.title);
            }
            if (row.description) {
              console.log(
                `[WhatsApp Variables] Resolving row ${j + 1} description: "${row.description}"`
              );
              row.description = await this.resolveText(row.description);
            }
          }
        }
      }
    }

    console.log(
      "[WhatsApp Variables] Interactive message variables resolved successfully"
    );
    return processedData;
  }

  /**
   * Resolve variáveis em componentes de template oficial do WhatsApp
   */
  async resolveTemplateComponents(components: any[]): Promise<any[]> {
    if (!components || !Array.isArray(components)) {
      return components;
    }

    console.log(
      `[WhatsApp Variables] Resolving ${components.length} template components`
    );

    const resolvedComponents = await Promise.all(
      components.map(async (component, index) => {
        const processedComponent = { ...component };

        if (component.type === "BODY" && component.text) {
          console.log(
            `[WhatsApp Variables] Resolving BODY component ${index + 1}: "${component.text}"`
          );
          processedComponent.text = await this.resolveText(component.text);
        }

        if (component.type === "HEADER" && component.text) {
          console.log(
            `[WhatsApp Variables] Resolving HEADER component ${index + 1}: "${component.text}"`
          );
          processedComponent.text = await this.resolveText(component.text);
        }

        if (component.type === "FOOTER" && component.text) {
          console.log(
            `[WhatsApp Variables] Resolving FOOTER component ${index + 1}: "${component.text}"`
          );
          processedComponent.text = await this.resolveText(component.text);
        }

        return processedComponent;
      })
    );

    console.log(
      "[WhatsApp Variables] Template components resolved successfully"
    );
    return resolvedComponents;
  }

  /**
   * Factory method para criar um resolvedor a partir de um inboxId
   */
  static async fromInboxId(
    inboxId: string,
    context: Partial<WhatsAppVariableContext> = {}
  ): Promise<WhatsAppVariablesResolver> {
    const resolver = new WhatsAppVariablesResolver({
      ...context,
      inboxId,
    });

    await resolver.initialize();
    return resolver;
  }

  /**
   * Factory method para criar um resolvedor a partir de um userId
   */
  static fromUserId(
    userId: string,
    context: Partial<WhatsAppVariableContext> = {}
  ): WhatsAppVariablesResolver {
    return new WhatsAppVariablesResolver({
      ...context,
      userId,
    });
  }
}
