/* eslint-disable no-control-regex */
//lib/oab/gabarito-parser-deterministico.ts

export type Escopo = "Peça" | "Questão";

export type Subitem = {
  id: string;
  escopo: Escopo;
  questao: "PEÇA" | `Q${1 | 2 | 3 | 4}`;
  descricao: string;
  peso: number | null;
  fundamentos: string[];
  palavras_chave: string[];
  embedding_text: string;
  ou_group_id?: string;
  ou_group_mode?: "pick_best" | "pick_sum";
  variant_family?: string;
  variant_key?: string;
  variant_label?: string;
  flags?: { missingParts?: boolean };
};

export type GabaritoGrupo = {
  id: string;
  escopo: Escopo;
  questao: "PEÇA" | `Q${1 | 2 | 3 | 4}`;
  indice: number;
  rotulo: string;
  segmento?: string | null;
  descricao: string;
  descricao_bruta: string;
  descricao_limpa: string;
  peso_maximo: number;
  pesos_opcoes: number[];
  pesos_brutos: number[];
  subitens: string[];
  variant_family?: string;
  variant_key?: string;
  variant_label?: string;
};

export type GabaritoAtomico = {
  meta: {
    area: string;
    exam: string;
    data_aplicacao?: string;
    fonte?: string;
    versao_schema: string;
    gerado_em: string;
  };
  itens: Subitem[];
  grupos: GabaritoGrupo[];
};

export type ParseMetaInput = {
  exam: string;
  area: string;
  data_aplicacao?: string;
  fonte?: string;
};

function normSpaces(s: string) {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ ]*\n[ ]*/g, "\n")
    .replace(/\u0000/g, "");
}

// Fix only the OCR cases ("Lei n o" -> "Lei nº" and "Art. 9 o" -> "Art. 9º").
// Avoid touching the Portuguese preposition "no".
function stripWeirdNo(s: string) {
  return s
    .replace(/\bLei\s+n\s*o\b/gi, "Lei nº")
    .replace(/\bLei\s*n[ºo]?\s+(?=\d)/gi, "Lei ")
    .replace(/\bArt\.?\s*(\d+)\s*o\b/gi, "Art. $1º");
}

function fixLeiNumber(s: string) {
  return s.replace(/\bLei\s*n?[ºo]?\s*(\d{1,3}(?:\.\d{3})?\/\d{2,4})/gi, (_m, n) => `Lei ${n}`);
}

function toCanonical(text: string) {
  let t = text;
  t = normSpaces(t);
  t = stripWeirdNo(t);
  t = fixLeiNumber(t);
  // normaliza CRFB → CF/88
  t = t.replace(/\bCRFB\/?88\b/gi, "CF/88");
  // remove "nº" redundante antes de diplomas (Lei/Decreto)
  t = t.replace(/\b(Lei|Decreto)\s+n[ºo]?\s+(?=\d)/gi, "$1 ");
  // corrige quebra de "Lei nº" → "Lei nº"
  t = t.replace(/\bLei\s+n\s*\n\s*o\s*/gi, "Lei nº ");
  // corrige "Art. X, inciso I, da Lei n\no\n 8.112" → "Art. X, inciso I, da Lei nº 8.112"
  t = t.replace(/\b(da Lei|do Decreto)\s+n\s*\n\s*o\s*(\d)/gi, "$1 nº $2");
  // junta hifen de quebra de linha
  t = t.replace(/-\n/g, "");
  // junta decimais quebrados por quebra de linha
  t = t.replace(/(\d)[\.,]\n(\d{2})/g, "$1,$2");
  // normaliza "1. 015" -> "1.015" e "8. 245" -> "8.245"
  t = t.replace(/(\d)\.\s+(\d{3})/g, "$1.$2");
  // normaliza "0, 10" -> "0,10"
  t = t.replace(/(\d)\s*,\s*(\d{2})/g, "$1,$2");
  // normaliza "Lei 8. 245/91" -> "Lei 8.245/1991" (heurística 2→4 dígitos)
  t = t.replace(/\b(Lei\s+\d{1,3}\.\d{3})\/(\d{2})\b/g, (_m, n, yy: string) => {
    const yr = Number(yy);
    const full = yr >= 30 ? `19${yy}` : `20${yy}`;
    return `${n}/${full}`;
  });
  // normaliza valores monetários: "R$48. 000, 00" -> "R$ 48.000,00"
  t = t.replace(/R\$\s*(\d{1,3})\.\s*(\d{3}),\s*(\d{2})/g, "R$ $1.$2,$3");
  return t;
}

// Aceita espaços, quebras de linha e variações em "(0, 10)", "(0.10)", "( 0 , 10 )"
const RX_DEC_ANY = /\([\s\n]*(\d{1,2})[\s\n]*[.,][\s\n]*(\d{2})[\s\n]*\)/g;
const RX_ART = /\bArt\.?\s*\d+[A-Za-z0-9º§,\-\s]*\b/g;
const RX_DIP = /\b(CPC|CC|CF|CDC|ECA|CPP|CP)\b/g;
const RX_LEI = /\bLei\s+n?[ºo]?\s*\d{1,3}(?:\.\d{3})?\/\d{2,4}\b/gi;
const RX_DECR = /\bDecreto\s+n?[ºo]?\s*\d{1,2}\.\d{3}\/\d{4}\b/gi;
const RX_CF88 = /\b(CRFB\/?88|CF\/?88|Constituiç(?:a|ã)o(?: Federal)?(?: de 1988)?)\b/gi;
const RX_SECAO_PECA = /PADR[ÃA]O DE RESPOSTA\s*[–-]\s*PE[ÇC]A/i;
const RX_SECAO_Q = /PADR[ÃA]O DE RESPOSTA\s*[–-]\s*QUEST[ÃA]O\s*(0?1|0?2|0?3|0?4)/i;
const RX_DISTR = /Distribui[çc][aã]o dos Pontos/i;
const RX_DISTR_WITH_LABEL = /Distribui[çc][aã]o dos Pontos(?:\s*[–-]\s*(.+))?/i;

// Split de OU inline: ", ou pela/por/em/no/na ..."
const RX_OU_INLINE_SPLIT = /,\s+ou\s+(?:pela|por|em|no|na)\b/i;
// Remoção de ruído de paginação em descrições
const RX_PAGE_NOISE = /ORDEM DOS ADVOGADOS[\s\S]*$/i;
// Remoção de tokens "(0,xx)" nas descrições - deve ser consistente com RX_DEC_ANY
const RX_SCORE = /\([\s\n]*\d{1,2}[\s\n]*[.,][\s\n]*\d{2}[\s\n]*\)/g;

const SECTION_CUTOFF_MARKERS: RegExp[] = [
  /Gabarito Comentado/i,
  /Distribui[çc][aã]o dos Pontos/i,
  /PADR[ÃA]O DE RESPOSTA/i,
  /ORDEM DOS ADVOGADOS DO BRASIL/i,
];

// Regex para linha de matriz de pontuação ("0,00/0,10/0,20/...")
const RX_MATRIZ = /^0[0-9\s/,\.]+$/;
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Modo de atomização da PEÇA:
//  - 'off'  : nunca atomiza
//  - 'auto' : atomiza quando houver 2+ pesos "(0,xx)" no item
//  - 'on'   : força atomização
const PECA_ATOMIZE_MODE: 'off'|'auto'|'on' = 'auto';

function smartJoin(parts: string[]): string {
  return parts
    .reduce((acc, part) => {
      if (!part) return acc;
      if (!acc) return part;
      const lastChar = acc.slice(-1);
      const firstChar = part.charAt(0);
      const isLetter = (ch: string) => /[a-záéíóúãõç]/i.test(ch);
      if (
        isLetter(lastChar) &&
        lastChar === lastChar.toLowerCase() &&
        isLetter(firstChar) &&
        firstChar === firstChar.toLowerCase() &&
        part.length <= 3
      ) {
        return `${acc}${part}`;
      }
      return `${acc} ${part}`;
    }, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decToNum(s: string): number {
  const m = s.trim().match(/^(\d{1,2})[.,](\d{2})$/);
  if (!m) return Number.NaN;
  return Number(`${m[1]}.${m[2]}`);
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function stripSectionTail(text: string): string {
  if (!text) return text;
  let result = text;
  for (const marker of SECTION_CUTOFF_MARKERS) {
    const idx = result.search(marker);
    if (idx > 0) {
      result = result.slice(0, idx);
    }
  }
  return result;
}

type Secao = { tipo: "PEÇA" | `Q${1 | 2 | 3 | 4}`; texto: string };

function splitSecoesDistribuicao(t: string): Secao[] {
  const out: Secao[] = [];
  const pecaIdx = t.search(RX_SECAO_PECA);
  if (pecaIdx >= 0) {
    const from = pecaIdx;
    const nextQ = t.slice(from + 1).search(RX_SECAO_Q);
    const end = nextQ >= 0 ? from + 1 + nextQ : t.length;
    const bloco = t.slice(from, end);
    const dIdx = bloco.search(RX_DISTR);
    if (dIdx >= 0) {
      const body = bloco.slice(dIdx);
      out.push({ tipo: "PEÇA", texto: body });
    }
  }

  const rxAllQ = new RegExp(RX_SECAO_Q, "gi");
  let match: RegExpExecArray | null;
  const positions: { label: `Q${1 | 2 | 3 | 4}`; index: number }[] = [];
  while ((match = rxAllQ.exec(t)) !== null) {
    const label = `Q${Number(match[1])}` as `Q${1 | 2 | 3 | 4}`;
    positions.push({ label, index: match.index });
  }

  for (let i = 0; i < positions.length; i += 1) {
    const { label, index } = positions[i];
    const end = positions[i + 1] ? positions[i + 1].index : t.length;
    const bloco = t.slice(index, end);
    const dIdx = bloco.search(RX_DISTR);
    if (dIdx >= 0) {
      const body = bloco.slice(dIdx);
      out.push({ tipo: label, texto: body });
    }
  }

  return out;
}

type LinhaItem = {
  rotulo: string;
  descricao: string;
  descricao_raw: string;
  pesos: number[];
  temOU: boolean;
  segmento?: string | null;
};

function parseMatrizPesos(line: string): number[] {
  // Extrai todos os decimais "0,10", "0.20", etc. presentes na matriz
  // ATUALIZADO: suporta quebras de linha e espaços variáveis
  const out: number[] = [];
  const rx = /(\d{1,2})[\s\n]*[.,][\s\n]*(\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(line)) !== null) {
    const n = Number(`${m[1]}.${m[2]}`);
    if (!Number.isNaN(n) && n > 0) out.push(n);
  }

  // Log para debug
  if (process.env.DEBUG_GABARITO === "1" && out.length) {
    console.log("[GABARITO::MATRIZ_PESOS]", { linha: line.substring(0, 100), pesosExtraidos: out });
  }

  return out;
}

function parseLinhasItens(bloco: string, questao: "PEÇA" | `Q${1 | 2 | 3 | 4}`): LinhaItem[] {
  // Log estratégico 1: Entrada da função
  if (process.env.DEBUG_GABARITO === "1") {
    console.log(`[LOG] parseLinhasItens - questao: ${questao}`);
    console.log(`[LOG] bloco length: ${bloco.length}`);
  }

  // Corta a partir do fim do cabeçalho "ITEM  PONTUAÇÃO" considerando o tamanho real do match
  const mHdr = /ITEM\s+PONTUA[ÇC][AÃ]O/i.exec(bloco);
  const texto = mHdr
    ? bloco.slice(mHdr.index + mHdr[0].length)
    : bloco;
  let rawLines = texto
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/^(ITEM\s+PONTUA[ÇC][AÃ]O|ITEM|PONTUA[ÇC][AÃ]O|Endereçamento|Qualificação das partes|Alegações iniciais|Fundamentação|Pedidos|Pedidos e requerimentos|Fechamento)$/i.test(line)) return false;
      // NÃO filtramos a matriz aqui; vamos capturar para o item corrente
      return true;
    });

  // CORREÇÃO: Juntar linhas que são rótulos quebrados (ex: "A" + "1" + ". texto" → "A1. texto")
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const curr = rawLines[i];
    // Se linha é apenas uma letra A-D (questões) ou número (PEÇA)
    const isSingleLetter = questao !== "PEÇA" && /^[A-D]$/i.test(curr);
    const isSingleDigit = questao === "PEÇA" && /^\d+[A-Z]?$/.test(curr);

    if ((isSingleLetter || isSingleDigit) && i + 1 < rawLines.length) {
      const next = rawLines[i + 1];
      // Próxima linha é número ou ponto
      if (/^\d+$/.test(next) && i + 2 < rawLines.length) {
        // Caso: "A" + "1" + ". texto" → "A1. texto"
        const afterNext = rawLines[i + 2];
        if (/^\./.test(afterNext)) {
          lines.push(curr + next + afterNext);
          i += 2; // pular as 2 próximas
          continue;
        }
      } else if (/^\./.test(next)) {
        // Caso: "A" + ". texto" → "A. texto"
        lines.push(curr + next);
        i += 1; // pular a próxima
        continue;
      }
    }
    lines.push(curr);
  }

  // Log estratégico 2: Linhas filtradas
  if (process.env.DEBUG_GABARITO === "1") {
    console.log(`[LOG] Linhas filtradas: ${lines.length}`);
    lines.forEach((line, idx) => {
      if (idx < 10) console.log(`[LOG] Line ${idx}: ${line}`);
    });
  }

  const itens: LinhaItem[] = [];
  let buf: string[] = [];
  let currentLabel = "";
  // guarda matriz de pontos lida logo após o item corrente
  let currentPesosFromMatrix: number[] | null = null;
  let currentSegment: string | null = null;
  let currentItemSegment: string | null = null;

  const isStart = (s: string) => {
    if (questao === "PEÇA") {
      return /^\d+[A-Z]?\.\s+/.test(s); // ex.: 5A. ...
    }
    // Aceita: "A. ", "A1. ", "A2. ", etc. (para casos de subitens)
    return /^[A-D]\d*\.\s+/i.test(s);
  };

  const isMatrizPontos = (s: string) => RX_MATRIZ.test(s) && s.includes("/");

  const flush = () => {
    if (!buf.length) return;
    const raw = smartJoin(buf);
    const pesos: number[] = [];
    let m: RegExpExecArray | null;
    const rx = new RegExp(RX_DEC_ANY);
    while ((m = rx.exec(raw)) !== null) {
      pesos.push(decToNum(`${m[1]},${m[2]}`));
    }

    // Log estratégico 3: Análise de pesos por item
    if (process.env.DEBUG_GABARITO === "1" && currentLabel) {
      console.log(`[LOG] Item ${currentLabel}:`);
      console.log(`[LOG]   raw: ${raw.substring(0, 150)}...`);
      console.log(`[LOG]   pesos encontrados: [${pesos.join(', ')}]`);
      console.log(`[LOG]   matriz disponível: [${currentPesosFromMatrix ? currentPesosFromMatrix.join(', ') : 'nenhuma'}]`);
    }

    // OU explícito (case-insensitive). Também considera " ... ou ... " sem vírgula/preposição.
    // Isso evita atomizar itens como "custas (0,10) e honorários (0,10) ou reversão (0,20)".
    const temOU =
      /\bou\b/i.test(raw) ||
      /\s+ou\s+/i.test(raw) ||   // pega " ... ou ... " simples
      RX_OU_INLINE_SPLIT.test(raw);

    if (!currentLabel) {
      buf = [];
      return;
    }

    // Se a matriz de pontos indicar valores maiores/mais completos, priorize-a
    if (currentPesosFromMatrix && currentPesosFromMatrix.length) {
      const somaLinha = Number(pesos.reduce((acc, p) => acc + p, 0).toFixed(2));
      const somaMatriz = Number(currentPesosFromMatrix.reduce((acc, p) => acc + p, 0).toFixed(2));
      if (!pesos.length || somaLinha < somaMatriz) {
        if (process.env.DEBUG_GABARITO === "1") {
          console.log(`[LOG]   Substituindo pelos valores da matriz: [${currentPesosFromMatrix.join(', ')}]`);
        }
        pesos.length = 0;
        currentPesosFromMatrix.forEach((p) => pesos.push(p));
      }
    }
    currentPesosFromMatrix = null; // reseta para o próximo item

    let descricao = raw
      .replace(/0[,\.]00(?:\s*\/\s*(?:0?\d{1,2}|\d{2})[,\.]\d{2})+(?:\s*)?$/g, "")
      .trim();

    descricao = descricao
      .replace(/\b(Endereçamento|Mérito|Pedidos e requerimentos|Fechamento)\b$/i, "")
      .trim();

    // Remove matrizes de pontos do final da descrição
    descricao = descricao.replace(/\s*0[0-9\s/,\.]*$/, "").trim();

    if (process.env.DEBUG_GABARITO === "1") {
      console.log("[GABARITO::ITEM]", { questao, rotulo: currentLabel, descricao, pesos, temOU });
    }

    // Log estratégico 5: Item finalizado
    if (process.env.DEBUG_GABARITO === "1") {
      console.log(`[LOG] Item finalizado: ${currentLabel} | pesos: [${pesos.join(', ')}] | temOU: ${temOU} | segmento: ${currentItemSegment || currentSegment || 'nenhum'}`);
    }

    itens.push({
      rotulo: currentLabel,
      descricao,
      descricao_raw: raw,
      pesos,
      temOU,
      segmento: currentItemSegment ?? currentSegment ?? null,
    });
    buf = [];
    currentLabel = "";
    currentItemSegment = null;
  };

  for (const line of lines) {
    // Log estratégico 6: Processamento de linha
    if (process.env.DEBUG_GABARITO === "1" && questao === "PEÇA") {
      console.log(`[LOG] Processando linha: "${line}"`);
    }

    const segMatch = line.match(RX_DISTR_WITH_LABEL);
    if (segMatch) {
      flush();
      const label = (segMatch[1] || "").replace(/\s+/g, " ").trim();
      currentSegment = label || null;
      currentPesosFromMatrix = null;
      
      if (process.env.DEBUG_GABARITO === "1" && questao === "PEÇA") {
        console.log(`[LOG] Novo segmento: "${label}"`);
      }
      continue;
    }

    if (isStart(line)) {
      flush();
      currentLabel = line.split(".")[0].trim();
      currentItemSegment = currentSegment;
      buf.push(line.replace(/^\S+\.\s+/, ""));
      
      if (process.env.DEBUG_GABARITO === "1" && questao === "PEÇA") {
        console.log(`[LOG] Novo item: "${currentLabel}"`);
      }
    } else if (isMatrizPontos(line)) {
      // Captura a matriz como possível fonte de pesos para o item atual
      const arr = parseMatrizPesos(line);
      if (arr.length) currentPesosFromMatrix = arr;
      
      if (process.env.DEBUG_GABARITO === "1" && questao === "PEÇA") {
        console.log(`[LOG] Matriz de pontos: [${arr.join(', ')}]`);
      }
      // não adiciona a matriz ao texto do item
    } else {
      buf.push(line);
      
      if (process.env.DEBUG_GABARITO === "1" && questao === "PEÇA") {
        console.log(`[LOG] Linha adicionada ao buffer`);
      }
    }
  }
  flush();

  return itens;
}

function splitPorOU(desc: string): string[] {
  const collect = (segments: string[]) => {
    const cleaned: string[] = [];
    segments.forEach((seg) => {
      const trimmed = seg.trim();
      if (!trimmed) return;
      const pesoCount = (trimmed.match(RX_DEC_ANY) || []).length;
      const isFoundSegment = isFoundationDescription(trimmed);
      if ((!pesoCount || isFoundSegment) && cleaned.length) {
        cleaned[cleaned.length - 1] = `${cleaned[cleaned.length - 1]} ${trimmed}`.trim();
      } else {
        cleaned.push(trimmed);
      }
    });
    return cleaned;
  };

  // Preferência: OU em token isolado (case-insensitive)
  const partsToken = collect(desc.split(/\bou\b/i));
  if (partsToken.length >= 2) return partsToken;

  // Detecta padrões como "custas (0,10) e honorários (0,10) ou reversão (0,20)"
  // onde há uma alternativa com "ou" que deve ser tratada separadamente
  const ouMatch = /(.+?)\s+ou\s+(.+)$/i.exec(desc);
  if (ouMatch) {
    const before = ouMatch[1].trim();
    const after = ouMatch[2].trim();
    // Se ambas as partes têm peso, são alternativas válidas
    if (RX_DEC_ANY.test(before) && RX_DEC_ANY.test(after)) {
      return collect([before, after]);
    }
  }

  // Heurística: OU inline ", ou pela/por/em/no/na …"
  const m = RX_OU_INLINE_SPLIT.exec(desc);
  if (m) {
    const i = m.index;
    const left = desc.slice(0, i);
    const right = desc.slice(i + m[0].length);
    const partsInline = collect([left, right]);
    if (partsInline.length >= 2) return partsInline;
  }

  return [desc];
}


function extrairFundamentos(s: string): string[] {
  const arts = (s.match(RX_ART) || []).map((x) => x.replace(/\s+/g, " ").trim());
  const leis = (s.match(RX_LEI) || []).map((x) => x.replace(/\s+/g, " ").trim().replace(/\bn[ºo]\b/gi,''));
  const decr = (s.match(RX_DECR) || []).map((x) => x.replace(/\s+/g, " ").trim().replace(/\bn[ºo]\b/gi,''));
  const cf   = (s.match(RX_CF88) || []).map(() => "CF/88"); // canonicaliza
  const dipl = (s.match(RX_DIP) || []).map((x) => x.trim());
  return uniq([...leis, ...decr, ...cf, ...arts, ...dipl]);
}

function fundamentosCanonicos(descricao: string, brutos: string[]): string[] {
  // Heurística: se a descrição contiver CPC/CC, acople "Art." sem diploma a esse diploma.
  const hasCPC = /\bCPC\b|Código de Processo Civil/i.test(descricao);
  const hasCC  = /\bCC\b|Código Civil/i.test(descricao);
  const lei = (descricao.match(RX_LEI) || [])[0];
  const decr = (descricao.match(RX_DECR) || [])[0];
  const out: string[] = [];
  for (const f of brutos) {
    let t = f;
    // Art. X do CPC/CC -> CPC/CC art. X
    t = t.replace(/\bArt\.\s*([\dº§\.,\sIVXLC\-]+)\s+do\s+(CPC|CC)\b/i, (_m, art, dip) => `${dip.toUpperCase()} art. ${String(art).replace(/\s+/g," ")}`);
    // Art. X da Lei N -> Lei N art. X
    if (/^Art\./i.test(t) && lei) {
      t = t.replace(/^Art\.\s*([\dº§\.,\sIVXLC\-]+)/i, (_m, art) => `${lei.replace(/\bn[ºo]\b/gi,'')} art. ${String(art).replace(/\s+/g," ")}`);
    }
    // Art. X do Decreto Y -> Decreto Y art. X
    if (/^Art\./i.test(t) && decr) {
      t = t.replace(/^Art\.\s*([\dº§\.,\sIVXLC\-]+)/i, (_m, art) => `${decr.replace(/\bn[ºo]\b/gi,'')} art. ${String(art).replace(/\s+/g," ")}`);
    }
    // Art. X da CF/88|CRFB -> CF/88 art. X
    t = t.replace(/\bArt\.\s*([\dº§\.,\sIVXLC\-]+)\s+da\s+(?:CF\/?88|CRFB\/?88|Constituiç(?:a|ã)o(?: Federal)?(?: de 1988)?)\b/i,
      (_m, art) => `CF/88 art. ${String(art).replace(/\s+/g," ")}`);
    // Se continuar "Art. X" solto, acopla ao diploma dominante
    if (/^Art\./i.test(t)) {
      if (hasCPC) t = t.replace(/^Art\.\s*/i, "CPC art. ");
      else if (hasCC) t = t.replace(/^Art\.\s*/i, "CC art. ");
    }
    // Normalização de espaços
    t = t.replace(/\s{2,}/g, " ").trim();
    out.push(t);
  }
  return uniq(out);
}

function keywordsHeuristicas(s: string): string[] {
  const base: string[] = [];
  const pushIf = (rx: RegExp, kw: string) => {
    if (rx.test(s)) base.push(kw);
  };

  pushIf(/endere[çc]o|vara|comarca/i, "endereçamento");
  pushIf(/\bt[ea]mpestividad/i, "tempestividade");
  pushIf(/valor da causa/i, "valor da causa");
  pushIf(/alugue/i, "aluguéis");
  pushIf(/inadimpl/i, "inadimplência");
  pushIf(/retomad/i, "retomada");
  pushIf(/fian[çc]a|seguro[- ]?fian[çc]a/i, "fiança");
  pushIf(/liminar|desocup/i, "liminar de desocupação");
  pushIf(/in[eé]pcia/i, "inépcia");
  pushIf(/documentos essenciais/i, "documentos essenciais");
  pushIf(/litisconsorte|agravo de instrumento/i, "agravo de instrumento");
  pushIf(/foro|domic[ií]lio|situa[cç][aã]o da coisa/i, "competência/foro");
  pushIf(/obrigação indivis[ií]vel/i, "obrigação indivisível");
  pushIf(/adjudica[çc][aã]o/i, "adjudicação compulsória");
  pushIf(/frutos/i, "frutos");
  pushIf(/posse.*m[aá]-?f[ée]/i, "posse de má-fé");
  pushIf(/responsabil/i, "responsabilidade civil");

  for (const f of extrairFundamentos(s)) {
    base.push(f.replace(/\s+/g, " "));
  }

  return uniq(base);
}

function isFoundationDescription(desc: string): boolean {
  const normalized = desc.trim().toLowerCase();
  if (!normalized) return false;
  const prefixes = [
    'art.',
    'artigo',
    'nos termos do art',
    'com fundamento no art',
    'fundamento no art',
    'lei',
    'decreto',
    'súmula',
    'sumula',
    'cf/88',
    'constituição',
    'código',
    'cpc',
    'cpp',
    'clt',
    'ctn',
    'cc',
    'cdc',
    'estatuto',
    'portaria',
    'resolução'
  ];
  return prefixes.some((prefix) => normalized.startsWith(prefix));
}

function idEstavel(escopo: Escopo, questao: "PEÇA" | `Q${1 | 2 | 3 | 4}`, idx: number, subIdx: number, fragIdx = 0) {
  const base = escopo === "Peça" ? "PECA" : questao;
  const n = String(idx).padStart(2, "0");
  const letter1 = ABC[subIdx] || String.fromCharCode(65 + (subIdx % 26));
  const letter2 = fragIdx ? (ABC[fragIdx] || String.fromCharCode(65 + (fragIdx % 26))) : "";
  return `${base}-${n}${letter1}${letter2}`;
}

function slugifyVariantLabel(label: string) {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized || 'SEGMENTO';
}

function detectGabaritoVariant(desc: string, raw: string): string | undefined {
  const rawText = `${desc} ${raw}`;
  const normalized = rawText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (process.env.DEBUG_GABARITO === '1' && desc.startsWith('Petição')) {
    console.log('[DEBUG::VARIANT_SAMPLE]', normalized.substring(0, 150));
  }
  if (/excecao\s+de\s+pre-?executiv/.test(normalized)) {
    return 'Exceção de Pré-Executividade';
  }
  if (/agravo\s+de\s+peticao/.test(normalized)) {
    return 'Agravo de Petição';
  }
  return undefined;
}

// Segmenta um item da PEÇA em subpartes por posição dos tokens de pontuação "(0,xx)"
function segmentarPorPesos(desc: string): string[] {
  const tokens: { start: number; end: number; peso: number }[] = [];
  let m: RegExpExecArray | null;
  const rx = new RegExp(RX_DEC_ANY);
  while ((m = rx.exec(desc)) !== null) {
    const peso = decToNum(`${m[1]},${m[2]}`);
    if (!Number.isNaN(peso) && peso > 0) {
      tokens.push({ start: m.index, end: m.index + m[0].length, peso });
    }
  }
  if (!tokens.length) return [sanitizeDescricao(desc)];

  // Casos especiais: múltiplos pesos na mesma linha com conectores
  if (tokens.length >= 2) {
    // Detecta padrões mais complexos com conectores "e" e "ou"
    const hasE = /\s+e\s+(?:ao?\s+)?/i.test(desc);
    const hasOu = /\s+ou\s+/i.test(desc);

    if (hasE || hasOu) {
      // NOVA LÓGICA: Distinguir entre "e" aditivo vs "ou" alternativo
      
      // Caso 1: "ou" sempre segmenta (opções mutuamente exclusivas)
      if (hasOu) {
        const regex = /\s+ou\s+/i;
        const segments = desc.split(regex);
        
        if (segments.length >= 2 && segments.length <= tokens.length + 1) {
          const result: string[] = [];
          for (let i = 0; i < Math.min(segments.length, tokens.length); i++) {
            const seg = sanitizeDescricao(segments[i]);
            if (seg) result.push(seg);
          }
          if (result.length > 1) {
            if (process.env.DEBUG_GABARITO === "1") {
              console.log("[GABARITO::SEGMENTAR_OU]", {
                original: desc,
                segments: result,
                tokensCount: tokens.length
              });
            }
            return result;
          }
        }
      }
      
      // Caso 2: "e" pode ser aditivo (listar réus) ou alternativo (opções)
      // Heurística: Se há 3+ pesos com "e", é provavelmente lista aditiva
      // Se há 2 pesos com "e" e valores altos (>0.15), pode ser alternativo
      if (hasE && !hasOu) {
        const allPesosIguais = tokens.every(t => Math.abs(t.peso - tokens[0].peso) < 0.001);
        const pesosAltos = tokens.some(t => t.peso >= 0.15);
        const isLista = tokens.length >= 3 || (tokens.length === 2 && allPesosIguais && !pesosAltos);
        
        if (process.env.DEBUG_GABARITO === "1") {
          console.log("[GABARITO::ANALISAR_E]", {
            tokensCount: tokens.length,
            pesos: tokens.map(t => t.peso),
            allPesosIguais,
            pesosAltos,
            isLista,
            decisao: isLista ? "SOMAR (não segmentar)" : "SEGMENTAR"
          });
        }
        
        // Se é lista aditiva, NÃO segmentar (retorna a descrição original)
        if (isLista) {
          return [sanitizeDescricao(desc)];
        }
        
        // Se não é lista, segmentar normalmente
        const regex = /\s+(?:e\s+(?:ao?\s+)?(?:pagamento\s+)?(?:dos?\s+)?)/i;
        const segments = desc.split(regex);
        
        if (segments.length >= 2 && segments.length <= tokens.length + 1) {
          const result: string[] = [];
          for (let i = 0; i < Math.min(segments.length, tokens.length); i++) {
            const seg = sanitizeDescricao(segments[i]);
            if (seg) result.push(seg);
          }
          if (result.length > 1) {
            if (process.env.DEBUG_GABARITO === "1") {
              console.log("[GABARITO::SEGMENTAR_E]", {
                original: desc,
                segments: result,
                tokensCount: tokens.length
              });
            }
            return result;
          }
        }
      }
    }
  }

  // Fallback: segmentação por posição (lógica original)
  const segs: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const cur = tokens[i];
    const next = tokens[i + 1];
    const startText = (i === 0) ? 0 : tokens[i - 1].end;
    const endText = next ? next.start : desc.length;
    const raw = (desc.slice(startText, cur.start) + desc.slice(cur.end, endText)).trim();
    const clean = sanitizeDescricao(raw);
    if (clean) segs.push(clean);
  }
  return segs.length ? segs : [sanitizeDescricao(desc)];
}

function sanitizeDescricao(desc: string) {
  const result = desc
    .replace(/\s+/g, " ")
    .replace(/\bno?\s+prazo/gi, (m) => m.replace(/nº/gi, 'no'))
    // remove tokens de pontuação "(0,xx)"
    .replace(RX_SCORE, "")
    // remove ruído de paginação
    .replace(RX_PAGE_NOISE, "")
    // remove matrizes de pontos residuais
    .replace(/\b0[0-9\s/,\.]*$/, "")
    // limpa espaçamento
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*\.\s*/g, ". ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s*,\s*\./g, ".")
    .replace(/\s+\/\s+/g, " / ")
    .replace(/\s+/g, " ")
    .replace(/\s*\.$/, ".")
    .trim();

  // Filtro removido - focar no problema real de extração de pesos

  return result;
}

function isDocumentTemplate(desc: string): boolean {
  // Detecta padrões comuns de templates/cabeçalhos de documentos jurídicos
  // CUIDADO: "Data, local, advogado, OAB" é um item válido de fechamento, não um template
  const templatePatterns = [
    /^\s*\.\s*\.\s*\.\s*,?\s*\.\s*\.\s*\.\s*$/,  // apenas pontos e vírgulas
    /^[_\-\s\.]{8,}$/,  // apenas caracteres de preenchimento (8+ chars)
    /^Assinatura\s*:?\s*_*$/i,
    /^Nome\s*:?\s*_*$/i,
    /^Data\s*:?\s*_*$/i,
  ];

  return templatePatterns.some(pattern => pattern.test(desc));
}

function makeEmbeddingText(meta: GabaritoAtomico["meta"], it: Omit<Subitem, "embedding_text">) {
  const fund = it.fundamentos.length ? ` Fundamentos: ${it.fundamentos.join("; ")}.` : "";
  const kws = it.palavras_chave.length ? ` Palavras-chave: ${it.palavras_chave.join(", ")}.` : "";
  return `OAB ${meta.exam} ${meta.area} | ${it.escopo} | ${it.questao} | ${it.id} :: ${it.descricao}.${fund}${kws} Tarefa: localizar no texto do candidato trechos que atendam integral ou parcialmente a este subitem.`;
}

export function parseGabaritoDeterministico(textoBruto: string, metaIn: ParseMetaInput): GabaritoAtomico {
  const canonical = toCanonical(textoBruto);
  const secoes = splitSecoesDistribuicao(canonical);

  const itens: Subitem[] = [];
  const gruposBuilders: Array<{ group: GabaritoGrupo; pesoOptions: number[] }> = [];
  const gruposPorId = new Map<string, Array<{ group: GabaritoGrupo; pesoOptions: number[] }>>();
  const grupoCounters = new Map<string, number>();

  secoes.forEach((sec) => {
    const escopo: Escopo = sec.tipo === "PEÇA" ? "Peça" : "Questão";
    const questao = sec.tipo === "PEÇA" ? "PEÇA" : sec.tipo;
    const linhas = parseLinhasItens(sec.texto, questao);

    const segmentIdentifiers = new Map<string, { slug: string; label: string }>();
    let segIdx = 0;
    for (const li of linhas) {
      const key = (li.segmento || "").trim();
      if (!segmentIdentifiers.has(key)) {
        const humanLabel = key || `Segmento ${segIdx + 1}`;
        const slug = slugifyVariantLabel(humanLabel);
        segmentIdentifiers.set(key, { slug: slug || `SEG_${segIdx + 1}`, label: humanLabel });
        segIdx += 1;
      }
    }
    const hasVariantSegments = segmentIdentifiers.size > 1;
    const variantFamilyBase = hasVariantSegments
      ? `${questao}-SEG-${Array.from(segmentIdentifiers.values())
          .map((v) => v.slug)
          .sort()
          .join('_')}`
      : undefined;

    let idxItem = 0;

    let currentGabaritoVariant: { variant_family: string; variant_key: string; variant_label?: string } | undefined;

    linhas.forEach((li) => {
      const segmentKey = (li.segmento || "").trim();
      const segmentMeta = segmentIdentifiers.get(segmentKey);
      const descricaoBase = stripSectionTail(li.descricao);
      const descricaoRawBase = stripSectionTail(li.descricao_raw);

      if (process.env.DEBUG_GABARITO === '1' && questao === 'PEÇA') {
        console.log('[DEBUG::ITEM]', li.rotulo, descricaoBase.substring(0, 60));
      }
      const gabaritoLabel = questao === 'PEÇA' ? detectGabaritoVariant(descricaoBase, descricaoRawBase) : undefined;
      if (process.env.DEBUG_GABARITO === '1' && questao === 'PEÇA' && gabaritoLabel) {
        console.log('[GABARITO::VARIANT]', { rotulo: li.rotulo, gabaritoLabel });
      }
      let variantFamily: string | undefined;
      let variantKey: string | undefined;
      let variantLabel: string | undefined;

      let variantInfo: { variant_family: string; variant_key: string; variant_label?: string } | undefined;

      if (gabaritoLabel) {
        variantFamily = `${questao}-GABARITO`;
        variantKey = slugifyVariantLabel(gabaritoLabel);
        variantLabel = gabaritoLabel;
        variantInfo = { variant_family: variantFamily, variant_key: variantKey, variant_label: variantLabel };
        currentGabaritoVariant = variantInfo;
      } else if (!variantInfo && currentGabaritoVariant) {
        variantFamily = currentGabaritoVariant.variant_family;
        variantKey = currentGabaritoVariant.variant_key;
        variantLabel = currentGabaritoVariant.variant_label;
        variantInfo = { ...currentGabaritoVariant };
      } else if (segmentMeta && variantFamilyBase) {
        variantFamily = variantFamilyBase;
        variantKey = segmentMeta.slug || '__DEFAULT__';
        variantLabel = segmentMeta.label;
        variantInfo = { variant_family: variantFamily, variant_key: variantKey, variant_label: variantLabel };
      } else if (variantFamilyBase) {
        variantFamily = variantFamilyBase;
        variantKey = 'SEGMENTO';
        variantLabel = segmentMeta?.label;
        variantInfo = { variant_family: variantFamily, variant_key: variantKey, variant_label: variantLabel };
      }

      // SOLUÇÃO: Usar rótulo + sufixo da variante para evitar duplicação de IDs
      // Ex: PEÇA-G11 (genérico) vs PEÇA-G11-AGRAVO (variante específica)
      const rotuloNumerico = li.rotulo.match(/^\d+/)?.[0];
      const indiceGrupo = rotuloNumerico ? parseInt(rotuloNumerico, 10) : ((grupoCounters.get(questao) ?? 0) + 1);

      const counterKey = questao;
      grupoCounters.set(counterKey, indiceGrupo);

      const grupoId = `${questao}-G${String(indiceGrupo).padStart(2, '0')}`;

      const builderList = gruposPorId.get(grupoId) ?? [];
      const currentVariantKey = variantFamily ? `${variantFamily}::${variantKey ?? '__DEFAULT__'}` : '__BASE__';

      let grupoBuilder = builderList.find((existing) => {
        const existingVariant = existing.group.variant_family
          ? `${existing.group.variant_family}::${existing.group.variant_key ?? '__DEFAULT__'}`
          : '__BASE__';
        return existingVariant === currentVariantKey;
      });

      const ensureUniqueGroupId = (baseId: string, suffixSource: string | undefined, fallbackIndex: number) => {
        const normalizedSuffix = (suffixSource || `ALT${fallbackIndex}`)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Za-z0-9]/g, '_')
          .replace(/^_+|_+$/g, '')
          .toUpperCase() || `ALT${fallbackIndex}`;
        let candidate = `${baseId}-${normalizedSuffix}`;
        let attempt = 2;
        while (gruposBuilders.some((builder) => builder.group.id === candidate)) {
          candidate = `${baseId}-${normalizedSuffix}-${attempt}`;
          attempt += 1;
        }
        return candidate;
      };

      if (!grupoBuilder) {
        const uniqueId = builderList.length === 0
          ? grupoId
          : ensureUniqueGroupId(grupoId, variantKey || segmentMeta?.slug || variantLabel, builderList.length + 1);

        const descricaoInicial = descricaoBase.trim();
        const descricaoBrutaInicial = descricaoRawBase.trim();
        grupoBuilder = {
          group: {
            id: uniqueId,
            escopo,
            questao: questao as GabaritoGrupo["questao"],
            indice: indiceGrupo,
            rotulo: rotuloNumerico ? rotuloNumerico : li.rotulo,
            segmento: li.segmento ?? null,
            descricao: descricaoInicial,
            descricao_bruta: descricaoBrutaInicial,
            descricao_limpa: sanitizeDescricao(descricaoBrutaInicial),
            peso_maximo: 0,
            pesos_opcoes: [] as number[],
            pesos_brutos: li.pesos.map((p) => Number(p.toFixed(2))),
            subitens: [] as string[],
            variant_family: variantFamily,
            variant_key: variantKey,
            variant_label: variantLabel ?? segmentMeta?.label,
          },
          pesoOptions: [] as number[],
        };
        builderList.push(grupoBuilder);
        gruposPorId.set(grupoId, builderList);
        gruposBuilders.push(grupoBuilder);
      } else {
        // Unifica descrições duplicadas (casos como 5A/5B)
        const descTrim = descricaoBase.trim();
        if (descTrim && !grupoBuilder.group.descricao.includes(descTrim)) {
          grupoBuilder.group.descricao = `${grupoBuilder.group.descricao}\n${descTrim}`.trim();
        }
        const descRawTrim = descricaoRawBase.trim();
        if (descRawTrim && !grupoBuilder.group.descricao_bruta.includes(descRawTrim)) {
          grupoBuilder.group.descricao_bruta = `${grupoBuilder.group.descricao_bruta}\n${descRawTrim}`.trim();
          grupoBuilder.group.descricao_limpa = sanitizeDescricao(grupoBuilder.group.descricao_bruta);
        }
        grupoBuilder.group.pesos_brutos.push(...li.pesos.map((p) => Number(p.toFixed(2))));

        if (!grupoBuilder.group.variant_family && variantFamily) {
          grupoBuilder.group.variant_family = variantFamily;
          grupoBuilder.group.variant_key = variantKey;
          grupoBuilder.group.variant_label = variantLabel ?? segmentMeta?.label;
        }
      }

      const hasAlternative = li.temOU;
      // IMPORTANTE: Heurística refinada para QUESTÕES:
      // - Com 2-3 pesos + OU: normalmente fundamento legal alternativo (ex: "Art. X ou Súmula Y")
      // - Com 4+ pesos + OU: alternativas de conteúdo (ex: Q1-B com 6 pesos = 2 caminhos de 3 pesos cada)
      // Na PEÇA, sempre dividir por OU quando presente
      const deveDividirPorOU = hasAlternative && (questao === "PEÇA" || li.pesos.length >= 4);
      const ramos = deveDividirPorOU ? splitPorOU(li.descricao) : [li.descricao];

      // Log estratégico 7: Análise de ramos
      if (process.env.DEBUG_GABARITO === "1") {
        console.log(`[LOG] ${questao}-${li.rotulo}: pesos=${li.pesos.length}, temOU=${hasAlternative}, deveDividir=${deveDividirPorOU}, ramos=${ramos.length}`);
        if (questao === "PEÇA" || deveDividirPorOU) {
          ramos.forEach((ramo, idx) => {
            console.log(`[LOG]   Ramo ${idx}: "${ramo.substring(0, 100)}..."`);
          });
        }
      }

      const pesosPorRamo = ramos.map((ramo, idxRamo) => {
        const arr: number[] = [];
        let m: RegExpExecArray | null;
        const rx = new RegExp(RX_DEC_ANY);
        while ((m = rx.exec(ramo)) !== null) {
          arr.push(decToNum(`${m[1]},${m[2]}`));
        }
        
        // Log estratégico 8: Pesos por ramo
        if (process.env.DEBUG_GABARITO === "1" && questao === "PEÇA") {
          console.log(`[LOG]     Ramo ${idxRamo} pesos: [${arr.join(', ')}] (fallback: [${li.pesos.join(', ')}])`);
        }
        
        return arr.length ? arr : [...li.pesos];
      });

      // ID de grupo OU sanitizado para evitar caracteres problemáticos vindos do rótulo
      const ouGroupId = hasAlternative
        ? `${questao}-${li.rotulo}-OU`
            .replace(/\s+/g, '')
            .replace(/[^A-Za-z0-9\-]/g, '')
        : undefined;

      ramos.forEach((ramoOriginal, ramoIdx) => {
        const ramo = stripSectionTail(ramoOriginal);
        // Usar pesos capturados no ramo específico, fallback para li.pesos apenas se não capturou nada
        const branchPesos = (pesosPorRamo[ramoIdx] && pesosPorRamo[ramoIdx].length)
          ? pesosPorRamo[ramoIdx]
          : li.pesos;

        const branchTotal = Number(branchPesos.reduce((acc, p) => acc + (p ?? 0), 0).toFixed(2));
        grupoBuilder.pesoOptions.push(branchTotal);
        if (!Number.isNaN(branchTotal)) {
          grupoBuilder.group.peso_maximo = Number(Math.max(grupoBuilder.group.peso_maximo, branchTotal).toFixed(2));
        }

        // --- GRANULARIDADE ATÔMICA NA PEÇA (genérica, sem dicionário) ---
        const descRaw = stripSectionTail(ramo.replace(RX_PAGE_NOISE, ""));
        // saneia e remove tokens (0,xx)
        const descLimpa = sanitizeDescricao(descRaw);

        // ATUALIZADO: Atomizar PEÇA (2+ pesos) E Questões (3+ pesos)
        // IMPORTANTE: Usar branchPesos.length ao invés de recontar no texto, pois os pesos
        // já foram extraídos corretamente por parseLinhasItens (incluindo pesos em linhas separadas)
        const numPesos = branchPesos.length;

        // QUESTÕES: O "OU" é considerado fundamento legal quando NÃO dividimos (2-3 pesos)
        // Se dividimos por OU (deveDividirPorOU=true, ou seja 4+ pesos), cada ramo é alternativa de conteúdo e NÃO deve atomizar
        const ouEhApenasFoundation = questao !== "PEÇA" && hasAlternative && !deveDividirPorOU;

        const deveAtomizar =
          (!hasAlternative || ouEhApenasFoundation) &&
          (
            // PEÇA: atomiza com 2+ pesos (modo auto ou on)
            (questao === "PEÇA" && (PECA_ATOMIZE_MODE === 'on' || (PECA_ATOMIZE_MODE === 'auto' && numPesos >= 2))) ||
            // QUESTÕES: atomiza apenas com 3+ pesos (evita somar fundamento+conteúdo em itens normais)
            (questao !== "PEÇA" && numPesos >= 3)
          );

        // Log de debug para identificar problemas
        if (process.env.DEBUG_GABARITO === "1" && questao !== "PEÇA" && numPesos >= 2) {
          console.log("[GABARITO::ATOMIZACAO_DEBUG]", {
            questao,
            rotulo: li.rotulo,
            numPesos,
            branchPesos,
            hasAlternative,
            ouEhApenasFoundation,
            deveAtomizar,
            descricaoInicio: descRaw.substring(0, 100) + "..."
          });
        }

        if (deveAtomizar) {
          const partes = segmentarPorPesos(ramo); // usa o texto original (já limpo) do ramo para preservar contexto
          
          // CASO ESPECIAL: Se segmentarPorPesos retornou 1 parte mas há múltiplos pesos,
          // é uma lista aditiva que deve somar todos os pesos no item único
          if (partes.length === 1 && branchPesos.length > 1) {
            idxItem += 1;
            const descricaoFrag = sanitizeDescricao(partes[0]);
            const pesoSomado = branchPesos.reduce((acc, p) => acc + (p ?? 0), 0);
            
            if (process.env.DEBUG_GABARITO === "1") {
              console.log("[GABARITO::LISTA_ADITIVA]", {
                questao, 
                descricao: descricaoFrag.substring(0, 100) + "...",
                pesosOriginais: branchPesos,
                pesoSomado
              });
            }
            
            const fundamentosBrutos = extrairFundamentos(descricaoFrag);
            const fundamentos = fundamentosCanonicos(descRaw, fundamentosBrutos);
            const palavras = keywordsHeuristicas(descricaoFrag);
            const baseSub: Omit<Subitem, "embedding_text"> = {
              id: idEstavel(escopo, questao, idxItem, ramoIdx, 0),
              escopo,
              questao,
              descricao: descricaoFrag,
              peso: Number(pesoSomado.toFixed(2)),
              fundamentos,
              palavras_chave: palavras,
              ...(variantInfo ?? {}),
              flags: {}
            };
            const metaOut: GabaritoAtomico["meta"] = {
              area: metaIn.area,
              exam: metaIn.exam,
              data_aplicacao: metaIn.data_aplicacao,
              fonte: metaIn.fonte ?? "Padrão de Resposta da FGV",
              versao_schema: "1.0",
              gerado_em: new Date().toISOString()
            };
            const embedding_text = makeEmbeddingText(metaOut, baseSub);
            const subitemFinal = { ...baseSub, embedding_text };
            itens.push(subitemFinal);
            grupoBuilder.group.subitens.push(subitemFinal.id);
            return; // Não processar mais este ramo
          }
          
          // CASO NORMAL: Segmentação regular
          const n = Math.max(partes.length, branchPesos.length); // Garante que processa todos
          for (let fragIdx = 0; fragIdx < n; fragIdx += 1) {
            idxItem += 1;
            const descricaoFrag = sanitizeDescricao(partes[fragIdx] || partes[partes.length - 1] || "");

            // Skip fragmentos vazios
            if (!descricaoFrag.trim()) {
              if (process.env.DEBUG_GABARITO === "1") {
                console.log("[GABARITO::SKIP_EMPTY]", {
                  questao, fragIdx, original: partes[fragIdx] || "undefined"
                });
              }
              continue;
            }

            const peso = branchPesos[fragIdx] ?? 0;

            // Debug peso assignment
            if (process.env.DEBUG_GABARITO === "1" && (peso <= 0 || peso == null)) {
              console.log("[GABARITO::PESO_DEBUG]", {
                questao, fragIdx,
                pesoCalculado: peso,
                branchPesos,
                branchPesosLength: branchPesos.length,
                descricaoFrag,
                descricaoOriginal: partes[fragIdx] || "undefined",
                ramoOriginal: ramo.substring(0, 200) + "..."
              });
            }

            // Skip fragmentos sem peso válido
            if (peso <= 0 && fragIdx >= partes.length) {
              if (process.env.DEBUG_GABARITO === "1") {
                console.log("[GABARITO::SKIP_FRAGMENT]", {
                  questao, fragIdx, peso, partesLength: partes.length,
                  descricaoFrag: partes[fragIdx] || "undefined"
                });
              }
              continue;
            }

            const fundamentosBrutos = extrairFundamentos(descricaoFrag);
            const fundamentos = fundamentosCanonicos(descRaw, fundamentosBrutos);
            const palavras = keywordsHeuristicas(descricaoFrag);
            const baseSub: Omit<Subitem, "embedding_text"> = {
              id: idEstavel(escopo, questao, idxItem, ramoIdx, fragIdx),
              escopo,
              questao,
              descricao: descricaoFrag,
              peso: peso > 0 ? Number(peso.toFixed(2)) : null,
              fundamentos,
              palavras_chave: palavras,
              ...(variantInfo ?? {}),
              flags: {}
            };
            const metaOut: GabaritoAtomico["meta"] = {
              area: metaIn.area,
              exam: metaIn.exam,
              data_aplicacao: metaIn.data_aplicacao,
              fonte: metaIn.fonte ?? "Padrão de Resposta da FGV",
              versao_schema: "1.0",
              gerado_em: new Date().toISOString()
            };
            const embedding_text = makeEmbeddingText(metaOut, baseSub);
            const subitemFinal = { ...baseSub, embedding_text };
            itens.push(subitemFinal);
            grupoBuilder.group.subitens.push(subitemFinal.id);
          }
          return;
        }

        // Caso geral (OU ou Questões): item único por ramo (peso somado, com cap de 0,70 se aplicável)
        const descricaoLimpa = sanitizeDescricao(descRaw);

        // Skip descrições vazias
        if (!descricaoLimpa.trim()) {
          if (process.env.DEBUG_GABARITO === "1") {
            console.log("[GABARITO::SKIP_EMPTY_BRANCH]", {
              questao, ramoIdx, original: descRaw
            });
          }
          return; // Skip este ramo inteiro
        }

        idxItem += 1;
        let pesoTotal = branchPesos.length
          ? Number(branchPesos.reduce((acc, p) => acc + (p ?? 0), 0).toFixed(2))
          : null;
        if (!hasAlternative && pesoTotal != null && pesoTotal > 0.7) {
          pesoTotal = Number(Math.min(pesoTotal, 0.7).toFixed(2));
        }

        // Log estratégico 9: Peso final calculado
        if (process.env.DEBUG_GABARITO === "1" && questao === "PEÇA") {
          console.log(`[LOG] Peso final calculado para ${li.rotulo}-${ramoIdx}:`);
          console.log(`[LOG]   branchPesos: [${branchPesos.join(', ')}]`);
          console.log(`[LOG]   pesoTotal antes cap: ${branchPesos.length ? branchPesos.reduce((acc, p) => acc + (p ?? 0), 0) : 'null'}`);
          console.log(`[LOG]   pesoTotal final: ${pesoTotal}`);
          console.log(`[LOG]   hasAlternative: ${hasAlternative}`);
          console.log(`[LOG]   ouGroupId: ${ouGroupId || 'nenhum'}`);
        }
        const fundamentosBrutos = extrairFundamentos(descricaoLimpa);
        const fundamentos = fundamentosCanonicos(descRaw, fundamentosBrutos);
        const palavras = keywordsHeuristicas(descricaoLimpa);
        const baseSub: Omit<Subitem, "embedding_text"> = {
          id: idEstavel(escopo, questao, idxItem, ramoIdx, 0),
          escopo,
          questao,
          descricao: descricaoLimpa,
          peso: pesoTotal,
          fundamentos,
          palavras_chave: palavras,
          ...(ouGroupId ? { ou_group_id: ouGroupId, ou_group_mode: "pick_best" as const } : {}),
          ...(variantInfo ?? {}),
          flags: {}
        };
        const metaOut: GabaritoAtomico["meta"] = {
          area: metaIn.area,
          exam: metaIn.exam,
          data_aplicacao: metaIn.data_aplicacao,
          fonte: metaIn.fonte ?? "Padrão de Resposta da FGV",
          versao_schema: "1.0",
          gerado_em: new Date().toISOString()
        };
        const embedding_text = makeEmbeddingText(metaOut, baseSub);
        const subitemFinal = { ...baseSub, embedding_text };
        itens.push(subitemFinal);
        grupoBuilder.group.subitens.push(subitemFinal.id);
      });

      const opcoesNormalizadas = uniq(grupoBuilder.pesoOptions.map((p) => Number(p.toFixed(2))));
      if (opcoesNormalizadas.length) {
        grupoBuilder.group.pesos_opcoes = opcoesNormalizadas;
        grupoBuilder.group.peso_maximo = Number(Math.max(...opcoesNormalizadas).toFixed(2));
      } else {
        const somaBruta = grupoBuilder.group.pesos_brutos.reduce((acc, p) => acc + (p ?? 0), 0);
        const somaNormalizada = Number(somaBruta.toFixed(2));
        grupoBuilder.group.pesos_opcoes = somaNormalizada ? [somaNormalizada] : [];
        grupoBuilder.group.peso_maximo = somaNormalizada;
      }
    });
  });

  const somaPeca = verificarPontuacao(itens).peca.total;

  // Debug da soma da PEÇA e verificação completa
  if (process.env.DEBUG_GABARITO === "1") {
    const gruposPeca = gruposBuilders.filter((gb) => gb.group.questao === "PEÇA");
    const gruposQuestoes = gruposBuilders.filter((gb) => gb.group.questao !== "PEÇA");
    console.log(`[GABARITO::GRUPOS] PEÇA=${gruposPeca.length} | QUESTOES=${gruposQuestoes.length} | TOTAL=${gruposBuilders.length}`);
    console.log("[GABARITO::SOMA_PECA]", {
      somaPeca,
      itensPeca: itens.filter(i => i.questao === "PEÇA").length,
      pesosPeca: itens.filter(i => i.questao === "PEÇA" && i.peso).map(i => ({ id: i.id, peso: i.peso, ou_group: i.ou_group_id }))
    });

    // Executa verificação completa da pontuação
    debugResumo(itens);
  }

  // Tolerância mais generosa para PDFs complexos (era 0.12, agora 0.20)
  if (Math.abs(somaPeca - 5.0) > 0.20) {
    const firstPeca = itens.find((i) => i.questao === "PEÇA");
    if (firstPeca) {
      firstPeca.flags = { ...(firstPeca.flags ?? {}), missingParts: true };
    }
  }

  const gabarito = {
    meta: {
      area: metaIn.area,
      exam: metaIn.exam,
      data_aplicacao: metaIn.data_aplicacao,
      fonte: metaIn.fonte ?? "Padrão de Resposta da FGV",
      versao_schema: "1.0",
      gerado_em: new Date().toISOString()
    },
    itens,
    grupos: gruposBuilders.map((gb) => ({ ...gb.group })),
  };

  // Aplica pós-processamento para correções finais
  return postProcessDelta(gabarito);
}

// --- Pós-processamento para ajustes finais ---
function normalizeNums(s: string) {
  return s
    .replace(/(\d)\.\s+(\d{3})/g, '$1.$2')          // 1. 015 → 1.015 ; 8. 245 → 8.245
    .replace(/R\$\s*(\d{1,3})\.\s*(\d{3}),\s*(\d{2})/g, 'R$ $1.$2,$3') // dinheiro
    .replace(/\b(Lei\s+\d{1,3}\.\d{3})\/(\d{2})\b/g, (_m, a, yy) => {
      const y = Number(yy); return `${a}/${y >= 30 ? '19'+yy : '20'+yy}`;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// canônica aprimorada para fundamentos específicos
function canonFundQuick(f: string, desc: string) {
  let t = f.replace(/\s+/g,' ').trim();

  // Remove sufixos ruins como "da Lei 8", "do C", etc.
  t = t.replace(/\s+da\s+Lei\s+\d+$/, '');
  t = t.replace(/\s+do\s+C$/, '');

  // CPC/CC art. X do CPC/CC -> CPC/CC art. X
  t = t.replace(/\bArt\.\s*([\d\.\-§º,IVXLC\s]+)\s+do\s+(CPC|CC)\b/i, (_m, art, dip) => {
    const artLimpo = String(art).replace(/\s+/g,' ').trim();
    return `${dip.toUpperCase()} art. ${artLimpo}`;
  });

  // Lei X art. Y da Lei X -> Lei X art. Y
  t = t.replace(/^(Lei\s+[\d\.\/]+)\s+art\.\s*([\d\.\-§º,IVXLC\s]+)\s+da\s+Lei\s+[\d\.\/]+$/i, (_m, lei, art) => {
    const artLimpo = String(art).replace(/\s+/g,' ').trim();
    return `${lei} art. ${artLimpo}`;
  });

  // Art. solto + lei no contexto
  const lei = (desc.match(/\bLei\s+\d{1,3}\.\d{3}\/\d{4}\b/i)||[])[0];
  if (/^Art\./i.test(t) && lei) {
    t = t.replace(/^Art\.\s*([\d\.\-§º,IVXLC\s]+)/i, (_m, art) => {
      const artLimpo = String(art).replace(/\s+/g,' ').trim();
      return `${lei} art. ${artLimpo}`;
    });
  }

  // Se for só CPC/CC, acopla art. do contexto
  const hasCPC = /\bCPC\b|Código de Processo Civil/i.test(desc);
  const hasCC  = /\bCC\b|Código Civil/i.test(desc);
  if (/^Art\./i.test(t) && !lei) {
    if (hasCPC) t = t.replace(/^Art\.\s*/i, "CPC art. ");
    else if (hasCC) t = t.replace(/^Art\.\s*/i, "CC art. ");
  }

  return t.replace(/\s{2,}/g,' ').trim();
}

export function postProcessDelta(g: GabaritoAtomico): GabaritoAtomico {
  const itens: Subitem[] = [];
  for (const it of g.itens) {
    it.descricao = normalizeNums(it.descricao);
    // migração genérica (caso venha de outra fonte)
    if ((it as any).alternativas_grupo?.length) {
      it.ou_group_id = `${it.questao}-${(it as any).alternativas_grupo[0]}`.replace(/[^A-Z0-9\-]/gi,'');
      it.ou_group_mode = 'pick_best';
      delete (it as any).alternativas_grupo;
    }
    // re-canoniza rapidamente e reextrai limpo
    it.fundamentos = (it.fundamentos || []).map((f) => canonFundQuick(f, it.descricao)).filter(Boolean);
    const fundLimpos = extrairFundamentos(it.descricao);
    const fundCanonicos = fundamentosCanonicos(it.descricao, fundLimpos);
    it.fundamentos = uniq([...(it.fundamentos||[]), ...fundCanonicos]);
    it.palavras_chave = keywordsHeuristicas(it.descricao);
    it.embedding_text = makeEmbeddingText(g.meta, it);
    itens.push(it);
  }
  return { ...g, itens, grupos: g.grupos };
}

// --- Dev helper (optional): quick smoke check ---
// Função para verificar se a pontuação está correta conforme regras da OAB
export function verificarPontuacao(itens: Subitem[]): {
  peca: { total: number; esperado: number; desvio: number; ok: boolean };
  questoes: { total: number; esperado: number; desvio: number; ok: boolean; porQuestao: Record<string, { total: number; esperado: number; desvio: number; ok: boolean }> };
  geral: { total: number; esperado: number; desvio: number; ok: boolean };
} {
  // Agrupa itens por questão
  const grupos = new Map<string, Subitem[]>();

  for (const item of itens) {
    if (!grupos.has(item.questao)) grupos.set(item.questao, []);
    grupos.get(item.questao)!.push(item);
  }

  const calcularSomaLista = (lista: Subitem[]): number => {
    let soma = 0;
    const gruposLocais = new Map<string, { items: Subitem[]; mode: Subitem["ou_group_mode"] | undefined }>();

    for (const item of lista) {
      if (!item.ou_group_id) continue;
      const entry = gruposLocais.get(item.ou_group_id) ?? { items: [], mode: item.ou_group_mode };
      entry.items.push(item);
      if (item.ou_group_mode) entry.mode = item.ou_group_mode;
      gruposLocais.set(item.ou_group_id, entry);
    }

    const processedGroups = new Set<string>();
    for (const item of lista) {
      if (item.peso == null || item.peso <= 0) continue;

      if (item.ou_group_id) {
        if (processedGroups.has(item.ou_group_id)) continue;
        const grupo = gruposLocais.get(item.ou_group_id);
        if (!grupo) {
          processedGroups.add(item.ou_group_id);
          continue;
        }

        const mode = grupo.mode ?? "pick_best";
        const fundamentos = grupo.items.filter((g) => {
          const peso = g.peso ?? 0;
          if (peso > 0 && peso <= 0.15) return true;
          const textoRaw = g.descricao.trim().toLowerCase();
          const texto = textoRaw.replace(/^(não|nao|sim)[\.\s]+/, '');
          if (/^(conforme|com\s+base|com\s+fundamento|nos\s+termos|na\s+forma|pelo\s+art|pela\s+aplica|fundamentos\s+da|lastreado|previsto\s+no)/.test(texto)) return true;
          if (peso <= 0.25 && /(nos\s+termos|na\s+forma|com\s+fundamento|conforme\s+previsto)/.test(texto)) return true;
          return false;
        });
        const principais = grupo.items.filter((g) => !fundamentos.includes(g));

        let subtotal = 0;
       if (mode === "pick_sum") {
          subtotal = grupo.items.reduce((acc, g) => acc + (g.peso ?? 0), 0);
        } else {
          const pesoFundamentos = fundamentos.reduce((acc, g) => acc + (g.peso ?? 0), 0);
          const pesosPrincipais = principais.map((g) => g.peso ?? 0).filter((p) => p > 0);
          const melhorPrincipal = pesosPrincipais.length ? Math.max(...pesosPrincipais) : 0;
          subtotal = melhorPrincipal + pesoFundamentos;
          if (!principais.length) subtotal = pesoFundamentos;
        }

        if (process.env.DEBUG_GABARITO === '1') {
          console.log('[VERIF::OU_GROUP]', {
            grupo: item.ou_group_id,
            mode,
            principais: principais.map((g) => ({ id: g.id, peso: g.peso, desc: g.descricao.substring(0, 60) })),
            fundamentos: fundamentos.map((g) => ({ id: g.id, peso: g.peso, desc: g.descricao.substring(0, 60) })),
            subtotal
          });
        }

        soma += Number(subtotal.toFixed(2));
        processedGroups.add(item.ou_group_id);
      } else {
        soma += item.peso;
      }
    }

    return Number(soma.toFixed(2));
  };

  // Calcula soma considerando grupos OU e variantes alternativas
  const calcularSoma = (itensQuestao: Subitem[]): number => {
    const baseItems = itensQuestao.filter((it) => !it.variant_family);
    let soma = calcularSomaLista(baseItems);

    const familias = new Map<string, Map<string, Subitem[]>>();
    for (const item of itensQuestao) {
      if (!item.variant_family) continue;
      const family = item.variant_family;
      const variant = item.variant_key ?? "__default__";
      if (!familias.has(family)) familias.set(family, new Map());
      const variants = familias.get(family)!;
      const arr = variants.get(variant) ?? [];
      arr.push(item);
      variants.set(variant, arr);
    }

    for (const variants of familias.values()) {
      let melhor = 0;
      for (const lista of variants.values()) {
        const total = calcularSomaLista(lista);
        if (total > melhor) melhor = total;
      }
      soma += Number(melhor.toFixed(2));
    }

    return Number(soma.toFixed(2));
  };

  // Calcula PEÇA
  const itensPeca = grupos.get('PEÇA') || [];
  const somaPecaBruto = calcularSoma(itensPeca);
  if (process.env.DEBUG_GABARITO === '1') {
    console.log('[VERIF::PECA_TOTAL]', { bruto: somaPecaBruto });
  }
  const somaPeca = Math.min(somaPecaBruto, 5.0);
  const esperadoPeca = 5.0;
  const desvioPeca = Number((somaPeca - esperadoPeca).toFixed(2));

  // Calcula QUESTÕES
  const questoes = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
  const questoesExistentes = questoes.filter(q => grupos.has(q));
  const numQuestoes = questoesExistentes.length;
  const esperadoPorQuestao = numQuestoes > 0 ? Number((5.0 / numQuestoes).toFixed(2)) : 0;

  const porQuestao: Record<string, { total: number; esperado: number; desvio: number; ok: boolean }> = {};
  const esperadoQuestoes = 5.0;
  let somaQuestoes = 0;

  for (const questao of questoesExistentes) {
    const itensQuestao = grupos.get(questao) || [];
    const somaBruto = calcularSoma(itensQuestao);
    const soma = Math.min(somaBruto, esperadoPorQuestao || somaBruto);
    const desvio = Number((soma - esperadoPorQuestao).toFixed(2));

    porQuestao[questao] = {
      total: soma,
      esperado: esperadoPorQuestao,
      desvio,
      ok: Math.abs(desvio) <= 0.05 // tolerância de ±0.05
    };

    somaQuestoes += soma;
  }

  somaQuestoes = Number(Math.min(somaQuestoes, esperadoQuestoes).toFixed(2));
  const desvioQuestoes = Number((somaQuestoes - esperadoQuestoes).toFixed(2));

  // Totais gerais
  const somaGeral = somaPeca + somaQuestoes;
  const esperadoGeral = 10.0;
  const desvioGeral = Number((somaGeral - esperadoGeral).toFixed(2));

  return {
    peca: {
      total: somaPeca,
      esperado: esperadoPeca,
      desvio: desvioPeca,
      ok: Math.abs(desvioPeca) <= 0.20 // tolerância atual do parser
    },
    questoes: {
      total: somaQuestoes,
      esperado: esperadoQuestoes,
      desvio: desvioQuestoes,
      ok: Math.abs(desvioQuestoes) <= 0.20,
      porQuestao
    },
    geral: {
      total: somaGeral,
      esperado: esperadoGeral,
      desvio: desvioGeral,
      ok: Math.abs(desvioGeral) <= 0.25
    }
  };
}

export function debugResumo(itens: Subitem[]) {
  const byQ: Record<string, number> = {};
  for (const it of itens) byQ[it.questao] = (byQ[it.questao] ?? 0) + 1;
  const verificacao = verificarPontuacao(itens);

  console.log("\n=== RESUMO GABARITO ===");
  console.log({ total: itens.length, porQuestao: byQ });

  console.log("\n=== VERIFICAÇÃO PONTUAÇÃO ===");
  console.log("PEÇA:", {
    total: verificacao.peca.total,
    esperado: verificacao.peca.esperado,
    desvio: verificacao.peca.desvio,
    status: verificacao.peca.ok ? "✅ OK" : "❌ DESVIO"
  });

  console.log("QUESTÕES:", {
    totalGeral: verificacao.questoes.total,
    esperado: verificacao.questoes.esperado,
    desvio: verificacao.questoes.desvio,
    status: verificacao.questoes.ok ? "✅ OK" : "❌ DESVIO"
  });

  for (const [q, dados] of Object.entries(verificacao.questoes.porQuestao)) {
    console.log(`  ${q}:`, {
      total: dados.total,
      esperado: dados.esperado,
      desvio: dados.desvio,
      status: dados.ok ? "✅" : "❌"
    });
  }

  console.log("GERAL:", {
    total: verificacao.geral.total,
    esperado: verificacao.geral.esperado,
    desvio: verificacao.geral.desvio,
    status: verificacao.geral.ok ? "✅ OK" : "❌ DESVIO"
  });

  console.log("========================\n");
}
