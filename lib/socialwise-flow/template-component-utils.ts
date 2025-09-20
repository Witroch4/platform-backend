export interface TemplateComponentLogger {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
}

export interface ResolveOptions {
  logger?: TemplateComponentLogger;
}

export interface ApplyOptions {
  logger?: TemplateComponentLogger;
}

export function normalizeComponentsToArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const numericKeys = Object.keys(raw).filter((key) => /^\d+$/.test(key));
    if (numericKeys.length > 0) {
      return numericKeys
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => raw[key]);
    }
  }
  return [];
}

export function resolveTemplateComponents(raw: any, options: ResolveOptions = {}): any[] {
  const { logger } = options;
  if (!raw) return [];

  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (error) {
      logger?.warn?.('Failed to parse WhatsApp template components JSON string', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  const publicMediaUrl = extractPublicMediaUrl(data);

  if (Array.isArray(data)) {
    const cloned = data.map(cloneComponent);
    if (publicMediaUrl) {
      (cloned as any).publicMediaUrl = publicMediaUrl;
    }
    return cloned;
  }

  if (data && typeof data === 'object') {
    const normalized = normalizeComponentsToArray(data);
    if (normalized.length > 0) {
      const cloned = normalized.map(cloneComponent);
      if (publicMediaUrl) {
        (cloned as any).publicMediaUrl = publicMediaUrl;
      }
      return cloned;
    }

    if (data.components) {
      return resolveTemplateComponents(data.components, options);
    }
  }

  return [];
}

export function applyCustomVariablesToComponents(
  rawComponents: any,
  customVariables: Record<string, any>,
  contactPhone: string,
  options: ApplyOptions = {}
): any[] {
  const { logger } = options;
  const list = normalizeComponentsToArray(rawComponents);
  const hasCustomVariables = customVariables && Object.keys(customVariables).length > 0;
  logger?.debug?.('Applying custom variables to WhatsApp template components', {
    componentsCount: Array.isArray(list) ? list.length : 0,
    hasCustomVariables,
  });

  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const processed = list.map((component) => {
    const processedComponent: any = cloneComponent(component);

    if (component?.type === 'BODY' && typeof component.text === 'string') {
      const params = buildTemplateParameters(
        component.text,
        customVariables,
        component.example
      );
      if (params.length > 0) {
        processedComponent.__resolvedBodyParams = params.map((param) => ({ ...param }));
      }
      processedComponent.text = replaceVariablesInTemplateText(
        component.text,
        Array.isArray(component.example?.body_text?.[0])
          ? component.example.body_text[0]
          : [],
        customVariables,
        contactPhone
      );
    }

    if (component?.type === 'HEADER' && component.format === 'TEXT' && typeof component.text === 'string') {
      const params = buildTemplateParameters(
        component.text,
        customVariables,
        component.example,
        true
      );
      if (params.length > 0) {
        processedComponent.__resolvedHeaderParams = params.map((param) => ({ ...param }));
      }
      processedComponent.text = replaceVariablesInTemplateText(
        component.text,
        Array.isArray(component.example?.header_text?.[0])
          ? component.example.header_text[0]
          : [],
        customVariables,
        contactPhone
      );
    }

    if (component?.type === 'BUTTONS' && Array.isArray(component.buttons)) {
      processedComponent.buttons = component.buttons.map((button: any) => {
        const clonedButton = cloneComponent(button);
        if (
          String(clonedButton?.type || '').toUpperCase() === 'COPY_CODE' &&
          customVariables?.coupon_code
        ) {
          clonedButton.coupon_code = String(customVariables.coupon_code);
        }
        return clonedButton;
      });
    }

    return processedComponent;
  });

  const originalArray = Array.isArray(rawComponents) ? rawComponents : list;
  if (originalArray && typeof originalArray === 'object' && (originalArray as any).publicMediaUrl) {
    (processed as any).publicMediaUrl = (originalArray as any).publicMediaUrl;
  }

  return processed;
}

function cloneComponent<T>(component: T): T {
  if (component && typeof component === 'object') {
    return { ...(component as any) };
  }
  return component;
}

function extractPublicMediaUrl(raw: any): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (typeof raw.publicMediaUrl === 'string') return raw.publicMediaUrl;
  if (raw.components && typeof raw.components === 'object') {
    return extractPublicMediaUrl(raw.components);
  }
  return undefined;
}

function buildTemplateParameters(
  text: string,
  customVariables: Record<string, any>,
  example: any,
  isHeader: boolean = false
): Array<{ type: 'text'; text: string; parameter_name?: string }> {
  if (!text) return [];

  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  if (matches.length === 0) return [];

  const namedParamsExample: Record<string, string> = {};
  if (example) {
    const namedArray =
      (example?.body_text_named_params as any[]) ||
      (example?.header_text_named_params as any[]) ||
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

  return matches.map((match, index) => {
    const rawKey = match.replace(/[{}]/g, '').trim();
    const isNumeric = /^\d+$/.test(rawKey);
    let value = '';

    if (!isNumeric && customVariables[rawKey] !== undefined) {
      value = String(customVariables[rawKey]);
    }

    if (!value && customVariables[`variavel_${index}`] !== undefined) {
      value = String(customVariables[`variavel_${index}`]);
    }

    if (!value && !isNumeric && namedParamsExample[rawKey] !== undefined) {
      value = String(namedParamsExample[rawKey]);
    }

    if (!value && positionalExamples[index] !== undefined) {
      value = String(positionalExamples[index]);
    }

    const param: { type: 'text'; text: string; parameter_name?: string } = {
      type: 'text',
      text: value,
    };

    if (!isNumeric) {
      param.parameter_name = rawKey;
    }

    return param;
  }).slice(0, isHeader ? 1 : undefined);
}

function replaceVariablesInTemplateText(
  text: string,
  exampleValues: string[],
  customVariables: Record<string, any>,
  contactPhone: string
): string {
  if (!text) return text;

  const variablesMap: Record<string, string> = {};

  Object.entries(customVariables || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      variablesMap[key] = String(value);
    }
  });

  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  matches.forEach((match, index) => {
    const rawKey = match.replace(/[{}]/g, '').trim();
    if (variablesMap[rawKey] === undefined && exampleValues[index] !== undefined) {
      variablesMap[rawKey] = String(exampleValues[index]);
    }
  });

  if (!variablesMap['nome_lead']) {
    variablesMap['nome_lead'] = extractLeadNameFromPhone(contactPhone);
  }

  return text.replace(/\{\{([^}]+)\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey).trim();
    const direct = variablesMap[key];
    if (direct !== undefined) {
      let value = String(direct);
      if (value.includes('{{nome_lead}}')) {
        value = value.replace(/\{\{nome_lead\}\}/g, variablesMap['nome_lead'] || 'Cliente');
      }
      return value;
    }
    const fallback = variablesMap[`variavel_${key}`];
    if (fallback !== undefined) {
      return String(fallback);
    }
    return `{{${key}}}`;
  });
}

function extractLeadNameFromPhone(phone: string): string {
  if (!phone) return 'Cliente';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return 'Cliente';
  const suffix = digits.slice(-4) || digits;
  return `Lead ${suffix}`;
}
