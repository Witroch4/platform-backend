import { WhatsAppVariablesResolver, WhatsAppVariableContext } from './variables-resolverWP';
import { getPublicMediaUrl, isMetaMediaUrl } from '../whatsapp-media';

/**
 * WhatsAppPayloadBuilder
 *
 * Classe centralizada para construir payloads para a API do WhatsApp
 * usando a abordagem de whitelist (lista de inclusão), perfeitamente
 * alinhada com o schema Prisma do projeto.
 * 
 * Agora com suporte integrado para resolução de variáveis MTF Diamante.
 * Também suporta Instagram Quick Replies com validações específicas.
 */
export class WhatsAppPayloadBuilder {
  private variablesResolver?: WhatsAppVariablesResolver;
  private channelType: string = 'Channel::WhatsApp'; // Default para WhatsApp

  /**
   * Configura o resolvedor de variáveis para este builder
   */
  setVariablesResolver(resolver: WhatsAppVariablesResolver): void {
    this.variablesResolver = resolver;
    console.log('[WhatsApp PayloadBuilder] Variables resolver configured');
  }

  /**
   * Configura o tipo de canal (WhatsApp ou Instagram)
   */
  setChannelType(channelType: string): void {
    this.channelType = channelType;
    console.log(`[WhatsApp PayloadBuilder] Channel type set to: ${channelType}`);
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
      const builtHeader = this._buildHeader(processedContent.header);
      if (builtHeader) {
        interactivePayload.header = builtHeader;
      }
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
    components: any[] = [],
    metaTemplateId?: string
  ): Promise<any> {
    console.log(`[WhatsApp PayloadBuilder] Building template payload: ${templateName}`);
    console.log(`[WhatsApp PayloadBuilder] Input components:`, JSON.stringify(components, null, 2));

    // Transformar componentes salvos (definição do template) no formato de envio aceito pela Meta
    const metaComponents = await this._transformOfficialTemplateComponents(
      metaTemplateId,
      components
    );

    const payload = {
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: metaComponents,
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
    const isInstagram = this.channelType === 'Channel::Instagram';

    switch (dbHeader.type) {
      case "text":
        // Para Instagram Quick Replies, header content é opcional
        if (!dbHeader.content) {
          if (isInstagram) {
            console.log('[WhatsApp PayloadBuilder] Instagram: skipping empty header content');
            return null; // Retorna null para não incluir header vazio no payload
          } else {
            throw new Error("Header de texto requer o campo 'content'.");
          }
        }
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
      buttons: dbAction.buttons.map((btn: any) => {
        // Preservar o tipo original do botão
        if (btn.type === "url" && btn.url) {
          // Botão URL (Instagram web_url ou similar)
          return {
            type: "reply",
            reply: {
              id: btn.id,
              title: btn.title,
            },
            // Preservar URL no payload para conversão posterior
            url: btn.url,
            originalType: "url"
          };
        } else {
          // Botão reply padrão
          return {
            type: "reply",
            reply: {
              id: btn.id,
              title: btn.title,
            },
          };
        }
      }),
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

  /**
   * Converte o JSON salvo em `WhatsAppOfficialInfo.components` no formato aceito pela Cloud API:
   * - HEADER com parameters (image/video/document/text)
   * - BODY com parameters (quando aplicável). Neste ajuste, mantemos sem parameters se não houver variáveis.
   * - BUTTON com sub_type (ex.: copy_code) + parameters
   */
  private async _transformOfficialTemplateComponents(
    metaTemplateId: string | undefined,
    rawComponents: any
  ): Promise<any[]> {
    try {
      // Normalizar entrada: pode vir como array, objeto indexado ("0","1",...) ou objeto com campos auxiliares
      const list: any[] = this._normalizeComponentsToArray(rawComponents);

      // Opcional: resolver textos (apenas para uso em parâmetros text quando necessário)
      let resolvedList = list;
      if (this.variablesResolver && Array.isArray(list) && list.length > 0) {
        resolvedList = await this.variablesResolver.resolveTemplateComponents(list);
      }

      const resultComponents: any[] = [];

      // HEADER
      const headerIndex = resolvedList.findIndex((c) =>
        String(c?.type || '').toUpperCase() === 'HEADER'
      );
      if (headerIndex >= 0) {
        const header = resolvedList[headerIndex];
        const format = String(header.format || header.headerFormat || '').toUpperCase();

        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
          let publicUrl: string | null = null;

          // 1) Tentar publicMediaUrl no objeto bruto (top-level) ou no próprio header
          const embeddedPublicUrl = this._extractPublicMediaUrl(rawComponents) || header.publicMediaUrl;
          if (embeddedPublicUrl && !isMetaMediaUrl(embeddedPublicUrl)) {
            publicUrl = embeddedPublicUrl;
          }

          // 2) Se não houver publicUrl, tentar baixar da Meta e subir no MinIO
          if (!publicUrl) {
            const exampleUrl = header?.example?.header_handle?.[0];
            const userId = this.variablesResolver?.getUserId() || '';
            if (userId && exampleUrl) {
              try {
                // metaTemplateId é preferido; como fallback, usa o próprio link (hash) para chavear o upload
                publicUrl = await getPublicMediaUrl(metaTemplateId || exampleUrl, userId, exampleUrl);
              } catch (e) {
                console.warn('[WhatsApp PayloadBuilder] Falha ao obter public media URL do MinIO:', e);
              }
            }
          }

          if (publicUrl) {
            const mediaType = format.toLowerCase(); // image|video|document
            resultComponents.push({
              type: 'header',
              parameters: [
                {
                  type: mediaType,
                  [mediaType]: { link: publicUrl },
                },
              ],
            });
          } else if (format === 'TEXT' && header.text) {
            // fallback para texto, se for o caso, mas permite parâmetros resolvidos
            const rawHeaderParams = Array.isArray((header as any).__resolvedHeaderParams)
              ? (header as any).__resolvedHeaderParams
              : [
                  {
                    type: 'text',
                    text: String(header.text),
                  },
                ];
            // Suportar named parameters no HEADER quando o template foi criado com NAMED
            const headerParams = rawHeaderParams.map((p: any) => {
              const param: any = {
                type: 'text',
                text: String(p?.text ?? ''),
              };
              if (typeof p?.parameter_name === 'string' && p.parameter_name) {
                // manter parameter_name conforme definido no template (minúsculas/underscore)
                param.parameter_name = String(p.parameter_name).trim();
              }
              return param;
            });
            resultComponents.push({
              type: 'header',
              parameters: headerParams,
            });
          }
        } else if (format === 'TEXT' && header.text) {
          const rawHeaderParams = Array.isArray((header as any).__resolvedHeaderParams)
            ? (header as any).__resolvedHeaderParams
            : [
                {
                  type: 'text',
                  text: String(header.text),
                },
              ];
          // Suportar named parameters no HEADER quando presente
          const headerParams = rawHeaderParams.map((p: any) => {
            const param: any = {
              type: 'text',
              text: String(p?.text ?? ''),
            };
            if (typeof p?.parameter_name === 'string' && p.parameter_name) {
              param.parameter_name = String(p.parameter_name).trim();
            }
            return param;
          });
          resultComponents.push({
            type: 'header',
            parameters: headerParams,
          });
        }
      }

      // BODY com parameters (se fornecidos pelo processor)
      const body = resolvedList.find((c) => String(c?.type || '').toUpperCase() === 'BODY');
      if (body) {
        const bodyComponent: any = { type: 'body' };
        if (Array.isArray((body as any).__resolvedBodyParams) && (body as any).__resolvedBodyParams.length > 0) {
          // BODY aceita named parameters quando o template usa named placeholders
          bodyComponent.parameters = (body as any).__resolvedBodyParams.map((p: any) => {
            const param: any = {
              type: 'text',
              text: String(p?.text ?? ''),
            };
            if (typeof p?.parameter_name === 'string' && p.parameter_name) {
              // garantir lowercase e underscores
              param.parameter_name = String(p.parameter_name).trim();
            }
            return param;
          });
        }
        resultComponents.push(bodyComponent);
      }

      // BUTTONS
      const buttonsComp = resolvedList.find(
        (c) => String(c?.type || '').toUpperCase() === 'BUTTONS'
      );
      if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
        const buttons = buttonsComp.buttons as any[];
        let buttonIndex = 0;
        for (const btn of buttons) {
          const btnType = String(btn.type || '').toUpperCase();
          if (btnType === 'COPY_CODE') {
            // Preferir valor customizado (btn.coupon_code) e usar example[0] como fallback
            const couponCode = (btn.coupon_code && String(btn.coupon_code)) || (Array.isArray(btn.example) && btn.example[0]) || '';
            resultComponents.push({
              type: 'button',
              sub_type: 'copy_code',
              index: Number(buttonIndex),
              parameters: [
                {
                  type: 'coupon_code',
                  coupon_code: String(couponCode || ''),
                },
              ],
            });
          } else {
            // Não enviar componentes de botão que não exigem parâmetros (ex.: QUICK_REPLY)
          }
          buttonIndex += 1;
        }
      }

      return resultComponents;
    } catch (error) {
      console.error('[WhatsApp PayloadBuilder] Error transforming official components:', error);
      // Em caso de erro, retornar payload mínimo para evitar chaves inválidas
      return [{ type: 'body' }];
    }
  }

  private _normalizeComponentsToArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      // Se possuir chaves numéricas ("0","1",...), ordenar e extrair
      const numericKeys = Object.keys(raw).filter((k) => /^\d+$/.test(k));
      if (numericKeys.length > 0) {
        return numericKeys
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => raw[k]);
      }
    }
    return [];
  }

  private _extractPublicMediaUrl(raw: any): string | null {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.publicMediaUrl === 'string') return raw.publicMediaUrl;
    // às vezes salvo dentro de components.root
    if (raw.components && typeof raw.components === 'object') {
      const candidate = (raw.components as any).publicMediaUrl;
      if (typeof candidate === 'string') return candidate;
    }
    return null;
  }
}
