# PDF-to-Image Pipeline

Converte PDFs unificados de leads em imagens otimizadas para OCR por agentes de IA (GPT-4o, Gemini).

## Performance

| Metrica | Original (GhostScript) | Atual (pdftoppm + sharp) | Ganho |
|---------|------------------------|--------------------------|-------|
| Tempo (11 pgs, 695KB PDF) | 61s | **13.5s** | -78% |
| Tamanho por pagina | 8-11 MB | **90-506 KB** | -95% |
| Total storage (11 pgs) | ~100 MB | **~3.5 MB** | -96% |
| Thumbnails geradas | Sim (150px, desnecessario) | Nao (desativado) | -11 uploads |

## Arquitetura

```
POST /api/admin/leads-chatwit/convert-to-images
  │
  ├─ 1. Download PDF do MinIO
  ├─ 2. pdfinfo → total de paginas
  ├─ 3. Divide em 3 ranges paralelos (pdftoppm -r 300 -jpeg q90)
  ├─ 4. sharp: resize max 2048px + JPEG q80 (por pagina)
  └─ 5. Upload paralelo ao MinIO (concorrencia 6, sem thumbnail)
```

### Decisoes de Design

**Porque pdftoppm (e nao GhostScript)?**
- pdftoppm (poppler-utils) e 2-4x mais rapido para rasterizacao de PDF
- GhostScript `-dNumRenderingThreads` e unreliable (single-thread na pratica)
- GhostScript mantido como fallback tier 1 caso pdftoppm nao esteja disponivel

**Porque render a 300 DPI + downscale com sharp (e nao render direto a ~150 DPI)?**
- 300 DPI captura detalhes finos de manuscritos (tracos de caneta = 3-6px)
- sharp usa Lanczos3 para downscale — qualidade superior a render nativo em DPI baixo
- O downscale e para 2048px no lado mais longo (limite do OpenAI "high" detail)

**Porque JPEG q80 (e nao q90)?**
- Para documentos/manuscritos, q80 e visualmente identico a q90
- Reducao de ~50-60% no tamanho do arquivo vs q90
- Artefatos JPEG so sao visiveis abaixo de q70 em documentos

**Porque desativar thumbnails?**
- Com imagens otimizadas de ~300-500KB, o proprio arquivo serve como "thumbnail"
- Eliminamos 11 uploads extras ao MinIO + 11 operacoes sharp adicionais
- O frontend pode usar as imagens diretamente sem notar diferenca de performance

## Arquivo Principal

`app/api/admin/leads-chatwit/convert-to-images/route.ts`

### Constantes

```typescript
const UPLOAD_CONCURRENCY = 6;       // Uploads paralelos ao MinIO
const RENDER_PARALLELISM = 3;       // Ranges de paginas renderizados em paralelo
const IMAGE_MAX_DIMENSION = 2048;   // Max px no lado mais longo (cap OpenAI)
const IMAGE_JPEG_QUALITY = 80;      // JPEG quality pos-processamento
```

### Funcoes-chave

| Funcao | Papel |
|--------|-------|
| `convertPdfToImages()` | Orquestra: download → render → upload → salva no DB |
| `renderPageRange()` | Renderiza range de paginas com pdftoppm (tier 0) ou GhostScript (tier 1) |
| `optimizePageImage()` | sharp: resize 2048px + JPEG q80 |
| `uploadBatch()` | Upload paralelo ao MinIO com otimizacao por pagina |
| `getPageCount()` | `pdfinfo` para obter total de paginas |

### Pipeline de Rendering

1. **Divide paginas em ranges**: Para 11 paginas com `RENDER_PARALLELISM=3`: ranges `1-4`, `5-8`, `9-11`
2. **Render paralelo**: Cada range executa `pdftoppm` independentemente
3. **Upload sobreposto**: Conforme cada range termina, inicia upload imediato (nao espera os outros ranges)
4. **Otimizacao inline**: Cada pagina passa por `optimizePageImage()` antes do upload

### Fallback

Se pdftoppm falhar (binario ausente, erro de rendering), o sistema tenta GhostScript automaticamente:

```
Tier 0: pdftoppm -jpeg -jpegopt quality=90 -r 300
Tier 1: gs -sDEVICE=jpeg -dJPEGQ=90 -r300
```

## Consumidores

| Consumidor | Como usa | Beneficio da otimizacao |
|------------|----------|-------------------------|
| `transcription-agent.ts` | Baixa imagem → base64 → envia ao modelo de visao | 95% menos dados para download e encode |
| `mirror-generation.task.ts` | Mesmo fluxo do transcription agent | Mesmo beneficio |
| `BatchManuscritoDialog.tsx` | Exibe grid de imagens para selecao | Carrega ~3.5MB total vs ~100MB |
| `BatchEspelhoDialog.tsx` | Exibe grid para correcao de espelho | Mesmo beneficio |

## Dependencias

- **poppler-utils**: `pdftoppm` e `pdfinfo` (instalado via `apk add` nos Dockerfiles)
- **ghostscript**: fallback (ja presente nos Dockerfiles)
- **sharp**: pos-processamento de imagens (ja presente no package.json)

## Logs

O pipeline produz logs estruturados com prefixo `[PDF-TO-IMAGE]`:

```
[PDF-TO-IMAGE] INFO: Total de paginas: 11
[PDF-TO-IMAGE] INFO: Rendering paralelo: 3 ranges (1-4, 5-8, 9-11)
[PDF-TO-IMAGE] INFO: Range 9-11: 3 imagens renderizadas
[PDF-TO-IMAGE] INFO: page-09.jpg: 6245KB → 302KB
[PDF-TO-IMAGE] INFO: page-01.jpg: 8963KB → 486KB
[PDF-TO-IMAGE] INFO: Conversao concluida: 11 imagens em 13.5s
```

## Historico de Otimizacoes

| Data | Mudanca | Impacto |
|------|---------|---------|
| 2026-03-19 | GhostScript → pdftoppm + render paralelo | 61s → 16s |
| 2026-03-19 | PNG → JPEG q90 (revert de teste PNG) | Manteve 16s (PNG era 40s) |
| 2026-03-20 | sharp post-processing (resize 2048px + q80) | 8-11MB → 90-506KB/pg |
| 2026-03-20 | Desativar thumbnail generation | -11 uploads extras |
| 2026-03-20 | **Python pipeline** (JusMonitorIA backend) | 13.5s → ~4-6s (**3× mais rapido**) |

---

## Python Pipeline (JusMonitorIA)

> Alternativa ao pipeline local (pdftoppm + sharp) que roda no backend Python do JusMonitorIA via rede Docker interna. Ativada por env `PYTHON_PIPELINE=true`.

### Por que mais rapido?

| Aspecto | Node.js (local) | Python (JusMonitorIA) |
|---------|-----------------|----------------------|
| **Engine** | pdftoppm (subprocess fork+exec) | **PyMuPDF (binding C direto, zero subprocess)** |
| **Resize** | sharp (libvips) | Pillow (Lanczos) |
| **Tempo (11 pgs)** | 13.5s | **~4-6s** |
| **Paralelismo** | 3 ranges (subprocess) | ProcessPoolExecutor (N CPUs) |

PyMuPDF renderiza **in-process** via binding C ao MuPDF — elimina ~200ms de overhead por fork/exec.

### Endpoint

```
POST http://backend:8000/api/v1/pdf/convert-to-images
Header: X-Internal-Key: <PJE_INTERNAL_API_KEY>

Body: {
  "pdf_urls": ["https://objstoreapi.witdev.com.br/socialwise/lead-xxx.pdf"],
  "bucket": "socialwise",
  "prefix": "leads/converted",
  "max_dimension": 2048,
  "jpeg_quality": 80,
  "dpi": 300
}

Response: {
  "success": true,
  "image_urls": ["https://objstoreapi.witdev.com.br/socialwise/leads/converted/abc123/page-000.jpg", ...],
  "total_pages": 11,
  "elapsed_seconds": 4.2,
  "failed_urls": []
}
```

### Configuracao no Socialwise

```env
# .env
PYTHON_PIPELINE=true
JUSMONITORIA_BACKEND_URL=http://backend:8000  # Docker internal
PJE_INTERNAL_API_KEY=<mesma chave do .env do JusMonitorIA>
```

### Arquivos no JusMonitorIA

| Arquivo | Papel |
|---------|-------|
| `backend/app/core/services/pdf_image_converter.py` | Renderizacao PyMuPDF + Pillow |
| `backend/app/api/v1/endpoints/pdf_converter.py` | Endpoint FastAPI |
| `backend/app/core/services/storage.py` | `upload_bytes_to_bucket()` |

