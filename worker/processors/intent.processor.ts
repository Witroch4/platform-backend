
import { getPrismaInstance } from "../../lib/connections";
import {
  sanitizeTextContent,
  sanitizePhoneNumber,
  sanitizeApiKey
} from "../../lib/webhook-utils";
import { WorkerResponse, WhatsAppCredentials, TemplateMapping } from "../types/types";
import { WhatsAppApiManager } from "../services/whatsapp.service";
import { WhatsAppPayloadBuilder } from "../../lib/whatsapp/whatsapp-payload-builder";

const whatsappApiManager = new WhatsAppApiManager();

// ============================================================================
// INTENT PROCESSING LOGIC (Subtask 3.1)
// ============================================================================

export class IntentProcessor {
  /**
   * Process intent interaction using unified template system
   * Requirements: 4.2, 4.4, 4.5
   */
  async processIntent(
    intentName: string,
    inboxId: string,
    credentials: WhatsAppCredentials,
    contactPhone: string,
    wamid: string,
    correlationId: string
  ): Promise<WorkerResponse> {
    const startTime = Date.now();

    try {
      // Validar e re-sanitizar dados críticos no worker como medida de segurança
      const sanitizedData = {
        intentName: sanitizeTextContent(intentName),
        inboxId: String(inboxId).trim(),
        contactPhone: sanitizePhoneNumber(contactPhone),
        wamid: String(wamid).trim(),
        correlationId: String(correlationId).trim(),
        credentials: {
          token: sanitizeApiKey(credentials.token),
          phoneNumberId: String(credentials.phoneNumberId).trim(),
          businessId: String(credentials.businessId).trim(),
        }
      };

      // Validar dados sanitizados
      if (!sanitizedData.intentName || !sanitizedData.contactPhone || !sanitizedData.credentials.token) {
        throw new Error('Dados críticos inválidos após sanitização no worker');
      }

      console.log(`[Intent Processor] Processing intent: ${sanitizedData.intentName}`, {
        correlationId: sanitizedData.correlationId,
        inboxId: sanitizedData.inboxId,
        contactPhone: `${sanitizedData.contactPhone.substring(0, 4)}****${sanitizedData.contactPhone.substring(sanitizedData.contactPhone.length - 4)}`,
        hasValidCredentials: !!sanitizedData.credentials.token,
      });

      // 1. Query MapeamentoIntencao for template mapping
      const templateMapping = await this.findTemplateByIntent(
        sanitizedData.intentName,
        sanitizedData.inboxId
      );

      if (!templateMapping) {
        console.log(
          `[Intent Processor] No mapping found for intent: ${sanitizedData.intentName}`,
          {
            correlationId: sanitizedData.correlationId,
            inboxId: sanitizedData.inboxId,
          }
        );

        // Fallback handling when no mapping is found
        return await this.handleNoMappingFallback(
          sanitizedData.intentName,
          sanitizedData.contactPhone,
          sanitizedData.credentials,
          sanitizedData.correlationId,
          startTime
        );
      }

      // 2. Resolve template based on type with priority logic
      const resolvedTemplate = await this.resolveTemplate(templateMapping);

      if (!resolvedTemplate) {
        throw new Error(`Failed to resolve template for intent: ${intentName}`);
      }

      // 3. Build message content directly based on template type
      const processedContent = await this.buildMessageContent(
        resolvedTemplate,
        {
          contactPhone,
          intentName,
          wamid,
          correlationId,
        },
        inboxId,
        templateMapping.customVariables // Passar variáveis customizadas
      );

      // 4. Send message via WhatsApp API with credential management
      const messageId = await whatsappApiManager.sendMessage(
        contactPhone,
        processedContent,
        credentials,
        inboxId,
        correlationId
      );

      const processingTime = Date.now() - startTime;

      console.log(
        `[Intent Processor] Successfully processed intent: ${intentName}`,
        {
          correlationId,
          messageId,
          processingTime,
        }
      );

      return {
        success: true,
        messageId,
        processingTime,
        correlationId,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.error(
        `[Intent Processor] Failed to process intent: ${intentName}`,
        {
          correlationId,
          error: errorMessage,
          processingTime,
        }
      );

      return {
        success: false,
        error: errorMessage,
        processingTime,
        correlationId,
      };
    }
  }

  /**
   * Aplica variáveis customizadas aos componentes do template
   */
  private applyCustomVariablesToComponents(
    components: any,
    customVariables: Record<string, string>,
    contactPhone: string
  ): any[] {
    const list = this.normalizeComponentsToArray(components);
    console.log('[Intent Processor] Applying custom variables to template components', {
      customVariables,
      componentsCount: Array.isArray(list) ? list.length : 0
    });

    return list.map(component => {
      const processedComponent: any = { ...component };

      // Resolver parâmetros nomeados/posicionais para BODY
      if (component.type === 'BODY' && component.text) {
        const params = this.buildTemplateParameters(
          component.text,
          customVariables,
          component.example
        );
        if (params.length > 0) {
          processedComponent.__resolvedBodyParams = params.map((p) => ({ ...p }));
        }
      }

      // Resolver parâmetros do HEADER texto (apenas um permitido)
      if (component.type === 'HEADER' && component.format === 'TEXT' && component.text) {
        const params = this.buildTemplateParameters(
          component.text,
          customVariables,
          component.example,
          true // header
        );
        if (params.length > 0) {
          // Cloud API espera apenas os valores, não o texto completo
          processedComponent.__resolvedHeaderParams = [{ ...params[0] }];
        }
      }

      // Processar botão COPY_CODE para injetar coupon_code customizado
      if (component.type === 'BUTTONS' && Array.isArray(component.buttons)) {
        const buttons = component.buttons as any[];
        processedComponent.buttons = buttons.map((btn: any) => {
          const b = { ...btn };
          if (String(b?.type || '').toUpperCase() === 'COPY_CODE' && customVariables?.coupon_code) {
            b.coupon_code = String(customVariables.coupon_code);
            // mantém example como fallback; não é obrigatório alterar
          }
          return b;
        });
      }

      return processedComponent;
    });
  }

  /**
   * Constrói a lista de parâmetros (named/positional) para Cloud API a partir do texto e exemplos
   */
  private buildTemplateParameters(
    text: string,
    customVariables: Record<string, string>,
    example: any,
    isHeader: boolean = false
  ): Array<{ type: 'text'; text: string; parameter_name?: string }> {
    if (!text) return [];

    // Extrair placeholders na ordem
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    if (matches.length === 0) return [];

    const namedParamsExample: Record<string, string> = {};
    if (example) {
      const namedArray =
        (example.body_text_named_params as any[]) ||
        (example.header_text_named_params as any[]) ||
        [];
      for (const item of namedArray) {
        if (item?.param_name && typeof item.example === 'string') {
          namedParamsExample[item.param_name] = item.example;
        }
      }
    }

    const positionalExamples: string[] =
      (example?.body_text?.[0] as string[]) ||
      (example?.header_text?.[0] as string[]) ||
      [];

    const params: Array<{ type: 'text'; text: string; parameter_name?: string }> = [];

    matches.forEach((match, i) => {
      const raw = match.replace(/[{}]/g, '').trim();
      const isNumeric = /^\d+$/.test(raw);
      let value = '';

      // Preferir variáveis customizadas
      if (!isNumeric && customVariables[raw] !== undefined) {
        value = String(customVariables[raw]);
      }

      if (!value && customVariables[`variavel_${i}`] !== undefined) {
        value = String(customVariables[`variavel_${i}`]);
      }

      // Fallback em exemplos
      if (!value && !isNumeric && namedParamsExample[raw] !== undefined) {
        value = String(namedParamsExample[raw]);
      }
      if (!value && positionalExamples[i] !== undefined) {
        value = String(positionalExamples[i]);
      }

      // Último fallback: vazio
      const param: any = { type: 'text', text: value };
      if (!isNumeric && !isHeader) {
        // Para BODY, enviar parameter_name quando for named
        param.parameter_name = raw;
      }
      if (!isNumeric && isHeader) {
        // Para HEADER texto com named param, alguns apps aceitam sem parameter_name; manter por consistência do BODY
        param.parameter_name = raw;
      }
      params.push(param);
    });

    // Para HEADER texto, garantir no máximo 1 parâmetro
    if (isHeader && params.length > 1) {
      return [params[0]];
    }

    return params;
  }

  /**
   * Substitui variáveis em texto de template usando valores customizados ou exemplos
   */
  private replaceVariablesInTemplateText(
    text: string,
    exampleValues: string[],
    customVariables: Record<string, string>,
    contactPhone: string
  ): string {
    // Novo padrão: aceitar nomes nos placeholders e manter compatibilidade numérica
    // 1) construir mapa de variáveis disponíveis
    const variablesMap: Record<string, string> = { ...customVariables };

    // 2) fallback para exemplos por ordem de aparição
    const allMatches = text.match(/\{\{([^}]+)\}\}/g) || [];
    allMatches.forEach((m, i) => {
      const raw = m.replace(/[{}]/g, '').trim();
      const keyCandidates = [raw, `variavel_${raw}`];
      const hasValue = keyCandidates.some((k) => variablesMap[k] !== undefined);
      if (!hasValue && exampleValues[i] !== undefined) {
        variablesMap[raw] = exampleValues[i];
      }
    });

    // 3) variável especial nome_lead
    if (!variablesMap["nome_lead"]) {
      variablesMap["nome_lead"] = this.extractLeadNameFromPhone(contactPhone);
    }

    // 4) aplicar
    return text.replace(/\{\{([^}]+)\}\}/g, (_m, rawKey: string) => {
      const key = String(rawKey).trim();
      const candidates = [key, `variavel_${key}`];
      for (const k of candidates) {
        if (variablesMap[k] !== undefined) {
          let v = String(variablesMap[k] as any);
          if (v.includes('{{nome_lead}}')) {
            v = v.replace(/\{\{nome_lead\}\}/g, variablesMap["nome_lead"] || "Cliente");
          }
          return v;
        }
      }
      return `{{${key}}}`; // mantém placeholder se não houver valor
    });
  }

  /**
   * Extrai um nome do lead a partir do telefone (implementação simplificada)
   * Em uma implementação real, isso poderia consultar um banco de dados de contatos
   */
  private extractLeadNameFromPhone(phone: string): string {
    // Por enquanto, retorna uma versão formatada do telefone
    // Em produção, isso deveria consultar uma base de contatos
    const cleanPhone = phone.replace(/\D/g, '');
    return `Lead ${cleanPhone.slice(-4)}`; // Últimos 4 dígitos
  }

  /**
   * Query MapeamentoIntencao for template mapping
   * Requirement: 4.2
   */
  private async findTemplateByIntent(
    intentName: string,
    inboxId: string
  ): Promise<any> {
    try {
      // Find the mapping using the unified model
      const mapping = await getPrismaInstance().mapeamentoIntencao.findFirst({
        where: {
          intentName,
          inbox: {
            inboxId: inboxId,
          },
        },
        include: {
          template: {
            include: {
              interactiveContent: {
                include: {
                  header: true,
                  body: true,
                  footer: true,
                  actionCtaUrl: true,
                  actionReplyButton: true,
                  actionList: true,
                  actionFlow: true,
                  actionLocationRequest: true,
                },
              },
              whatsappOfficialInfo: true,
            },
          },
        },
      });

      if (!mapping || !mapping.template) {
        return null;
      }

      return {
        id: mapping.id,
        customVariables: (mapping as any).customVariables, // Incluir variáveis customizadas
        template: {
          id: mapping.template.id,
          name: mapping.template.name,
          type: mapping.template.type as
            | "WHATSAPP_OFFICIAL"
            | "INTERACTIVE_MESSAGE"
            | "AUTOMATION_REPLY",
          simpleReplyText: mapping.template.simpleReplyText || undefined,
          interactiveContent: mapping.template.interactiveContent,
          whatsappOfficialInfo: mapping.template.whatsappOfficialInfo,
        },
      };
    } catch (error) {
      console.error(
        "[Intent Processor] Error finding template mapping:",
        error
      );
      throw error;
    }
  }

  /**
   * Template resolution logic supporting all template types
   * Priority: unified template > enhanced interactive > legacy template
   * Requirement: 4.4, 4.5
   */
  private async resolveTemplate(mapping: TemplateMapping): Promise<any> {
    const { template } = mapping;

    try {
      // Priority 1: WHATSAPP_OFFICIAL (unified template)
      if (
        template.type === "WHATSAPP_OFFICIAL" &&
        template.whatsappOfficialInfo
      ) {
        console.log(
          `[Intent Processor] Using WhatsApp Official template: ${template.name}`
        );
        return {
          type: "whatsapp_official",
          data: template.whatsappOfficialInfo,
          name: template.name,
        };
      }

      // Priority 2: INTERACTIVE_MESSAGE (enhanced interactive)
      if (
        template.type === "INTERACTIVE_MESSAGE" &&
        template.interactiveContent
      ) {
        console.log(
          `[Intent Processor] Using Interactive Message template: ${template.name}`
        );
        return {
          type: "interactive_message",
          data: template.interactiveContent,
          name: template.name,
        };
      }

      // Priority 3: AUTOMATION_REPLY (simple text)
      if (template.type === "AUTOMATION_REPLY" && template.simpleReplyText) {
        console.log(
          `[Intent Processor] Using Automation Reply template: ${template.name}`
        );
        return {
          type: "automation_reply",
          data: {
            text: template.simpleReplyText,
          },
          name: template.name,
        };
      }

      throw new Error(
        `No valid template content found for template: ${template.name}`
      );
    } catch (error) {
      console.error("[Intent Processor] Error resolving template:", error);
      throw error;
    }
  }

  /**
   * Build message content directly using WhatsAppPayloadBuilder
   * Simplified approach eliminating intermediary processing
   */
  private async buildMessageContent(
    resolvedTemplate: any,
    variables: {
      contactPhone: string;
      intentName: string;
      wamid: string;
      correlationId: string;
    },
    inboxId?: string,
    customVariables?: any
  ): Promise<any> {
    try {
      const { type, data, name } = resolvedTemplate;

      // Define available variables for substitution
      const variableMap = {
        "{{contact_phone}}": variables.contactPhone,
        "{{intent_name}}": variables.intentName,
        "{{wamid}}": variables.wamid,
        "{{correlation_id}}": variables.correlationId,
        "{{timestamp}}": new Date().toISOString(),
        "{{date}}": new Date().toLocaleDateString("pt-BR"),
        "{{time}}": new Date().toLocaleTimeString("pt-BR"),
      };

      console.log(`[Intent Processor] Building message content: ${name}`, {
        type,
        variables: Object.keys(variableMap),
        inboxId
      });

      // Create PayloadBuilder with variables resolver
      const payloadBuilder = new WhatsAppPayloadBuilder();
      if (inboxId) {
        await payloadBuilder.setVariablesFromInboxId(inboxId, {
          contactPhone: variables.contactPhone,
          wamid: variables.wamid,
          correlationId: variables.correlationId
        });
      }

      // Build message using PayloadBuilder with integrated variable resolution
      switch (type) {
        case "whatsapp_official":
          // Normalizar componentes (podem vir como objeto indexado) e aplicar variáveis customizadas
          let processedComponents = this.normalizeComponentsToArray(data.components || []);
          
          if (customVariables && typeof customVariables === 'object') {
            processedComponents = this.applyCustomVariablesToComponents(
              processedComponents, 
              customVariables,
              variables.contactPhone // Passar nome do lead para substituição
            );
          }
          
          // IMPORTANTE: Enviar o NOME do template (ex.: "pix") e NÃO o ID/metaTemplateId
          // Usar metaTemplateId apenas para resolver mídia quando necessário
          return await payloadBuilder.buildTemplatePayload(
            name || "default",
            data.language || "pt_BR",
            processedComponents,
            data.metaTemplateId // usado somente para media resolution no builder
          );

        case "interactive_message":
          return {
            type: "interactive",
            interactive: await payloadBuilder.buildInteractiveMessagePayload(data)
          };

        case "automation_reply":
          return await payloadBuilder.buildSimpleTextPayload(data.text);

        default:
          throw new Error(`Unknown template type: ${type}`);
      }
    } catch (error) {
      console.error(
        "[Intent Processor] Error building message content:",
        error
      );
      throw error;
    }
  }

  /**
   * Normaliza a estrutura de componentes (array ou objeto com chaves numéricas) para array ordenado
   */
  private normalizeComponentsToArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      const numericKeys = Object.keys(raw).filter((k) => /^\d+$/.test(k));
      if (numericKeys.length > 0) {
        return numericKeys.sort((a, b) => Number(a) - Number(b)).map((k) => raw[k]);
      }
    }
    return [];
  }

  /**
   * Build WhatsApp Official template message with variable substitution
   */
  private async buildWhatsAppOfficialMessage(
    data: any,
    variables: Record<string, string>,
    resolveAllVariables: (text: string) => Promise<string>
  ): Promise<any> {
    try {
      // Deep clone the template data
      const processedData = JSON.parse(JSON.stringify(data));

      // Process components for variable substitution
      if (processedData.components && Array.isArray(processedData.components)) {
        processedData.components = await Promise.all(
          processedData.components.map(async (component: any) => {
            if (component.type === "BODY" && component.text) {
              component.text = await resolveAllVariables(component.text);
            }
            if (component.type === "HEADER" && component.text) {
              component.text = await resolveAllVariables(component.text);
            }
            if (component.type === "FOOTER" && component.text) {
              component.text = await resolveAllVariables(component.text);
            }
            return component;
          })
        );
      }

      return {
        type: "template",
        template: {
          name: processedData.metaTemplateId || "default",
          language: {
            code: processedData.language || "pt_BR",
          },
          components: processedData.components || [],
        },
      };
    } catch (error) {
      console.error(
        "[Intent Processor] Error processing WhatsApp Official template:",
        error
      );
      throw error;
    }
  }

  /**
   * Build Interactive Message using WhatsAppPayloadBuilder (Whitelist approach)
   */
  private async buildInteractiveMessage(
    data: any, // O objeto interactiveContent vindo do banco
    variables: Record<string, string>,
    resolveAllVariables: (text: string) => Promise<string>
  ): Promise<any> {
    try {
      // 1. Resolve variáveis nos campos de texto da mensagem interativa
      const processedData = await this.resolveInteractiveMessageVariables(data, resolveAllVariables);
      
      // 2. Usa o PayloadBuilder para construir o payload limpo e seguro
      const payloadBuilder = new WhatsAppPayloadBuilder();
      const interactivePayload = payloadBuilder.buildInteractiveMessagePayload(processedData);

      // 3. Retorna o objeto final pronto para ser enviado
      return {
        type: "interactive",
        interactive: interactivePayload,
      };
    } catch (error) {
      console.error(
        "[Intent Processor] Erro ao construir mensagem interativa:",
        error
      );
      throw error;
    }
  }





  /**
   * Build text message with variable substitution
   */
  private async buildTextMessage(
    data: any,
    variables: Record<string, string>,
    resolveAllVariables: (text: string) => Promise<string>
  ): Promise<any> {
    try {
      const processedText = await resolveAllVariables(data.text);

      return {
        type: "text",
        text: {
          body: processedText,
        },
      };
    } catch (error) {
      console.error(
        "[Intent Processor] Erro ao construir mensagem de texto:",
        error
      );
      throw error;
    }
  }

  /**
   * Resolve variables in interactive message fields
   */
  private async resolveInteractiveMessageVariables(
    data: any,
    resolveAllVariables: (text: string) => Promise<string>
  ): Promise<any> {
    const processedData = JSON.parse(JSON.stringify(data)); // Deep clone

    // Resolve variables in header text
    if (processedData.header?.type === 'text' && processedData.header.content) {
      processedData.header.content = await resolveAllVariables(processedData.header.content);
    }

    // Resolve variables in body text
    if (processedData.body?.text) {
      processedData.body.text = await resolveAllVariables(processedData.body.text);
    }

    // Resolve variables in footer text
    if (processedData.footer?.text) {
      processedData.footer.text = await resolveAllVariables(processedData.footer.text);
    }

    // Resolve variables in button titles
    if (processedData.action?.buttons) {
      for (const button of processedData.action.buttons) {
        if (button.title) {
          button.title = await resolveAllVariables(button.title);
        }
      }
    }

    return processedData;
  }

  /**
   * Substitute variables in text content
   */
  private substituteVariables(
    text: string,
    variables: Record<string, string>
  ): string {
    let processedText = text;

    for (const [placeholder, value] of Object.entries(variables)) {
      processedText = processedText.replace(
        new RegExp(placeholder, "g"),
        value
      );
    }

    return processedText;
  }

  /**
   * Fallback handling when no mapping is found
   * Requirement: 4.5
   */
  private async handleNoMappingFallback(
    intentName: string,
    contactPhone: string,
    credentials: WhatsAppCredentials,
    correlationId: string,
    startTime: number
  ): Promise<WorkerResponse> {
    try {
      console.log(
        `[Intent Processor] Applying fallback for unmapped intent: ${intentName}`,
        {
          correlationId,
        }
      );

      // Send a generic fallback message
      const fallbackMessage = {
        type: "text",
        text: {
          body: `Desculpe, não consegui processar sua solicitação. Nossa equipe foi notificada. (Intent: ${intentName})`,
        },
      };

      const messageId = await whatsappApiManager.sendMessage(
        contactPhone,
        fallbackMessage,
        credentials,
        "fallback",
        correlationId
      );

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        messageId,
        processingTime,
        correlationId,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: `Fallback failed: ${errorMessage}`,
        processingTime,
        correlationId,
      };
    }
  }
}
