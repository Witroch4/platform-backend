#!/usr/bin/env bash
# =============================================================================
# build.sh - Build e Push de Imagens Docker para PRODUÇÃO
# =============================================================================
# Para logs e debug em dev, use: ./dev.sh logs worker [tar|cat]
# =============================================================================

set -euo pipefail

IMAGE="witrocha/socialwise"
STACK_NAME="socialwise"
# Serviços Swarm para atualizar (nomes dentro do compose)
# ATENÇÃO: Worker deve atualizar ANTES da App para evitar race condition de payload (BullMQ)
SWARM_SERVICES=("worker" "socialwise_app")

# Portainer config (pode vir de .env.local, .env.development ou variáveis de ambiente)
for envfile in .env.local .env.development; do
  if [ -f "${envfile}" ] && grep -qE '^PORTAINER_' "${envfile}" 2>/dev/null; then
    eval "$(grep -E '^PORTAINER_' "${envfile}" | sed 's/^/export /')"
    break
  fi
done

PORTAINER_URL="${PORTAINER_URL:-}"
PORTAINER_API_KEY="${PORTAINER_API_KEY:-}"
PORTAINER_ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-1}"

show_help() {
  cat << EOF
╔══════════════════════════════════════════════════════════════╗
║        🚀  Build & Push para Produção                       ║
╚══════════════════════════════════════════════════════════════╝

Uso: ./build.sh [TAG] [--no-deploy]

Argumentos:
  TAG              Tag da imagem (default: latest)
  --no-deploy      Pula o force-update dos serviços em produção

Exemplos:
  ./build.sh                  # Build, push e force-update produção
  ./build.sh v1.2.3           # Build, push e update com tag 'v1.2.3'
  ./build.sh --no-deploy      # Só build e push, sem atualizar produção

Deploy automático (Portainer):
  Defina no .env.local ou como variáveis de ambiente:
    PORTAINER_URL=https://portainer.witdev.com.br
    PORTAINER_API_KEY=ptr_xxxxxxxxxxxx
    PORTAINER_ENDPOINT_ID=1  (default: 1)

Nota:
  Este script é para PRODUÇÃO (build + push Docker Hub).
  Para logs/debug em dev, use: ./dev.sh logs worker [tar|cat]

Imagem: ${IMAGE}
EOF
}

# =============================================================================
# Função: Force-update de um serviço Swarm via Portainer Docker Proxy API
# =============================================================================
force_update_service() {
  local service_name="${STACK_NAME}_${1}"
  local image="${IMAGE}:${2}"

  echo "  → Buscando serviço: ${service_name}..."

  # 1. Listar serviços e encontrar o ID + versão
  local services_json
  services_json=$(curl -sf -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/services?filters=%7B%22name%22%3A%5B%22${service_name}%22%5D%7D" \
    2>/dev/null) || {
    echo "  ✗ Erro ao listar serviços. Verifique PORTAINER_URL e PORTAINER_API_KEY."
    return 1
  }

  # Encontrar o serviço exato (filter pode retornar parciais)
  local service_id version current_spec
  service_id=$(echo "${services_json}" | jq -r --arg name "${service_name}" \
    '.[] | select(.Spec.Name == $name) | .ID' 2>/dev/null)

  if [ -z "${service_id}" ] || [ "${service_id}" = "null" ]; then
    echo "  ✗ Serviço '${service_name}' não encontrado no Swarm."
    return 1
  fi

  # 2. Obter spec completa do serviço
  local service_detail
  service_detail=$(curl -sf -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/services/${service_id}" \
    2>/dev/null) || {
    echo "  ✗ Erro ao obter detalhes do serviço ${service_name}."
    return 1
  }

  version=$(echo "${service_detail}" | jq '.Version.Index')
  current_spec=$(echo "${service_detail}" | jq '.Spec')

  # 3. Atualizar imagem + incrementar ForceUpdate (equivale a --force)
  local updated_spec
  updated_spec=$(echo "${current_spec}" | jq \
    --arg img "${image}" \
    '.TaskTemplate.ForceUpdate = ((.TaskTemplate.ForceUpdate // 0) + 1) |
     .TaskTemplate.ContainerSpec.Image = $img')

  # 4. Aplicar update
  local http_code
  http_code=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "X-API-Key: ${PORTAINER_API_KEY}" \
    -H "Content-Type: application/json" \
    "${PORTAINER_URL}/api/endpoints/${PORTAINER_ENDPOINT_ID}/docker/services/${service_id}/update?version=${version}" \
    -d "${updated_spec}" \
    2>/dev/null) || http_code="000"

  if [ "${http_code}" = "200" ]; then
    echo "  ✓ ${service_name} → atualizado para ${image} (force-update)"
    return 0
  else
    echo "  ✗ Falha ao atualizar ${service_name} (HTTP ${http_code})"
    return 1
  fi
}

# ===== Parse Arguments =====
TAG="latest"
NO_DEPLOY=false

for arg in "$@"; do
  case "${arg}" in
    help|--help|-h)
      show_help
      exit 0
      ;;
    --no-deploy)
      NO_DEPLOY=true
      ;;
    *)
      TAG="${arg}"
      ;;
  esac
done

FULL_TAG="${IMAGE}:${TAG}"

# Detectar se deploy é possível
CAN_DEPLOY=false
if [ "${NO_DEPLOY}" = false ] && [ -n "${PORTAINER_URL}" ] && [ -n "${PORTAINER_API_KEY}" ]; then
  CAN_DEPLOY=true
fi

TOTAL_STEPS=4
if [ "${CAN_DEPLOY}" = true ]; then
  TOTAL_STEPS=5
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  🚀 Build & Push: ${FULL_TAG}"
if [ "${CAN_DEPLOY}" = true ]; then
  echo "║  🔄 Deploy automático: ATIVO"
elif [ "${NO_DEPLOY}" = true ]; then
  echo "║  ⏭️  Deploy automático: DESATIVADO (--no-deploy)"
else
  echo "║  ⚠️  Deploy automático: SEM CONFIG (defina PORTAINER_URL)"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "==> [1/${TOTAL_STEPS}] Building image..."
docker compose build app

if [ "${TAG}" != "latest" ]; then
  echo ""
  echo "==> [2/${TOTAL_STEPS}] Tagging as: ${FULL_TAG}"
  docker tag "${IMAGE}:latest" "${FULL_TAG}"
else
  echo ""
  echo "==> [2/${TOTAL_STEPS}] Using tag: latest (skipping additional tag)"
fi

echo ""
echo "==> [3/${TOTAL_STEPS}] Pushing: ${IMAGE}:latest"
docker push "${IMAGE}:latest"

if [ "${TAG}" != "latest" ]; then
  echo ""
  echo "==> [4/${TOTAL_STEPS}] Pushing: ${FULL_TAG}"
  docker push "${FULL_TAG}"
else
  echo ""
  echo "==> [4/${TOTAL_STEPS}] Skipping additional push (tag is latest)"
fi

# Delay para propagação da imagem no Registry (evita pull de imagem velha/404)
echo ""
echo "⌛ Aguardando 5s para propagação da imagem no registry..."
sleep 5

# ===== Step 5: Force-update dos serviços em produção =====
DEPLOY_STATUS=""
if [ "${CAN_DEPLOY}" = true ]; then
  echo ""
  echo "==> [5/${TOTAL_STEPS}] Force-update dos serviços em produção..."
  echo ""

  deploy_ok=0
  deploy_fail=0

  for svc in "${SWARM_SERVICES[@]}"; do
    if force_update_service "${svc}" "${TAG}"; then
      ((deploy_ok++))
      # Delay defensivo: worker deve começar o rollout antes da app disparar jobs
      if [ "${svc}" = "worker" ] && [ "${#SWARM_SERVICES[@]}" -gt 1 ]; then
        echo "  ⌛ Aguardando 1s para worker iniciar o rolling update..."
        sleep 1
      fi
    else
      ((deploy_fail++))
    fi
  done

  echo ""
  if [ "${deploy_fail}" -eq 0 ]; then
    DEPLOY_STATUS="  🔄 Deploy: ${deploy_ok} serviço(s) atualizado(s) com sucesso"
  else
    DEPLOY_STATUS="  ⚠️  Deploy: ${deploy_ok} ok, ${deploy_fail} falha(s)"
  fi
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
if [ -n "${DEPLOY_STATUS}" ]; then
  echo ""
  echo "${DEPLOY_STATUS}"
fi
echo ""
