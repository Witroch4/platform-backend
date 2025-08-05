/**
 * Locale-specific normalization utilities
 * Requirements: 9.1
 */

/**
 * Portuguese-specific button title normalization
 * Requirements: 9.1
 */
export const PORTUGUESE_BUTTON_TITLES: { [key: string]: string } = {
  // Common action buttons
  rastrear: "Rastrear",
  pagamento: "Pagamento",
  cancelar: "Cancelar",
  confirmar: "Confirmar",
  ajuda: "Ajuda",
  suporte: "Suporte",
  contato: "Contato",
  informacoes: "Informações",
  detalhes: "Detalhes",
  opcoes: "Opções",
  configuracao: "Configuração",
  configuracoes: "Configurações",
  pedido: "Pedido",
  pedidos: "Pedidos",
  produto: "Produto",
  produtos: "Produtos",
  servico: "Serviço",
  servicos: "Serviços",
  entrega: "Entrega",
  devolucao: "Devolução",
  troca: "Troca",
  reembolso: "Reembolso",
  conta: "Conta",
  perfil: "Perfil",
  login: "Login",
  cadastro: "Cadastro",
  promocao: "Promoção",
  promocoes: "Promoções",
  desconto: "Desconto",
  descontos: "Descontos",
  catalogo: "Catálogo",
  cardapio: "Cardápio",
  menu: "Menu",
  horario: "Horário",
  horarios: "Horários",
  localizacao: "Localização",
  endereco: "Endereço",
  telefone: "Telefone",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
  loja: "Loja",
  comprar: "Comprar",
  vender: "Vender",
  alugar: "Alugar",
  reservar: "Reservar",
  agendar: "Agendar",
  marcar: "Marcar",
  desmarcar: "Desmarcar",
  reagendar: "Reagendar",
  avaliar: "Avaliar",
  avaliacao: "Avaliação",
  avaliacoes: "Avaliações",
  comentario: "Comentário",
  comentarios: "Comentários",
  feedback: "Feedback",
  reclamacao: "Reclamação",
  reclamacoes: "Reclamações",
  sugestao: "Sugestão",
  sugestoes: "Sugestões",
};

/**
 * Normalize accents from Portuguese text
 * Requirements: 9.1
 */
export function normalizePortugueseAccents(text: string): string {
  if (!text) return "";

  const accentMap: Record<string, string> = {
    á: "a",
    à: "a",
    ã: "a",
    â: "a",
    ä: "a",
    é: "e",
    è: "e",
    ê: "e",
    ë: "e",
    í: "i",
    ì: "i",
    î: "i",
    ï: "i",
    ó: "o",
    ò: "o",
    õ: "o",
    ô: "o",
    ö: "o",
    ú: "u",
    ù: "u",
    û: "u",
    ü: "u",
    ç: "c",
    ñ: "n",
    Á: "A",
    À: "A",
    Ã: "A",
    Â: "A",
    Ä: "A",
    É: "E",
    È: "E",
    Ê: "E",
    Ë: "E",
    Í: "I",
    Ì: "I",
    Î: "I",
    Ï: "I",
    Ó: "O",
    Ò: "O",
    Õ: "O",
    Ô: "O",
    Ö: "O",
    Ú: "U",
    Ù: "U",
    Û: "U",
    Ü: "U",
    Ç: "C",
    Ñ: "N",
  };

  return text.replace(
    /[áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ]/g,
    (match) => accentMap[match] || match
  );
}

/**
 * Apply Portuguese title case rules
 * Requirements: 9.1
 */
export function applyPortugueseTitleCase(text: string): string {
  if (!text) return "";

  // Normalize accents first
  const normalized = normalizePortugueseAccents(text.toLowerCase().trim());

  // Check if it's a known Portuguese button title
  if (PORTUGUESE_BUTTON_TITLES[normalized]) {
    return PORTUGUESE_BUTTON_TITLES[normalized];
  }

  // Apply standard title case (first letter uppercase, rest lowercase)
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Normalize Portuguese button title with proper capitalization
 * Requirements: 9.1
 */
export function normalizePortugueseButtonTitle(title: string): string {
  if (!title) return "";

  // Remove extra whitespace and invisible characters
  let normalized = title.replace(/\s+/g, " ").trim();

  // Remove invisible characters
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Apply Portuguese-specific normalization
  normalized = applyPortugueseTitleCase(normalized);

  return normalized;
}

/**
 * Get suggested Portuguese button titles based on context
 * Requirements: 9.1
 */
export function getSuggestedPortugueseButtonTitles(context: string): string[] {
  const contextLower = context.toLowerCase();
  const suggestions: string[] = [];

  // Order/Purchase context
  if (
    contextLower.includes("pedido") ||
    contextLower.includes("compra") ||
    contextLower.includes("order")
  ) {
    suggestions.push("Rastrear", "Cancelar", "Detalhes");
  }

  // Payment context
  if (
    contextLower.includes("pagamento") ||
    contextLower.includes("pagar") ||
    contextLower.includes("payment")
  ) {
    suggestions.push("Pagamento", "Confirmar", "Cancelar");
  }

  // Support context
  if (
    contextLower.includes("ajuda") ||
    contextLower.includes("suporte") ||
    contextLower.includes("help")
  ) {
    suggestions.push("Ajuda", "Contato", "Suporte");
  }

  // Product context
  if (
    contextLower.includes("produto") ||
    contextLower.includes("item") ||
    contextLower.includes("product")
  ) {
    suggestions.push("Detalhes", "Comprar", "Catálogo");
  }

  // Service context
  if (
    contextLower.includes("serviço") ||
    contextLower.includes("service") ||
    contextLower.includes("agendar")
  ) {
    suggestions.push("Agendar", "Horários", "Contato");
  }

  // Location context
  if (
    contextLower.includes("local") ||
    contextLower.includes("endereço") ||
    contextLower.includes("onde")
  ) {
    suggestions.push("Localização", "Endereço", "Contato");
  }

  // Default suggestions if no context matches
  if (suggestions.length === 0) {
    suggestions.push("Ajuda", "Contato", "Informações");
  }

  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

/**
 * Validate Portuguese button title format
 * Requirements: 9.1
 */
export function validatePortugueseButtonTitle(title: string): {
  isValid: boolean;
  normalized: string;
  suggestions: string[];
  issues: string[];
} {
  const issues: string[] = [];
  let normalized = title;

  if (!title || !title.trim()) {
    return {
      isValid: false,
      normalized: "",
      suggestions: ["Ajuda", "Contato", "Informações"],
      issues: ["Button title is empty"],
    };
  }

  // Normalize the title
  normalized = normalizePortugueseButtonTitle(title);

  // Check length (WhatsApp limit is 20 characters)
  if (normalized.length > 20) {
    issues.push(`Title too long: ${normalized.length} characters (max 20)`);
  }

  // Check for common issues
  if (normalized.length < 2) {
    issues.push("Title too short (minimum 2 characters)");
  }

  // Check for invalid characters
  if (/[<>{}[\]\\]/.test(normalized)) {
    issues.push("Contains invalid characters");
  }

  // Check for all caps (should be title case)
  if (normalized === normalized.toUpperCase() && normalized.length > 1) {
    issues.push("Should use title case instead of all caps");
  }

  // Check for all lowercase (should be title case)
  if (normalized === normalized.toLowerCase() && normalized.length > 1) {
    issues.push("Should use title case instead of all lowercase");
  }

  // Get suggestions based on the input
  const suggestions = getSuggestedPortugueseButtonTitles(normalized);

  return {
    isValid: issues.length === 0,
    normalized,
    suggestions,
    issues,
  };
}

/**
 * Common Portuguese abbreviations and their full forms
 * Requirements: 9.1
 */
export const PORTUGUESE_ABBREVIATIONS: Record<string, string> = {
  info: "Informações",
  config: "Configuração",
  tel: "Telefone",
  end: "Endereço",
  loc: "Localização",
  prod: "Produto",
  serv: "Serviço",
  pag: "Pagamento",
  ped: "Pedido",
  cat: "Catálogo",
  promo: "Promoção",
  desc: "Desconto",
  aval: "Avaliação",
  coment: "Comentário",
  sugest: "Sugestão",
  reclam: "Reclamação",
};

/**
 * Expand Portuguese abbreviations in button titles
 * Requirements: 9.1
 */
export function expandPortugueseAbbreviations(title: string): string {
  if (!title) return "";

  let expanded = title.toLowerCase();

  // Replace abbreviations with full forms
  Object.entries(PORTUGUESE_ABBREVIATIONS).forEach(([abbrev, full]) => {
    const regex = new RegExp(`\\b${abbrev}\\b`, "gi");
    expanded = expanded.replace(regex, full);
  });

  // Apply proper capitalization
  return applyPortugueseTitleCase(expanded);
}

/**
 * Locale-aware button title normalization
 * Requirements: 9.1
 */
export function normalizeButtonTitleForLocale(
  title: string,
  locale: string = "pt-BR"
): string {
  if (!title) return "";

  switch (locale.toLowerCase()) {
    case "pt-br":
    case "pt":
      return normalizePortugueseButtonTitle(title);

    case "en":
    case "en-us":
      // English normalization (basic title case)
      return title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();

    case "es":
    case "es-es":
      // Spanish normalization (similar to Portuguese but without ç)
      return (
        normalizePortugueseAccents(title).charAt(0).toUpperCase() +
        normalizePortugueseAccents(title).slice(1).toLowerCase()
      );

    default:
      // Default to basic title case
      return title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
  }
}

/**
 * Get locale-specific fallback button titles
 * Requirements: 9.1
 */
export function getLocaleFallbackButtons(locale: string = "pt-BR"): {
  help: string;
  contact: string;
  info: string;
} {
  switch (locale.toLowerCase()) {
    case "pt-br":
    case "pt":
      return {
        help: "Ajuda",
        contact: "Contato",
        info: "Informações",
      };

    case "en":
    case "en-us":
      return {
        help: "Help",
        contact: "Contact",
        info: "Information",
      };

    case "es":
    case "es-es":
      return {
        help: "Ayuda",
        contact: "Contacto",
        info: "Información",
      };

    default:
      return {
        help: "Help",
        contact: "Contact",
        info: "Info",
      };
  }
}
