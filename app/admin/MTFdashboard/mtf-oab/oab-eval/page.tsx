"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { RubricPayload } from "@/lib/oab-eval/types";
import type { GabaritoGrupo, Subitem } from "@/lib/oab/gabarito-parser-deterministico";
import { verificarPontuacao } from "@/lib/oab/gabarito-parser-deterministico";

type RubricSummary = {
  id: string;
  exam: string | null;
  area: string | null;
  version: string | null;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown> | null;
  counts: { itens: number; grupos: number };
  pontuacao: null | {
    geral: { total: number; esperado: number; desvio: number; ok: boolean };
    peca: { total: number; esperado: number; desvio: number; ok: boolean };
    questoes: { total: number; esperado: number; desvio: number; ok: boolean; porQuestao: Record<string, { total: number; esperado: number; desvio: number; ok: boolean }> };
  };
};

type RubricDetail = {
  id: string;
  code: string | null;
  exam: string | null;
  area: string | null;
  version: string | null;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown> | null;
  schema: RubricPayload;
  counts: { itens: number; grupos: number };
  pontuacao: RubricSummary["pontuacao"];
};

type QuestaoKey = "PEÇA" | `Q${1 | 2 | 3 | 4}` | string;

const QUESTAO_ORDER: QuestaoKey[] = ["PEÇA", "Q1", "Q2", "Q3", "Q4"];

const QUESTAO_LABEL: Record<string, string> = {
  PEÇA: "Peça Profissional",
  Q1: "Questão 1",
  Q2: "Questão 2",
  Q3: "Questão 3",
  Q4: "Questão 4",
};

function questaoOrderIndex(value: QuestaoKey): number {
  const idx = QUESTAO_ORDER.indexOf(value);
  return idx === -1 ? QUESTAO_ORDER.length + 1 : idx;
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function roundTwo(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Number.parseFloat(n.toFixed(2));
}

function mergePesoArrays(...arrays: Array<number[] | undefined>): number[] {
  const values: number[] = [];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const value of arr) {
      if (typeof value === "number" && Number.isFinite(value)) {
        values.push(roundTwo(value));
      }
    }
  }
  return uniq(values);
}

function cloneRubricPayload(payload: RubricPayload): RubricPayload {
  return {
    meta: payload.meta ? JSON.parse(JSON.stringify(payload.meta)) : undefined,
    schema_docs: payload.schema_docs ? JSON.parse(JSON.stringify(payload.schema_docs)) : undefined,
    itens: payload.itens.map((item) => ({
      ...item,
      fundamentos: Array.isArray(item.fundamentos) ? [...item.fundamentos] : [],
      alternativas_grupo: item.alternativas_grupo ? [...item.alternativas_grupo] : undefined,
      palavras_chave: Array.isArray(item.palavras_chave) ? [...item.palavras_chave] : [],
      embedding_text: item.embedding_text ?? "",
    })),
    grupos: payload.grupos?.map((grupo) => ({
      ...grupo,
      segmento: grupo.segmento ?? null,
      pesos_opcoes: Array.isArray(grupo.pesos_opcoes) ? [...grupo.pesos_opcoes] : [],
      pesos_brutos: Array.isArray(grupo.pesos_brutos) ? [...grupo.pesos_brutos] : [],
      subitens: [...grupo.subitens],
    })),
  };
}

function sortGroups(grupos: GabaritoGrupo[]): GabaritoGrupo[] {
  return [...grupos].sort((a, b) => {
    const qa = questaoOrderIndex(a.questao);
    const qb = questaoOrderIndex(b.questao);
    if (qa === qb) return a.indice - b.indice;
    return qa - qb;
  });
}

function reindexGroups(grupos: GabaritoGrupo[]): GabaritoGrupo[] {
  const sorted = sortGroups(grupos);
  const counters = new Map<string, number>();
  return sorted.map((grupo) => {
    const current = counters.get(grupo.questao) ?? 0;
    const nextIndex = current + 1;
    counters.set(grupo.questao, nextIndex);
    return { ...grupo, indice: nextIndex };
  });
}

function buildOuGroupId(ids?: string[]): string | undefined {
  if (!ids || !ids.length) return undefined;
  const sorted = [...ids].sort();
  return `OG-${sorted.join("|")}`;
}

function convertRubricToSubitems(payload: RubricPayload): Subitem[] {
  return payload.itens.map((item) => ({
    id: item.id,
    escopo: item.escopo === "Questão" ? "Questão" : "Peça",
    questao: item.questao as Subitem["questao"],
    descricao: item.descricao,
    peso: typeof item.peso === "number" ? roundTwo(item.peso) : null,
    fundamentos: item.fundamentos ?? [],
    palavras_chave: item.palavras_chave ?? [],
    embedding_text: item.embedding_text ?? "",
    ou_group_id: buildOuGroupId(item.alternativas_grupo),
    ou_group_mode: "pick_best",
  }));
}

function sanitizePesoInput(raw: string): number | null {
  const normalized = raw.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return roundTwo(parsed);
}

function renderPontuacaoLabel(pontos: { total: number; esperado: number; ok: boolean; desvio: number }) {
  const delta = pontos.desvio >= 0 ? `+${pontos.desvio.toFixed(2)}` : pontos.desvio.toFixed(2);
  return `${pontos.total.toFixed(2)} / ${pontos.esperado.toFixed(2)} (${delta}) ${pontos.ok ? "✅" : "⚠️"}`;
}

type RubricListProps = {
  summaries: RubricSummary[];
  onSelect: (id: string) => void;
  selectedId: string | null;
  loading: boolean;
  onRefresh: () => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
};

function RubricList({
  summaries,
  onSelect,
  selectedId,
  loading,
  onRefresh,
  searchTerm,
  onSearchTermChange,
}: RubricListProps) {
  return (
    <aside className="w-full border-r border-border lg:w-80 bg-background flex flex-col">
      <div className="p-4 border-b border-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Gabaritos</h2>
          <button
            className="text-xs rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-50"
            onClick={onRefresh}
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Buscar por exame, área ou ID..."
          className="w-full rounded border border-border px-2 py-1 text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Carregando gabaritos...</div>
        ) : summaries.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Nenhum gabarito encontrado.</div>
        ) : (
          <ul className="divide-y divide-border">
            {summaries.map((rubric) => {
              const isActive = rubric.id === selectedId;
              return (
                <li key={rubric.id}>
                  <button
                    className={`w-full text-left p-3 transition ${isActive ? "bg-primary/10" : "hover:bg-muted/60"}`}
                    onClick={() => onSelect(rubric.id)}
                  >
                    <div className="text-sm font-medium flex items-center justify-between gap-2">
                      <span>{rubric.exam ?? rubric.id}</span>
                      <span className="text-xs text-muted-foreground">{rubric.version ?? "v?."}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {rubric.area ?? "Área indefinida"} — {rubric.counts.itens} itens / {rubric.counts.grupos} grupos
                    </div>
                    {rubric.pontuacao ? (
                      <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-2">
                        <span>Peça: {rubric.pontuacao.peca.total.toFixed(2)}</span>
                        <span>Questões: {rubric.pontuacao.questoes.total.toFixed(2)}</span>
                        <span>Geral: {rubric.pontuacao.geral.total.toFixed(2)}</span>
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

type GroupTableProps = {
  grupos: GabaritoGrupo[];
  selectedGroupIds: Set<string>;
  activeGroupId: string | null;
  onToggleSelect: (grupoId: string) => void;
  onActivate: (grupoId: string) => void;
};

function GroupTable({ grupos, selectedGroupIds, activeGroupId, onToggleSelect, onActivate }: GroupTableProps) {
  if (!grupos.length) {
    return <div className="rounded border border-border bg-muted/40 p-4 text-sm text-muted-foreground">Nenhum grupo cadastrado.</div>;
  }

  return (
    <div className="rounded border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2"></th>
            <th className="w-12 px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Questão</th>
            <th className="px-3 py-2 text-left">Rótulo</th>
            <th className="w-24 px-3 py-2 text-right">Peso máx.</th>
            <th className="w-20 px-3 py-2 text-right">Subitens</th>
            <th className="w-32 px-3 py-2 text-left">Variante</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((grupo) => {
            const isSelected = selectedGroupIds.has(grupo.id);
            const isActive = activeGroupId === grupo.id;
            return (
              <tr
                key={grupo.id}
                className={`border-t border-border ${isActive ? "bg-primary/5" : "hover:bg-muted/40 cursor-pointer"}`}
                onClick={() => onActivate(grupo.id)}
              >
                <td className="px-3 py-2 align-middle" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(grupo.id)}
                    className="h-4 w-4"
                  />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{grupo.indice}</td>
                <td className="px-3 py-2 text-xs">{QUESTAO_LABEL[grupo.questao] ?? grupo.questao}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-sm">{grupo.rotulo}</div>
                  <div className="text-xs text-muted-foreground truncate">{grupo.descricao_limpa || grupo.descricao}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">{grupo.peso_maximo.toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-xs">{grupo.subitens.length}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {grupo.variant_family ? `${grupo.variant_family} → ${grupo.variant_key ?? "?"}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type GroupDetailProps = {
  grupo: GabaritoGrupo | null;
  onUpdate: (changes: Partial<GabaritoGrupo>) => void;
  onRemoveVariant: () => void;
};

function GroupDetailPanel({ grupo, onUpdate, onRemoveVariant }: GroupDetailProps) {
  if (!grupo) {
    return (
      <div className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
        Selecione um grupo para visualizar os detalhes.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded border border-border bg-card/80 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Detalhes do Grupo</h3>
        <span className="text-[11px] text-muted-foreground font-mono">{grupo.id}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium uppercase text-muted-foreground">
          Questão
          <input
            value={grupo.questao}
            onChange={(event) => onUpdate({ questao: event.target.value as GabaritoGrupo["questao"] })}
            className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-medium uppercase text-muted-foreground">
          Índice
          <input
            type="number"
            value={grupo.indice}
            onChange={(event) => onUpdate({ indice: Number.parseInt(event.target.value, 10) || 1 })}
            className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
          />
        </label>
      </div>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Rótulo
        <input
          value={grupo.rotulo}
          onChange={(event) => onUpdate({ rotulo: event.target.value })}
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Peso máximo
        <input
          value={grupo.peso_maximo.toString()}
          onChange={(event) => {
            const next = sanitizePesoInput(event.target.value);
            onUpdate({ peso_maximo: next ?? 0 });
          }}
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm font-mono"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Pesos opções (separados por vírgula)
        <input
          value={(grupo.pesos_opcoes ?? []).join(", ")}
          onChange={(event) => {
            const values = event.target.value
              .split(",")
              .map((v) => sanitizePesoInput(v))
              .filter((v): v is number => typeof v === "number");
            onUpdate({ pesos_opcoes: values });
          }}
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Segmento
        <input
          value={grupo.segmento ?? ""}
          onChange={(event) => onUpdate({ segmento: event.target.value })}
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Descrição
        <textarea
          value={grupo.descricao}
          onChange={(event) => onUpdate({ descricao: event.target.value })}
          className="mt-1 h-24 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Descrição (limpa)
        <textarea
          value={grupo.descricao_limpa}
          onChange={(event) => onUpdate({ descricao_limpa: event.target.value })}
          className="mt-1 h-20 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Descrição (bruta)
        <textarea
          value={grupo.descricao_bruta}
          onChange={(event) => onUpdate({ descricao_bruta: event.target.value })}
          className="mt-1 h-20 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <div className="grid grid-cols-1 gap-2 text-xs">
        <div>
          <span className="font-medium uppercase text-muted-foreground">Variante</span>
          {grupo.variant_family ? (
            <div className="mt-1 space-y-1 rounded border border-border p-2">
              <div>
                <span className="font-semibold">Família:</span> {grupo.variant_family}
              </div>
              <div>
                <span className="font-semibold">Chave:</span> {grupo.variant_key ?? "—"}
              </div>
              <div>
                <span className="font-semibold">Rótulo:</span> {grupo.variant_label ?? "—"}
              </div>
              <button
                className="mt-1 text-xs underline text-red-600 hover:text-red-700"
                onClick={onRemoveVariant}
                type="button"
              >
                Remover vínculo de variante
              </button>
            </div>
          ) : (
            <div className="mt-1 text-muted-foreground">Nenhuma variante associada.</div>
          )}
        </div>
      </div>
    </div>
  );
}

type SubitemDetailProps = {
  subitem: RubricPayload["itens"][number] | null;
  onUpdate: (changes: Partial<RubricPayload["itens"][number]>) => void;
};

function SubitemDetailPanel({ subitem, onUpdate }: SubitemDetailProps) {
  if (!subitem) {
    return (
      <div className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
        Selecione um subitem para editar.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded border border-border bg-card/80 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Subitem</h3>
        <span className="text-[11px] text-muted-foreground font-mono">{subitem.id}</span>
      </div>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Questão
        <input
          value={subitem.questao}
          onChange={(event) => onUpdate({ questao: event.target.value })}
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Escopo
        <input
          value={subitem.escopo}
          onChange={(event) => onUpdate({ escopo: event.target.value })}
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Peso
        <input
          value={subitem.peso != null ? subitem.peso.toString() : ""}
          onChange={(event) => {
            const next = sanitizePesoInput(event.target.value);
            onUpdate({ peso: next });
          }}
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm font-mono"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Descrição
        <textarea
          value={subitem.descricao}
          onChange={(event) => onUpdate({ descricao: event.target.value })}
          className="mt-1 h-24 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Fundamentos (um por linha)
        <textarea
          value={(subitem.fundamentos ?? []).join("\n")}
          onChange={(event) =>
            onUpdate({
              fundamentos: event.target.value
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          }
          className="mt-1 h-20 w-full rounded border border-border px-2 py-1 text-sm font-mono"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Palavras-chave (separadas por vírgula)
        <input
          value={(subitem.palavras_chave ?? []).join(", ")}
          onChange={(event) =>
            onUpdate({
              palavras_chave: event.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          }
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Alternativas (IDs separados por vírgula)
        <input
          value={(subitem.alternativas_grupo ?? []).join(", ")}
          onChange={(event) =>
            onUpdate({
              alternativas_grupo: event.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          }
          className="mt-1 w-full rounded border border-border px-2 py-1 text-sm font-mono"
        />
      </label>
      <label className="text-xs font-medium uppercase text-muted-foreground">
        Texto de embedding
        <textarea
          value={subitem.embedding_text ?? ""}
          onChange={(event) => onUpdate({ embedding_text: event.target.value })}
          className="mt-1 h-24 w-full rounded border border-border px-2 py-1 text-xs font-mono"
        />
      </label>
    </div>
  );
}

export default function OabRubricAuditorPage() {
  const [summaries, setSummaries] = useState<RubricSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RubricDetail | null>(null);
  const [draft, setDraft] = useState<RubricPayload | null>(null);
  const [baselineHash, setBaselineHash] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("TODOS");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeSubitemId, setActiveSubitemId] = useState<string | null>(null);
  const [metaEditor, setMetaEditor] = useState<string>("{}");
  const [metaParseError, setMetaParseError] = useState<string | null>(null);
  const [headerDraft, setHeaderDraft] = useState<{ code: string; exam: string; area: string; version: string }>({
    code: "",
    exam: "",
    area: "",
    version: "",
  });

  const fetchSummaries = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await fetch("/api/oab-eval/rubrics");
      if (!response.ok) throw new Error("Falha ao carregar gabaritos");
      const data = (await response.json()) as { rubrics: RubricSummary[] };
      setSummaries(data?.rubrics ?? []);
    } catch (error) {
      console.error("[OAB::AUDITORIA] Falha ao listar gabaritos", error);
      toast.error((error as Error).message ?? "Erro ao carregar gabaritos");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  const fetchDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/oab-eval/rubrics/${id}`);
        if (!response.ok) throw new Error("Falha ao carregar detalhes do gabarito");
        const data = (await response.json()) as { rubric: RubricDetail };
        if (!data?.rubric) throw new Error("Resposta inválida do servidor");

        setDetail(data.rubric);
        setDraft(cloneRubricPayload(data.rubric.schema));
        setBaselineHash(JSON.stringify(data.rubric.schema));
        setSelectedGroupIds(new Set());
        setActiveGroupId(null);
        setActiveSubitemId(null);
        const metaFromSchema = data.rubric.schema.meta ?? data.rubric.meta ?? {};
        setMetaEditor(JSON.stringify(metaFromSchema ?? {}, null, 2));
        setMetaParseError(null);
        setHeaderDraft({
          code: data.rubric.code ?? "",
          exam: data.rubric.exam ?? "",
          area: data.rubric.area ?? "",
          version: data.rubric.version ?? "",
        });
      } catch (error) {
        console.error("[OAB::AUDITORIA] Falha ao obter detalhes", error);
        toast.error((error as Error).message ?? "Erro ao carregar gabarito");
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const handleSelectRubric = useCallback(
    (id: string) => {
      setSelectedId(id);
      fetchDetail(id);
    },
    [fetchDetail],
  );

  const filteredSummaries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return summaries;
    return summaries.filter((rubric) => {
      const meta = [
        rubric.id,
        rubric.exam ?? "",
        rubric.area ?? "",
        rubric.version ?? "",
        rubric.meta ? JSON.stringify(rubric.meta) : "",
      ]
        .join(" ")
        .toLowerCase();
      return meta.includes(term);
    });
  }, [summaries, searchTerm]);

  const gruposOrdenados = useMemo(() => {
    if (!draft?.grupos) return [];
    const gruposFiltrados =
      groupFilter === "TODOS" ? draft.grupos : draft.grupos.filter((grupo) => grupo.questao === groupFilter);
    return sortGroups(
      gruposFiltrados.filter((grupo) => {
        if (!searchTerm.trim()) return true;
        const text = `${grupo.rotulo} ${grupo.descricao} ${grupo.descricao_limpa}`.toLowerCase();
        return text.includes(searchTerm.trim().toLowerCase());
      }),
    );
  }, [draft, groupFilter, searchTerm]);

  const subitemsById = useMemo(() => {
    const map = new Map<string, RubricPayload["itens"][number]>();
    draft?.itens.forEach((item) => map.set(item.id, item));
    return map;
  }, [draft]);

  const activeGroup = useMemo(() => {
    if (!activeGroupId || !draft?.grupos) return null;
    return draft.grupos.find((grupo) => grupo.id === activeGroupId) ?? null;
  }, [activeGroupId, draft]);

  const activeSubitem = useMemo(() => {
    if (!activeSubitemId || !draft) return null;
    return draft.itens.find((item) => item.id === activeSubitemId) ?? null;
  }, [activeSubitemId, draft]);

  const subitemsSemGrupo = useMemo(() => {
    if (!draft) return [];
    const usados = new Set<string>();
    (draft.grupos ?? []).forEach((grupo) => {
      grupo.subitens.forEach((id) => usados.add(id));
    });
    return draft.itens.filter((item) => !usados.has(item.id));
  }, [draft]);

  const pontuacaoAtual = useMemo(() => {
    if (!draft) return null;
    try {
      const subitems = convertRubricToSubitems(draft);
      return verificarPontuacao(subitems);
    } catch (error) {
      console.warn("[OAB::AUDITORIA] Falha ao calcular pontuação local", error);
      return null;
    }
  }, [draft]);

  const hasUnsavedChanges = useMemo(() => {
    if (!draft) return false;
    const snapshot = JSON.stringify(draft);
    return snapshot !== baselineHash;
  }, [draft, baselineHash]);

  const toggleGroupSelection = useCallback((groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const updateGrupo = useCallback((groupId: string, changes: Partial<GabaritoGrupo>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const gruposAtualizados = (prev.grupos ?? []).map((grupo) =>
        grupo.id === groupId ? ({ ...grupo, ...changes } as GabaritoGrupo) : grupo,
      );
      return { ...prev, grupos: gruposAtualizados };
    });
  }, []);

  const removeVariantFromGroup = useCallback(
    (groupId: string) => {
      updateGrupo(groupId, { variant_family: undefined, variant_key: undefined, variant_label: undefined });
    },
    [updateGrupo],
  );

  const handleDeleteSelectedGroups = useCallback(() => {
    if (!draft || selectedGroupIds.size === 0) {
      toast.info("Selecione pelo menos um grupo para remover.");
      return;
    }
    if (!confirm(`Remover ${selectedGroupIds.size} grupo(s) selecionado(s)?`)) return;

    setDraft((prev) => {
      if (!prev) return prev;
      const remaining = (prev.grupos ?? []).filter((grupo) => !selectedGroupIds.has(grupo.id));
      return { ...prev, grupos: reindexGroups(remaining) };
    });
    setSelectedGroupIds(new Set());
    if (activeGroupId && selectedGroupIds.has(activeGroupId)) {
      setActiveGroupId(null);
    }
  }, [draft, selectedGroupIds, activeGroupId]);

  const handleMergeGroups = useCallback(() => {
    if (!draft || selectedGroupIds.size < 2) {
      toast.info("Selecione dois ou mais grupos para mesclar.");
      return;
    }

    setDraft((prev) => {
      if (!prev?.grupos) return prev;
      const gruposOriginais = prev.grupos;
      const selecionados = gruposOriginais.filter((grupo) => selectedGroupIds.has(grupo.id));
      if (selecionados.length < 2) return prev;

      const [principal, ...restantes] = selecionados;
      const merged: GabaritoGrupo = {
        ...principal,
        rotulo: `${principal.rotulo} + ${restantes.map((g) => g.rotulo).join(" / ")}`,
        descricao: [principal.descricao, ...restantes.map((g) => g.descricao)].join("\n\n---\n\n"),
        descricao_bruta: [principal.descricao_bruta, ...restantes.map((g) => g.descricao_bruta)].join("\n\n---\n\n"),
        descricao_limpa: [principal.descricao_limpa, ...restantes.map((g) => g.descricao_limpa)].join("\n\n---\n\n"),
        peso_maximo: roundTwo(
          [principal, ...restantes].reduce((acc, grupo) => acc + (grupo.peso_maximo ?? 0), 0),
        ),
        pesos_opcoes: mergePesoArrays(principal.pesos_opcoes, ...restantes.map((g) => g.pesos_opcoes)),
        pesos_brutos: mergePesoArrays(principal.pesos_brutos, ...restantes.map((g) => g.pesos_brutos)),
        subitens: uniq([principal.subitens, ...restantes.map((g) => g.subitens)].flat()),
        variant_family: undefined,
        variant_key: undefined,
        variant_label: undefined,
      };

      const outros = gruposOriginais.filter((grupo) => !selectedGroupIds.has(grupo.id));
      return { ...prev, grupos: reindexGroups([...outros, merged]) };
    });

    const primeiroId = Array.from(selectedGroupIds)[0];
    setSelectedGroupIds(new Set([primeiroId]));
    setActiveGroupId(primeiroId);
  }, [draft, selectedGroupIds]);

  const handleReindexGroups = useCallback(() => {
    if (!draft?.grupos) return;
    setDraft((prev) => {
      if (!prev?.grupos) return prev;
      return { ...prev, grupos: reindexGroups(prev.grupos) };
    });
  }, [draft]);

  const handleSubitemUpdate = useCallback((subitemId: string, changes: Partial<RubricPayload["itens"][number]>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const itens = prev.itens.map((item) =>
        item.id === subitemId
          ? {
              ...item,
              ...changes,
              peso: changes.peso === undefined ? item.peso : changes.peso,
            }
          : item,
      );
      return { ...prev, itens };
    });
  }, []);

  const handleRemoveSubitemFromGroup = useCallback((groupId: string, subitemId: string) => {
    setDraft((prev) => {
      if (!prev?.grupos) return prev;
      const gruposAtualizados = prev.grupos.map((grupo) => {
        if (grupo.id !== groupId) return grupo;
        return {
          ...grupo,
          subitens: grupo.subitens.filter((id) => id !== subitemId),
        };
      });
      return { ...prev, grupos: gruposAtualizados };
    });
  }, []);

  const handleMoveSubitemBetweenGroups = useCallback((fromGroupId: string, subitemId: string, toGroupId: string) => {
    setDraft((prev) => {
      if (!prev?.grupos) return prev;
      const gruposAtualizados = prev.grupos.map((grupo) => {
        if (grupo.id === fromGroupId) {
          return { ...grupo, subitens: grupo.subitens.filter((id) => id !== subitemId) };
        }
        if (grupo.id === toGroupId) {
          if (grupo.subitens.includes(subitemId)) return grupo;
          return { ...grupo, subitens: [...grupo.subitens, subitemId] };
        }
        return grupo;
      });
      return { ...prev, grupos: gruposAtualizados };
    });
    setActiveGroupId(toGroupId);
  }, []);

  const handleShiftSubitem = useCallback((groupId: string, subitemId: string, direction: "up" | "down") => {
    setDraft((prev) => {
      if (!prev?.grupos) return prev;
      const gruposAtualizados = prev.grupos.map((grupo) => {
        if (grupo.id !== groupId) return grupo;
        const index = grupo.subitens.indexOf(subitemId);
        if (index === -1) return grupo;
        const target = direction === "up" ? index - 1 : index + 1;
        if (target < 0 || target >= grupo.subitens.length) return grupo;
        const novaLista = [...grupo.subitens];
        [novaLista[index], novaLista[target]] = [novaLista[target], novaLista[index]];
        return { ...grupo, subitens: novaLista };
      });
      return { ...prev, grupos: gruposAtualizados };
    });
  }, []);

  const handleAddSubitemToGroup = useCallback(
    (groupId: string, subitemId: string) => {
      setDraft((prev) => {
        if (!prev?.grupos) return prev;
        const gruposAtualizados = prev.grupos.map((grupo) => {
          if (grupo.id !== groupId) return grupo;
          if (grupo.subitens.includes(subitemId)) return grupo;
          return { ...grupo, subitens: [...grupo.subitens, subitemId] };
        });
        return { ...prev, grupos: gruposAtualizados };
      });
    },
    [],
  );

  const applyMetaEditor = useCallback(
    (value: string) => {
      setMetaEditor(value);
      try {
        const parsed = value.trim() ? JSON.parse(value) : {};
        setMetaParseError(null);
        setDraft((prev) => (prev ? { ...prev, meta: parsed } : prev));
      } catch (error) {
        setMetaParseError((error as Error).message ?? "JSON inválido");
      }
    },
    [],
  );

  const handleReset = useCallback(() => {
    if (!detail) return;
    setDraft(cloneRubricPayload(detail.schema));
    setBaselineHash(JSON.stringify(detail.schema));
    const metaFromSchema = detail.schema.meta ?? detail.meta ?? {};
    setMetaEditor(JSON.stringify(metaFromSchema ?? {}, null, 2));
    setMetaParseError(null);
    setHeaderDraft({
      code: detail.code ?? "",
      exam: detail.exam ?? "",
      area: detail.area ?? "",
      version: detail.version ?? "",
    });
    setSelectedGroupIds(new Set());
    setActiveGroupId(null);
    setActiveSubitemId(null);
    toast.success("Alterações descartadas.");
  }, [detail]);

  const handleSave = useCallback(async () => {
    if (!draft || !selectedId) return;
    if (metaParseError) {
      toast.error("Corrija o JSON de meta antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        schema: { ...draft, grupos: draft.grupos ?? [] },
        meta: draft.meta ?? null,
        code: headerDraft.code || null,
        exam: headerDraft.exam || null,
        area: headerDraft.area || null,
        version: headerDraft.version || null,
      };
      const response = await fetch(`/api/oab-eval/rubrics/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Falha ao salvar gabarito");

      const rubric: RubricDetail = data.rubric;
      setDetail(rubric);
      setDraft(cloneRubricPayload(rubric.schema));
      setBaselineHash(JSON.stringify(rubric.schema));
      toast.success("Gabarito salvo com sucesso.");
      fetchSummaries();
    } catch (error) {
      console.error("[OAB::AUDITORIA] Falha ao salvar gabarito", error);
      toast.error((error as Error).message ?? "Erro ao salvar gabarito");
    } finally {
      setSaving(false);
    }
  }, [draft, selectedId, metaParseError, headerDraft, fetchSummaries]);

  return (
    <div className="flex h-full min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Auditoria de Gabaritos OAB</h1>
            <p className="text-sm text-muted-foreground">
              Explore, audite e ajuste grupos, subitens e pontuações gerados pelo parser determinístico.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
              onClick={handleReset}
              disabled={!detail || detailLoading || saving}
            >
              Descartar alterações
            </button>
            <button
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              onClick={handleSave}
              disabled={!draft || saving || detailLoading || !!metaParseError}
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <RubricList
          summaries={filteredSummaries}
          onSelect={handleSelectRubric}
          selectedId={selectedId}
          loading={listLoading}
          onRefresh={fetchSummaries}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
        />

        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {detailLoading ? (
            <div className="rounded border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              Carregando detalhes do gabarito...
            </div>
          ) : !draft || !detail ? (
            <div className="rounded border border-dashed border-border bg-muted/20 p-10 text-center text-muted-foreground">
              Selecione um gabarito na lateral para iniciar a auditoria.
            </div>
          ) : (
            <>
              <section className="rounded border border-border bg-card/80 p-4 space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">{detail.exam ?? detail.id}</h2>
                    <div className="text-sm text-muted-foreground">
                      Área: <span className="font-medium">{headerDraft.area || "—"}</span> · Versão:{" "}
                      <span className="font-medium">{headerDraft.version || "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Criado em {new Date(detail.createdAt).toLocaleString("pt-BR")} · Atualizado em{" "}
                      {new Date(detail.updatedAt).toLocaleString("pt-BR")}
                    </div>
                    {hasUnsavedChanges ? (
                      <div className="text-xs text-amber-600">Existem alterações não salvas.</div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <label className="text-[11px] uppercase text-muted-foreground">
                      Código
                      <input
                        value={headerDraft.code}
                        onChange={(event) => setHeaderDraft((prev) => ({ ...prev, code: event.target.value }))}
                        className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-[11px] uppercase text-muted-foreground">
                      Exame
                      <input
                        value={headerDraft.exam}
                        onChange={(event) => setHeaderDraft((prev) => ({ ...prev, exam: event.target.value }))}
                        className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-[11px] uppercase text-muted-foreground">
                      Área
                      <input
                        value={headerDraft.area}
                        onChange={(event) => setHeaderDraft((prev) => ({ ...prev, area: event.target.value }))}
                        className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-[11px] uppercase text-muted-foreground">
                      Versão
                      <input
                        value={headerDraft.version}
                        onChange={(event) => setHeaderDraft((prev) => ({ ...prev, version: event.target.value }))}
                        className="mt-1 w-full rounded border border-border px-2 py-1 text-sm"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded border border-border bg-muted/20 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Peça</div>
                    {pontuacaoAtual ? (
                      <div className="mt-1 text-sm font-semibold">
                        {renderPontuacaoLabel(pontuacaoAtual.peca)}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">—</div>
                    )}
                  </div>
                  <div className="rounded border border-border bg-muted/20 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Questões</div>
                    {pontuacaoAtual ? (
                      <div className="mt-1 text-sm font-semibold">
                        {renderPontuacaoLabel(pontuacaoAtual.questoes)}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">—</div>
                    )}
                  </div>
                  <div className="rounded border border-border bg-muted/20 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Total geral</div>
                    {pontuacaoAtual ? (
                      <div className="mt-1 text-sm font-semibold">
                        {renderPontuacaoLabel(pontuacaoAtual.geral)}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">—</div>
                    )}
                  </div>
                </div>

                {pontuacaoAtual ? (
                  <details className="rounded border border-border bg-muted/10 p-3 text-xs">
                    <summary className="cursor-pointer font-medium">Pontuação por questão</summary>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Object.entries(pontuacaoAtual.questoes.porQuestao).map(([questao, pontuacao]) => (
                        <div key={questao} className="rounded border border-border bg-background/80 p-2">
                          <div className="text-[11px] uppercase text-muted-foreground">{QUESTAO_LABEL[questao] ?? questao}</div>
                          <div className="text-sm font-medium">{renderPontuacaoLabel(pontuacao)}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </section>

              <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr),minmax(0,1fr)]">
                <div className="space-y-4 lg:pr-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <label className="text-xs uppercase text-muted-foreground">Filtrar questão</label>
                      <select
                        value={groupFilter}
                        onChange={(event) => setGroupFilter(event.target.value)}
                        className="rounded border border-border px-2 py-1 text-sm"
                      >
                        <option value="TODOS">Todas</option>
                        {QUESTAO_ORDER.map((questao) => (
                          <option key={questao} value={questao}>
                            {QUESTAO_LABEL[questao] ?? questao}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        onClick={handleMergeGroups}
                        disabled={selectedGroupIds.size < 2}
                      >
                        Mesclar selecionados
                      </button>
                      <button
                        className="rounded border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        onClick={handleDeleteSelectedGroups}
                        disabled={selectedGroupIds.size === 0}
                      >
                        Remover selecionados
                      </button>
                      <button
                        className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
                        onClick={handleReindexGroups}
                      >
                        Reindexar grupos
                      </button>
                    </div>
                  </div>
                  <GroupTable
                    grupos={gruposOrdenados}
                    selectedGroupIds={selectedGroupIds}
                    activeGroupId={activeGroupId}
                    onToggleSelect={toggleGroupSelection}
                    onActivate={(id) => {
                      setActiveGroupId(id);
                      setActiveSubitemId(null);
                    }}
                  />

                  {subitemsSemGrupo.length ? (
                    <div className="rounded border border-border bg-amber-50/80 p-3 text-xs text-amber-800">
                      <div className="font-semibold">Subitens sem grupo ({subitemsSemGrupo.length})</div>
                      <p>
                        Esses subitens não estão associados a nenhum grupo. Utilize o seletor de subitens para adicioná-los onde fizer sentido.
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {subitemsSemGrupo.map((item) => (
                          <span key={item.id} className="font-mono">
                            {item.id} — {item.descricao.slice(0, 60)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 lg:pl-2 lg:pr-1 lg:sticky lg:top-28 self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
                  <GroupDetailPanel
                    grupo={activeGroup}
                    onUpdate={(changes) => {
                      if (activeGroup) updateGrupo(activeGroup.id, changes);
                    }}
                    onRemoveVariant={() => {
                      if (activeGroup) removeVariantFromGroup(activeGroup.id);
                    }}
                  />

                  {activeGroup ? (
                    <div className="space-y-3 rounded border border-border bg-card/80 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Subitens do grupo</h3>
                        <div className="text-xs text-muted-foreground">
                          Total: <span className="font-medium">{activeGroup.subitens.length}</span>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {activeGroup.subitens.map((subId, index) => {
                          const subitem = subitemsById.get(subId);
                          const podeMoverCima = index > 0;
                          const podeMoverBaixo = index < activeGroup.subitens.length - 1;

                          return (
                            <div
                              key={`${activeGroup.id}-${subId}`}
                              className={`rounded border border-border p-3 text-xs ${activeSubitemId === subId ? "bg-primary/5" : "bg-background/80"}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  className="font-semibold text-left"
                                  onClick={() => setActiveSubitemId(subId)}
                                >
                                  {subId}
                                </button>
                                <div className="flex items-center gap-1">
                                  <button
                                    className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-40"
                                    onClick={() => handleShiftSubitem(activeGroup.id, subId, "up")}
                                    disabled={!podeMoverCima}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-40"
                                    onClick={() => handleShiftSubitem(activeGroup.id, subId, "down")}
                                    disabled={!podeMoverBaixo}
                                  >
                                    ↓
                                  </button>
                                </div>
                              </div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {subitem ? subitem.descricao.slice(0, 160) : "Subitem não encontrado na rubrica."}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <select
                                  value={activeGroup.id}
                                  onChange={(event) =>
                                    handleMoveSubitemBetweenGroups(activeGroup.id, subId, event.target.value)
                                  }
                                  className="rounded border border-border px-2 py-1 text-xs"
                                >
                                  {(draft.grupos ?? []).map((grupo) => (
                                    <option key={grupo.id} value={grupo.id}>
                                      {QUESTAO_LABEL[grupo.questao] ?? grupo.questao} · {grupo.rotulo}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="text-[11px] text-red-600 underline"
                                  onClick={() => handleRemoveSubitemFromGroup(activeGroup.id, subId)}
                                >
                                  Remover
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded border border-dashed border-border p-3 text-xs space-y-2">
                        <div className="font-semibold">Adicionar subitem</div>
                        <select
                          className="w-full rounded border border-border px-2 py-1"
                          onChange={(event) => {
                            if (!event.target.value) return;
                            handleAddSubitemToGroup(activeGroup.id, event.target.value);
                            setActiveSubitemId(event.target.value);
                            event.currentTarget.value = "";
                          }}
                        >
                          <option value="">Selecione um subitem...</option>
                          {draft.itens.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.id} · {item.descricao.slice(0, 80)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}

                  <SubitemDetailPanel
                    subitem={activeSubitem}
                    onUpdate={(changes) => {
                      if (activeSubitem) handleSubitemUpdate(activeSubitem.id, changes);
                    }}
                  />

                  <div className="space-y-2 rounded border border-border bg-card/80 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Meta (JSON)</h3>
                      {metaParseError ? <span className="text-xs text-red-600">{metaParseError}</span> : null}
                    </div>
                    <textarea
                      value={metaEditor}
                      onChange={(event) => applyMetaEditor(event.target.value)}
                      className={`h-40 w-full rounded border px-2 py-1 text-xs font-mono ${
                        metaParseError ? "border-red-500" : "border-border"
                      }`}
                    />
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
