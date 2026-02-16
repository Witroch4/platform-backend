#!/usr/bin/env bash
# =============================================================================
# build.sh - Build e Push de Imagens Docker para PRODUÇÃO
# =============================================================================
# Para logs e debug em dev, use: ./dev.sh logs worker [tar|cat]
# =============================================================================

set -euo pipefail

IMAGE="witrocha/socialwise"

show_help() {
  cat << EOF
╔══════════════════════════════════════════════════════════════╗
║        🚀  Build & Push para Produção                       ║
╚══════════════════════════════════════════════════════════════╝

Uso: ./build.sh [TAG]

Argumentos:
  TAG              Tag da imagem (default: latest)

Exemplos:
  ./build.sh                  # Build e push com tag 'latest'
  ./build.sh v1.2.3           # Build e push com tag 'v1.2.3' + latest
  ./build.sh staging          # Build e push com tag 'staging' + latest

Nota:
  Este script é para PRODUÇÃO (build + push Docker Hub).
  Para logs/debug em dev, use: ./dev.sh logs worker [tar|cat]

Imagem: ${IMAGE}
EOF
}

# ===== Main Logic =====
case "${1:-}" in
  help|--help|-h)
    show_help
    exit 0
    ;;
esac

TAG="${1:-latest}"
FULL_TAG="${IMAGE}:${TAG}"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  🚀 Build & Push: ${FULL_TAG}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "==> [1/4] Building image..."
docker compose build app

if [ "${TAG}" != "latest" ]; then
  echo ""
  echo "==> [2/4] Tagging as: ${FULL_TAG}"
  docker tag "${IMAGE}:latest" "${FULL_TAG}"
else
  echo ""
  echo "==> [2/4] Using tag: latest (skipping additional tag)"
fi

echo ""
echo "==> [3/4] Pushing: ${IMAGE}:latest"
docker push "${IMAGE}:latest"

if [ "${TAG}" != "latest" ]; then
  echo ""
  echo "==> [4/4] Pushing: ${FULL_TAG}"
  docker push "${FULL_TAG}"
else
  echo ""
  echo "==> [4/4] Skipping additional push (tag is latest)"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ Build & Push completo!                                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  📦 Imagens disponíveis:"
echo "     - ${IMAGE}:latest"
if [ "${TAG}" != "latest" ]; then
  echo "     - ${FULL_TAG}"
fi
echo ""
