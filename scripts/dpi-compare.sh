#!/bin/sh
# Compara qualidade 300 DPI vs 200 DPI usando pdftoppm (grayscale PNG)
# Uso: docker exec socialwise_app sh /app/scripts/dpi-compare.sh <pdf-path-or-url>

set -e

PDF_INPUT="$1"
if [ -z "$PDF_INPUT" ]; then
  echo "Uso: $0 <pdf-path-ou-url>"
  exit 1
fi

WORKDIR="/tmp/dpi-compare-$$"
mkdir -p "$WORKDIR/300dpi" "$WORKDIR/200dpi"

# Se for URL, baixar primeiro
if echo "$PDF_INPUT" | grep -q "^http"; then
  echo "Baixando PDF..."
  curl -sL -o "$WORKDIR/input.pdf" "$PDF_INPUT" || wget -q -O "$WORKDIR/input.pdf" "$PDF_INPUT"
  PDF_PATH="$WORKDIR/input.pdf"
else
  PDF_PATH="$PDF_INPUT"
fi

PDF_SIZE=$(wc -c < "$PDF_PATH" | tr -d ' ')
PAGES=$(pdfinfo "$PDF_PATH" 2>/dev/null | grep "^Pages:" | awk '{print $2}')
echo "PDF: $PDF_SIZE bytes, $PAGES páginas"
echo ""

# Renderiza página 1 em grayscale PNG (mesmo formato da pipeline real)
echo "=== Renderizando página 1 a 300 DPI (gray PNG) ==="
START_300=$(date +%s%N)
pdftoppm -gray -png -r 300 -f 1 -l 1 "$PDF_PATH" "$WORKDIR/300dpi/page"
END_300=$(date +%s%N)
TIME_300=$(( (END_300 - START_300) / 1000000 ))

echo "=== Renderizando página 1 a 200 DPI (gray PNG) ==="
START_200=$(date +%s%N)
pdftoppm -gray -png -r 200 -f 1 -l 1 "$PDF_PATH" "$WORKDIR/200dpi/page"
END_200=$(date +%s%N)
TIME_200=$(( (END_200 - START_200) / 1000000 ))

# Stats
FILE_300=$(ls "$WORKDIR/300dpi/"*.png 2>/dev/null | head -1)
FILE_200=$(ls "$WORKDIR/200dpi/"*.png 2>/dev/null | head -1)

SIZE_300=$(wc -c < "$FILE_300" | tr -d ' ')
SIZE_200=$(wc -c < "$FILE_200" | tr -d ' ')

# Dimensões
DIM_300=$(identify -format "%wx%h" "$FILE_300" 2>/dev/null || echo "N/A")
DIM_200=$(identify -format "%wx%h" "$FILE_200" 2>/dev/null || echo "N/A")

# Tamanho legível
KB_300=$(( SIZE_300 / 1024 ))
KB_200=$(( SIZE_200 / 1024 ))

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       COMPARAÇÃO 300 vs 200 DPI (gray PNG)       ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Métrica         │  300 DPI      │  200 DPI      ║"
echo "╠══════════════════════════════════════════════════╣"
printf "║  Dimensões       │  %-13s│  %-13s║\n" "$DIM_300" "$DIM_200"
printf "║  Tamanho         │  %-13s│  %-13s║\n" "${KB_300} KB" "${KB_200} KB"
printf "║  Tempo render    │  %-13s│  %-13s║\n" "${TIME_300}ms" "${TIME_200}ms"
echo "╠══════════════════════════════════════════════════╣"
if [ "$SIZE_300" -gt 0 ]; then
  SAVINGS=$(( (SIZE_300 - SIZE_200) * 100 / SIZE_300 ))
  printf "║  Economia tam.   │  %d%% menor                   ║\n" "$SAVINGS"
fi
if [ "$TIME_300" -gt 0 ]; then
  SPEED=$(( (TIME_300 - TIME_200) * 100 / TIME_300 ))
  printf "║  Economia tempo  │  %d%% mais rápido              ║\n" "$SPEED"
else
  printf "║  Economia tempo  │  ambos < 1s                  ║\n"
fi
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Arquivos para comparação visual:"
echo "  300 DPI: $FILE_300"
echo "  200 DPI: $FILE_200"
echo ""
echo "Copie pro host:"
echo "  docker cp socialwise_app:$FILE_300 ./page-300dpi.png"
echo "  docker cp socialwise_app:$FILE_200 ./page-200dpi.png"

if [ "$PAGES" -gt 1 ]; then
  PROJ_300=$(( TIME_300 * PAGES ))
  PROJ_200=$(( TIME_200 * PAGES ))
  echo ""
  echo "Projeção para $PAGES páginas (render only):"
  echo "  300 DPI: ~${PROJ_300}ms"
  echo "  200 DPI: ~${PROJ_200}ms"
fi
