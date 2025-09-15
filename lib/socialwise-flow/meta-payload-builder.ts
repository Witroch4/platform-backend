import { METAVariablesResolver, METAVariableContext } from './variables-resolverMETA';
import { getPublicMediaUrl, isMetaMediaUrl } from '../whatsapp-media';

/**
 * METAPayloadBuilder
 *
 * Classe centralizada para construir payloads para a API do WhatsApp
 * usando a abordagem de whitelist (lista de inclusão), perfeitamente
 * alinhada com o schema Prisma do projeto.
 * 
 * Agora com suporte integrado para resolução de variáveis MTF Diamante.
 * Também suporta Instagram Quick Replies com validações específicas.
 */
export class METAPayloadBuilder {
  private variablesResolver?: METAVariablesResolver;
  private channelType: string = 'Channel::WhatsApp'; // Default para WhatsApp

  /**
   * Configura o resolvedor de variáveis para este builder
   */
  setVariablesResolver(resolver: METAVariablesResolver): void {
    this.variablesResolver = resolver;
    console.log('[META PayloadBuilder] Variables resolver configured');
  }

  /**
   * Configura o tipo de canal (WhatsApp ou Instagram)
   */
  setChannelType(channelType: string): void {
    this.channelType = channelType;
    console.log(`[META PayloadBuilder] Channel type set to: ${channelType}`);
  }

  /**
   * Configura o resolvedor de variáveis a partir de um inboxId
   */
  async setVariablesFromInboxId(inboxId: string, context: Partial<METAVariableContext> = {}): Promise<void> {
    console.log(`[META PayloadBuilder] Setting up variables resolver from inboxId: ${inboxId}`);
    this.variablesResolver = await METAVariablesResolver.fromInboxId(inboxId, context);
  }

  /**
   * Configura o resolvedor de variáveis a partir de um userId
   */
  setVariablesFromUserId(userId: string, context: Partial<METAVariableContext> = {}): void {
    console.log(`[META PayloadBuilder] Setting up variables resolver from userId: ${userId}`);
    this.variablesResolver = METAVariablesResolver.fromUserId(userId, context);
  }

  /**
   * Constrói o payload para uma mensagem interativa.
   * @param dbInteractiveContent - O objeto 'interactiveContent' vindo do Prisma com todos os 'includes'.
   * @returns O objeto 'interactive' formatado para a API.
   */
  public async buildInteractiveMessagePayload(dbInteractiveContent: any): Promise<any> {
    console.log('[META PayloadBuilder] Building interactive message payload');
    console.log('[META PayloadBuilder] Input data:', JSON.stringify(dbInteractiveContent, null, 2));
    
    if (!dbInteractiveContent || !dbInteractiveContent.body?.text) {
      throw new Error(
        "Conteúdo interativo inválido: o corpo da mensagem é obrigatório."
      );
    }

    // Resolve variables if resolver is configured
    let processedContent = dbInteractiveContent;
    if (this.variablesResolver) {
      console.log('[META PayloadBuilder] Resolving variables in interactive message');
      processedContent = await this.variablesResolver.resolveInteractiveMessage(dbInteractiveContent);
      console.log('[META PayloadBuilder] Variables resolved, processed data:', JSON.stringify(processedContent, null, 2));
    } else {
      console.log('[META PayloadBuilder] No variables resolver configured, using original data');
    }

    const interactivePayload: any = {
      body: {
        text: processedContent.body.text,
      },
    };

    // Preserve or detect interactive type for downstream converters (IG/FB)
    const detectInteractiveType = (): string | undefined => {
      try {
        const explicit = (processedContent as any)?.interactiveType as string | undefined;
        if (explicit) return explicit;
        // Quick heuristic
        const buttons = processedContent?.actionReplyButton?.buttons || [];
        const hasQR = Array.isArray(buttons) && buttons.some((b: any) => String(b?.content_type || '').toLowerCase() === 'text');
        if (hasQR) return 'quick_replies';
        const hasImage = processedContent?.header?.type === 'image' && !!processedContent?.header?.content;
        const hasCarousel = processedContent?.actionCarousel || (processedContent?.actionReplyButton?.elements && Array.isArray(processedContent.actionReplyButton.elements));
        if (hasCarousel) return 'carousel';
        if (hasImage && Array.isArray(buttons) && buttons.length > 2) return 'generic';
        if (Array.isArray(buttons) && buttons.length > 0) return 'button_template';
        if (processedContent?.actionList) return 'list';
        if (processedContent?.actionCtaUrl) return 'cta_url';
        if (processedContent?.actionFlow) return 'flow';
        if (processedContent?.actionLocationRequest) return 'location_request';
        return undefined;
      } catch {
        return undefined;
      }
    };
    const computedType = detectInteractiveType();
    // Note: interactiveType is used internally for downstream converters (IG/FB) but should not be in WhatsApp payload

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

    if (processedContent.actionCarousel) {
      interactivePayload.type = "carousel";
      interactivePayload.action = this._buildCarouselAction(
        processedContent.actionCarousel
      );
    } else if (processedContent.actionReplyButton) {
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

    console.log('[META PayloadBuilder] Interactive message payload built successfully');
    console.log('[META PayloadBuilder] Final payload:', JSON.stringify(interactivePayload, null, 2));
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
    console.log(`[META PayloadBuilder] Building text reply payload for message: ${messageId}`);
    console.log(`[META PayloadBuilder] Original text: "${text}"`);

    let resolvedText = text;
    if (this.variablesResolver) {
      console.log('[META PayloadBuilder] Resolving variables in text reply');
      resolvedText = await this.variablesResolver.resolveText(text);
    } else {
      console.log('[META PayloadBuilder] No variables resolver configured for text reply');
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

    console.log('[META PayloadBuilder] Text reply payload built successfully');
    console.log('[META PayloadBuilder] Final payload:', JSON.stringify(payload, null, 2));
    return payload;
  }

  /**
   * Constrói o payload para uma mensagem de texto simples.
   * @param text - O texto da mensagem.
   * @returns O payload completo da mensagem de texto.
   */
  public async buildSimpleTextPayload(text: string): Promise<any> {
    console.log(`[META PayloadBuilder] Building simple text payload`);
    console.log(`[META PayloadBuilder] Original text: "${text}"`);

    let resolvedText = text;
    if (this.variablesResolver) {
      console.log('[META PayloadBuilder] Resolving variables in simple text');
      resolvedText = await this.variablesResolver.resolveText(text);
    } else {
      console.log('[META PayloadBuilder] No variables resolver configured for simple text');
    }

    const payload = {
      type: "text",
      text: {
        body: resolvedText,
      },
    };

    console.log('[META PayloadBuilder] Simple text payload built successfully');
    console.log('[META PayloadBuilder] Final payload:', JSON.stringify(payload, null, 2));
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
    console.log(`[META PayloadBuilder] Building template payload: ${templateName}`);
    console.log(`[META PayloadBuilder] Input components:`, JSON.stringify(components, null, 2));

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

    console.log('[META PayloadBuilder] Template payload built successfully');
    console.log('[META PayloadBuilder] Final payload:', JSON.stringify(payload, null, 2));
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
        // Header content é opcional - se estiver vazio, não incluir no payload
        if (!dbHeader.content || dbHeader.content.trim() === '') {
          console.log('[META PayloadBuilder] Skipping empty header content');
          return null; // Retorna null para não incluir header vazio no payload
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
    const isMetaChannel = this.channelType === 'Channel::Instagram' || this.channelType === 'Channel::FacebookPage';
    return {
      buttons: dbAction.buttons.map((btn: any) => {
        // Caso QUICK REPLY (Instagram/Facebook): vem como { content_type: 'text', title, payload }
        if (btn?.content_type === 'text' && typeof btn?.title === 'string') {
          const payload = btn?.payload || btn?.id || '';
          if (isMetaChannel) {
            return {
              type: 'reply',
              reply: {
                id: payload,
                title: btn.title,
              },
              // Metadados apenas para Meta (Instagram/Facebook)
              payload,
              originalType: 'quick_reply' as const,
            };
          }
          // WhatsApp: não incluir chaves extras
          return {
            type: 'reply',
            reply: {
              id: payload,
              title: btn.title,
            },
          };
        }

        if (btn.type === "url" && btn.url) {
          // Botão URL (Instagram web_url ou similar)
          if (isMetaChannel) {
            return {
              type: "reply",
              reply: {
                id: btn.id,
                title: btn.title,
              },
              // Metadados apenas para Meta
              url: btn.url,
              originalType: "url" as const,
            };
          }
          // WhatsApp: sem metadados
          return {
            type: "reply",
            reply: {
              id: btn.id,
              title: btn.title,
            },
          };
        }

        // Botão reply padrão (WhatsApp / postback)
        const replyId = btn.id || btn.payload || '';
        if (isMetaChannel) {
          return {
            type: "reply",
            reply: {
              id: replyId,
              title: btn.title,
            },
            // Metadados apenas para Meta
            payload: btn.payload || btn.id || '',
            originalType: (btn.type as any) || 'reply',
          };
        }
        // WhatsApp: sem metadados
        return {
          type: "reply",
          reply: {
            id: replyId,
            title: btn.title,
          },
        };
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

  private _buildCarouselAction(dbAction: any): any {
    if (
      !dbAction.elements ||
      !Array.isArray(dbAction.elements) ||
      dbAction.elements.length === 0
    ) {
      throw new Error(
        "Ação de carrossel requer um array de 'elements' no payload JSON."
      );
    }

    return {
      elements: dbAction.elements.slice(0, 10).map((element: any) => {
        const mappedElement: any = {
          title: String(element.title || '').slice(0, 80),
        };

        // Subtitle support
        if (element.subtitle && String(element.subtitle).trim()) {
          mappedElement.subtitle = String(element.subtitle).slice(0, 80);
        }

        // Image URL support
        if (element.image_url && String(element.image_url).trim()) {
          mappedElement.image_url = String(element.image_url);
        }

        // Default action support
        if (element.default_action?.url) {
          mappedElement.default_action = {
            type: 'web_url',
            url: String(element.default_action.url),
            ...(element.default_action.messenger_extensions && { messenger_extensions: element.default_action.messenger_extensions }),
            ...(element.default_action.webview_height_ratio && { webview_height_ratio: element.default_action.webview_height_ratio }),
          };
        }

        // Buttons support (max 3 per element)
        if (element.buttons && Array.isArray(element.buttons) && element.buttons.length > 0) {
          mappedElement.buttons = element.buttons.slice(0, 3).map((btn: any) => {
            if (btn.type === "url" && btn.url) {
              return {
                type: "web_url",
                title: String(btn.title || '').slice(0, 20),
                url: String(btn.url),
                ...(btn.messenger_extensions && { messenger_extensions: btn.messenger_extensions }),
                ...(btn.webview_height_ratio && { webview_height_ratio: btn.webview_height_ratio }),
              };
            }

            // Postback button
            const replyId = btn.id || btn.payload || '';
            return {
              type: "postback",
              title: String(btn.title || '').slice(0, 20),
              payload: String(replyId),
            };
          });
        }

        return mappedElement;
      }),
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
                console.warn('[META PayloadBuilder] Falha ao obter public media URL do MinIO:', e);
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
      console.error('[META PayloadBuilder] Error transforming official components:', error);
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
