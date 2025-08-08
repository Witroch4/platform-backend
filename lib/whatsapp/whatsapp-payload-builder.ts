import { WhatsAppVariablesResolver, WhatsAppVariableContext } from './variables-resolverWP';

/**
 * WhatsAppPayloadBuilder
 *
 * Classe centralizada para construir payloads para a API do WhatsApp
 * usando a abordagem de whitelist (lista de inclusão), perfeitamente
 * alinhada com o schema Prisma do projeto.
 * 
 * Agora com suporte integrado para resolução de variáveis MTF Diamante.
 */
export class WhatsAppPayloadBuilder {
  private variablesResolver?: WhatsAppVariablesResolver;

  /**
   * Configura o resolvedor de variáveis para este builder
   */
  setVariablesResolver(resolver: WhatsAppVariablesResolver): void {
    this.variablesResolver = resolver;
    console.log('[WhatsApp PayloadBuilder] Variables resolver configured');
  }

  /**
   * Configura o resolvedor de variáveis a partir de um inboxId
   */
  async setVariablesFromInboxId(inboxId: string, context: Partial<WhatsAppVariableContext> = {}): Promise<void> {
    console.log(`[WhatsApp PayloadBuilder] Setting up variables resolver from inboxId: ${inboxId}`);
    this.variablesResolver = await WhatsAppVariablesResolver.fromInboxId(inboxId, context);
  }

  /**
   * Configura o resolvedor de variáveis a partir de um userId
   */
  setVariablesFromUserId(userId: string, context: Partial<WhatsAppVariableContext> = {}): void {
    console.log(`[WhatsApp PayloadBuilder] Setting up variables resolver from userId: ${userId}`);
    this.variablesResolver = WhatsAppVariablesResolver.fromUserId(userId, context);
  }

  /**
   * Constrói o payload para uma mensagem interativa.
   * @param dbInteractiveContent - O objeto 'interactiveContent' vindo do Prisma com todos os 'includes'.
   * @returns O objeto 'interactive' formatado para a API.
   */
  public async buildInteractiveMessagePayload(dbInteractiveContent: any): Promise<any> {
    console.log('[WhatsApp PayloadBuilder] Building interactive message payload');
    console.log('[WhatsApp PayloadBuilder] Input data:', JSON.stringify(dbInteractiveContent, null, 2));
    
    if (!dbInteractiveContent || !dbInteractiveContent.body?.text) {
      throw new Error(
        "Conteúdo interativo inválido: o corpo da mensagem é obrigatório."
      );
    }

    // Resolve variables if resolver is configured
    let processedContent = dbInteractiveContent;
    if (this.variablesResolver) {
      console.log('[WhatsApp PayloadBuilder] Resolving variables in interactive message');
      processedContent = await this.variablesResolver.resolveInteractiveMessage(dbInteractiveContent);
      console.log('[WhatsApp PayloadBuilder] Variables resolved, processed data:', JSON.stringify(processedContent, null, 2));
    } else {
      console.log('[WhatsApp PayloadBuilder] No variables resolver configured, using original data');
    }

    const interactivePayload: any = {
      body: {
        text: processedContent.body.text,
      },
    };

    if (processedContent.header) {
      interactivePayload.header = this._buildHeader(
        processedContent.header
      );
    }

    if (processedContent.footer?.text) {
      interactivePayload.footer = {
        text: processedContent.footer.text,
      };
    }

    if (processedContent.actionReplyButton) {
      interactivePayload.type = "button";
      interactivePayload.action = this._buildButtonAction(
        processedContent.actionReplyButton
      );
    } else if (processedContent.actionList) {
      interactivePayload.type = "list";
      interactivePayload.action = this._buildListAction(
        processedContent.actionList
      );
    } else if (processedContent.actionCtaUrl) {
      interactivePayload.type = "cta_url";
      interactivePayload.action = this._buildCtaUrlAction(
        processedContent.actionCtaUrl
      );
    } else if (processedContent.actionFlow) {
      interactivePayload.type = "flow";
      interactivePayload.action = this._buildFlowAction(
        processedContent.actionFlow
      );
    } else if (processedContent.actionLocationRequest) {
      // Location request usa um botão simples que solicita localização
      interactivePayload.type = "button";
      interactivePayload.action = {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "send_location",
              title:
                dbInteractiveContent.actionLocationRequest.requestText ||
                "Enviar Localização",
            },
          },
        ],
      };
    } else {
      throw new Error(
        "Ação interativa não reconhecida ou ausente no 'interactiveContent'."
      );
    }

    console.log('[WhatsApp PayloadBuilder] Interactive message payload built successfully');
    console.log('[WhatsApp PayloadBuilder] Final payload:', JSON.stringify(interactivePayload, null, 2));
    return interactivePayload;
  }

  /**
   * Constrói o payload para uma reação com emoji.
   * @param messageId - O ID da mensagem (wamid) à qual reagir.
   * @param emoji - O emoji a ser enviado.
   * @returns O payload completo da mensagem de reação.
   */
  public buildReactionPayload(messageId: string, emoji: string): any {
    return {
      type: "reaction",
      reaction: {
        message_id: messageId,
        emoji: emoji,
      },
    };
  }

  /**
   * Constrói o payload para uma resposta de texto contextual.
   * @param messageId - O ID da mensagem (wamid) a ser respondida.
   * @param text - O texto da resposta.
   * @returns O payload completo da mensagem de texto contextual.
   */
  public async buildTextReplyPayload(messageId: string, text: string): Promise<any> {
    console.log(`[WhatsApp PayloadBuilder] Building text reply payload for message: ${messageId}`);
    console.log(`[WhatsApp PayloadBuilder] Original text: "${text}"`);

    let resolvedText = text;
    if (this.variablesResolver) {
      console.log('[WhatsApp PayloadBuilder] Resolving variables in text reply');
      resolvedText = await this.variablesResolver.resolveText(text);
    } else {
      console.log('[WhatsApp PayloadBuilder] No variables resolver configured for text reply');
    }

    const payload = {
      context: {
        message_id: messageId,
      },
      type: "text",
      text: {
        body: resolvedText,
      },
    };

    console.log('[WhatsApp PayloadBuilder] Text reply payload built successfully');
    console.log('[WhatsApp PayloadBuilder] Final payload:', JSON.stringify(payload, null, 2));
    return payload;
  }

  /**
   * Constrói o payload para uma mensagem de texto simples.
   * @param text - O texto da mensagem.
   * @returns O payload completo da mensagem de texto.
   */
  public async buildSimpleTextPayload(text: string): Promise<any> {
    console.log(`[WhatsApp PayloadBuilder] Building simple text payload`);
    console.log(`[WhatsApp PayloadBuilder] Original text: "${text}"`);

    let resolvedText = text;
    if (this.variablesResolver) {
      console.log('[WhatsApp PayloadBuilder] Resolving variables in simple text');
      resolvedText = await this.variablesResolver.resolveText(text);
    } else {
      console.log('[WhatsApp PayloadBuilder] No variables resolver configured for simple text');
    }

    const payload = {
      type: "text",
      text: {
        body: resolvedText,
      },
    };

    console.log('[WhatsApp PayloadBuilder] Simple text payload built successfully');
    console.log('[WhatsApp PayloadBuilder] Final payload:', JSON.stringify(payload, null, 2));
    return payload;
  }

  /**
   * Constrói o payload para uma mensagem de template oficial do WhatsApp.
   * @param templateName - Nome do template aprovado.
   * @param languageCode - Código do idioma (ex: pt_BR).
   * @param components - Componentes do template com parâmetros.
   * @returns O payload completo da mensagem de template.
   */
  public async buildTemplatePayload(
    templateName: string,
    languageCode: string = "pt_BR",
    components: any[] = []
  ): Promise<any> {
    console.log(`[WhatsApp PayloadBuilder] Building template payload: ${templateName}`);
    console.log(`[WhatsApp PayloadBuilder] Original components:`, JSON.stringify(components, null, 2));

    let resolvedComponents = components;
    if (this.variablesResolver && components.length > 0) {
      console.log('[WhatsApp PayloadBuilder] Resolving variables in template components');
      resolvedComponents = await this.variablesResolver.resolveTemplateComponents(components);
    } else {
      console.log('[WhatsApp PayloadBuilder] No variables resolver configured or no components for template');
    }

    const payload = {
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components: resolvedComponents,
      },
    };

    console.log('[WhatsApp PayloadBuilder] Template payload built successfully');
    console.log('[WhatsApp PayloadBuilder] Final payload:', JSON.stringify(payload, null, 2));
    return payload;
  }

  // ============================================================================
  // MÉTODOS PRIVADOS AUXILIARES AJUSTADOS
  // ============================================================================

  private _buildHeader(dbHeader: any): any {
    const header: any = { type: dbHeader.type };

    switch (dbHeader.type) {
      case "text":
        if (!dbHeader.content)
          throw new Error("Header de texto requer o campo 'content'.");
        header.text = dbHeader.content;
        break;
      case "image":
      case "video":
      case "document":
        if (!dbHeader.content)
          throw new Error(
            `Header de ${dbHeader.type} requer o campo 'content' com a URL.`
          );
        header[dbHeader.type] = { link: dbHeader.content };
        break;
      default:
        throw new Error(`Tipo de header desconhecido: ${dbHeader.type}`);
    }
    return header;
  }

  private _buildButtonAction(dbAction: any): any {
    if (
      !dbAction.buttons ||
      !Array.isArray(dbAction.buttons) ||
      dbAction.buttons.length === 0
    ) {
      throw new Error(
        "Ação de botão requer um array de 'buttons' no payload JSON."
      );
    }
    return {
      buttons: dbAction.buttons.map((btn: any) => ({
        type: "reply",
        reply: {
          id: btn.id,
          title: btn.title,
        },
      })),
    };
  }

  private _buildListAction(dbAction: any): any {
    if (
      !dbAction.buttonText ||
      !dbAction.sections ||
      !Array.isArray(dbAction.sections) ||
      dbAction.sections.length === 0
    ) {
      throw new Error(
        "Ação de lista requer 'buttonText' e um array de 'sections'."
      );
    }
    return {
      button: dbAction.buttonText,
      sections: dbAction.sections.map((sec: any) => ({
        title: sec.title,
        rows: sec.rows.map((row: any) => ({
          id: row.id,
          title: row.title,
          ...(row.description && { description: row.description }),
        })),
      })),
    };
  }

  private _buildCtaUrlAction(dbAction: any): any {
    if (!dbAction.displayText || !dbAction.url) {
      throw new Error("Ação CTA URL requer 'displayText' e 'url'.");
    }
    return {
      name: "cta_url",
      parameters: {
        display_text: dbAction.displayText,
        url: dbAction.url,
      },
    };
  }

  private _buildFlowAction(dbAction: any): any {
    if (!dbAction.flowId || !dbAction.flowCta) {
      throw new Error("Ação de Flow requer 'flowId' e 'flowCta'.");
    }

    const flowActionPayload = {
      screen: "WELCOME_SCREEN", // Tela inicial padrão
      ...(dbAction.flowData && { data: dbAction.flowData }),
    };

    return {
      name: "flow",
      parameters: {
        flow_message_version: "3",
        flow_id: dbAction.flowId,
        flow_token: `token_${Date.now()}`,
        flow_cta: dbAction.flowCta,
        flow_action: "navigate",
        flow_action_payload: flowActionPayload,
        mode: dbAction.flowMode || "published", // Usa flowMode do schema
      },
    };
  }
}
