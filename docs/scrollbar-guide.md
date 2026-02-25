# Guia de Scrollbars — Radix ScrollArea vs CSS Nativo

## As duas opções no projeto

### 1. Radix ScrollArea (azul — `components/ui/scroll-area.tsx`)

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";

<ScrollArea className="h-[300px]">
  {/* conteúdo */}
</ScrollArea>
```

**Como funciona:** Radix renderiza um overlay customizado (DOM próprio) por cima do conteúdo. O thumb é um `<div>` com classes Tailwind (`bg-blue-500`), **não** depende de CSS do navegador.

| Vantagem | Detalhe |
|---|---|
| Cross-browser idêntico | Mesmo visual no Chrome, Firefox, Safari, Edge |
| Estilo total via Tailwind | Cor, tamanho, border-radius, hover, animação — tudo controlável |
| Acessibilidade | Radix cuida de aria-roles e keyboard nav |
| Consistência com Shadcn/UI | Mesmo sistema de componentes do resto da UI |

| Desvantagem | Detalhe |
|---|---|
| DOM extra | Wrapper `Root` + `Viewport` + `Scrollbar` + `Thumb` |
| Layout wrapping | O conteúdo fica dentro de `Viewport` — pode afetar CSS de filhos (ex: grid/flex) |

**Quando usar:**
- Dialogs, painéis laterais, listas dentro de modais
- Qualquer lugar onde a scrollbar faz parte da UI visível e precisa combinar com o design
- Quando precisa de visual consistente cross-browser

---

### 2. CSS Nativo (`scrollbar-custom` — `globals.css`)

```tsx
<div className="max-h-[300px] overflow-y-auto scrollbar-custom">
  {/* conteúdo */}
</div>
```

**Como funciona:** Usa `scrollbar-width: thin` (Firefox) e `::-webkit-scrollbar` (Chrome/Safari) para estilizar a scrollbar nativa do navegador.

| Vantagem | Detalhe |
|---|---|
| Zero DOM extra | Sem wrappers, sem overhead |
| Layout preservado | `overflow-y-auto` num div normal — grid/flex funcionam direto |
| Simples | Uma classe e pronto |

| Desvantagem | Detalhe |
|---|---|
| Visual varia por browser | Firefox usa `scrollbar-color` (limitado), Safari pode ignorar `::-webkit-scrollbar` |
| Controle limitado | Sem hover transitions suaves, sem animação de appear/disappear |
| Cor via CSS var | Usa `hsl(var(--primary))` — funciona, mas menos flexível que Tailwind classes |

**Quando usar:**
- Tabelas com scroll, grids de dados, áreas de conteúdo onde a scrollbar é secundária
- Quando o wrapper extra do Radix interfere no layout (ex: grid dentro de table cell)

---

## Resumo rápido

| Critério | Radix ScrollArea | CSS Nativo |
|---|---|---|
| Visual cross-browser | Idêntico | Varia |
| Customização | Total (Tailwind) | Limitada (CSS vars) |
| DOM overhead | Sim (wrappers) | Nenhum |
| Layout impact | Pode afetar grid/flex | Nenhum |
| Acessibilidade | Built-in | Nativa do browser |
| **Use quando...** | UI visível (dialogs, panels) | Dados/tabelas (discreto) |

## Regra geral

> **Se a scrollbar é parte do design → Radix ScrollArea.**
> **Se a scrollbar é utilitária e discreta → CSS nativo com `scrollbar-custom`.**
