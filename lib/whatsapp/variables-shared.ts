/**
 * Shared variable resolution helpers (isomorphic: safe for client and server)
 *
 * Supports named placeholders like {{order_id}} and also numeric {{1}} for
 * retrocompatibilidade. Preferimos SEMPRE nomes.
 */

export type VariablesMap = Record<string, string | number | undefined | null>;

/**
 * Resolve placeholders in a text using a provided variables map.
 * - Named placeholders: {{nome}}, {{order_id}}
 * - Numeric placeholders (legacy): {{1}}, {{2}}
 * - Special: {{nome_lead}} with fallbacks
 */
export function resolveTextWithVariables(
  text: string,
  vars: VariablesMap = {},
  options?: {
    leadName?: string;
    defaultLeadExampleName?: string; // usado em preview
  }
): string {
  if (!text || typeof text !== "string") return text;

  const variables: VariablesMap = { ...vars };

  // Special variable fallback chain for nome_lead
  const leadName =
    String(
      (variables["nome_lead"] ??
        variables["nome"] ??
        variables["name"] ??
        options?.leadName ??
        options?.defaultLeadExampleName ??
        "João") as any
    );

  // Replace all {{...}} occurrences
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey).trim();

    // Special handling
    if (key === "nome_lead") {
      return leadName;
    }

    // Named placeholder
    if (!/^\d+$/.test(key)) {
      const value = variables[key];
      if (value === undefined || value === null) return `{{${key}}}`; // keep placeholder when unknown
      return String(value);
    }

    // Numeric placeholder (legacy): try to map by index (1-based)
    const index = parseInt(key, 10);
    const numericValue = variables[key] ?? variables[index] ?? variables[`var_${index}`] ?? variables[`variavel_${index}`];
    if (numericValue === undefined || numericValue === null) return `{{${key}}}`;
    return String(numericValue);
  });
}

/**
 * Resolve a simple interactive message-like object used no preview.
 * Mantém tipagem livre para uso tanto no client quanto no server.
 */
export function resolveInteractiveMessagePreview(
  message: any,
  vars: VariablesMap = {},
  options?: { leadName?: string; defaultLeadExampleName?: string }
): any {
  if (!message || typeof message !== "object") return message;

  const resolved: any = JSON.parse(JSON.stringify(message));

  if (resolved.header?.type === "text" && resolved.header?.content) {
    resolved.header.content = resolveTextWithVariables(
      resolved.header.content,
      vars,
      options
    );
  }

  if (resolved.body?.text) {
    resolved.body.text = resolveTextWithVariables(
      resolved.body.text,
      vars,
      options
    );
  }

  if (resolved.footer?.text) {
    resolved.footer.text = resolveTextWithVariables(
      resolved.footer.text,
      vars,
      options
    );
  }

  // Buttons
  if (resolved.action?.buttons && Array.isArray(resolved.action.buttons)) {
    resolved.action.buttons = resolved.action.buttons.map((btn: any) => ({
      ...btn,
      title: btn?.title
        ? resolveTextWithVariables(btn.title, vars, options)
        : btn?.title,
    }));
  }

  return resolved;
}


