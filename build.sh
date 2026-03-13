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

Uso: ./build.sh [TAG] [--latest] [--no-latest] [--no-deploy]

Argumentos:
  TAG              Tag da imagem (default: git sha curto)
  --latest         Também publica a tag latest
  --no-latest      Garante que latest não será publicada
  --no-deploy      Pula o force-update dos serviços em produção

Exemplos:
  ./build.sh                  # Build, push e update com tag baseada no commit
  ./build.sh v1.2.3           # Build, push e update com tag 'v1.2.3'
  ./build.sh v1.2.3 --latest  # Publica v1.2.3 e também latest
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

generate_default_tag() {
  if git rev-parse --short HEAD >/dev/null 2>&1; then
    git rev-parse --short HEAD
  else
    date +%Y%m%d%H%M%S
  fi
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
TAG=""
NO_DEPLOY=false
PUSH_LATEST=true

for arg in "$@"; do
  case "${arg}" in
    help|--help|-h)
      show_help
      exit 0
      ;;
    --latest)
      PUSH_LATEST=true
      ;;
    --no-latest)
      PUSH_LATEST=false
      ;;
    --no-deploy)
      NO_DEPLOY=true
      ;;
    *)
      TAG="${arg}"
      ;;
  esac
done

if [ -z "${TAG}" ]; then
  TAG="$(generate_default_tag)"
fi

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
if [ "${PUSH_LATEST}" = true ]; then
  echo "║  🏷️  Publicar latest: ATIVO"
else
  echo "║  🏷️  Publicar latest: DESATIVADO"
fi
if [ "${CAN_DEPLOY}" = true ]; then
  echo "║  🔄 Deploy automático: ATIVO"
elif [ "${NO_DEPLOY}" = true ]; then
  echo "║  ⏭️  Deploy automático: DESATIVADO (--no-deploy)"
else
  echo "║  ⚠️  Deploy automático: SEM CONFIG (defina PORTAINER_URL)"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Garantir PostgreSQL disponível para o build ────────────────────────────
_BUILD_DB_NAME="socialwise"        # Deve coincidir com o ARG DATABASE_URL do Dockerfile.prod
_BUILD_DB_USER="postgres"
_BUILD_DB_PASS="postgres"
_BUILD_POSTGRES_STARTED=false

_start_postgres_for_build() {
  if nc -z localhost 5432 2>/dev/null; then
    echo "  ✓ PostgreSQL disponível em localhost:5432"
    return 0
  fi
  echo "  → PostgreSQL não encontrado. Iniciando serviço 'postgres' do compose..."
  docker compose up -d postgres
  _BUILD_POSTGRES_STARTED=true

  echo "  → Aguardando PostgreSQL estar pronto..."
  local retries=30
  until docker compose exec -T postgres pg_isready -U "$_BUILD_DB_USER" &>/dev/null; do
    retries=$((retries - 1))
    [ "$retries" -le 0 ] && echo "  ✗ Timeout aguardando PostgreSQL" && return 1
    sleep 1
  done

  # Cria o banco com o nome exato usado no build arg (case-sensitive no PostgreSQL)
  docker compose exec -T postgres psql -U "$_BUILD_DB_USER" \
    -tc "SELECT 1 FROM pg_database WHERE datname = '${_BUILD_DB_NAME}'" \
    | grep -q 1 \
    || docker compose exec -T postgres createdb -U "$_BUILD_DB_USER" "$_BUILD_DB_NAME"

  # Aplica migrations para criar as tabelas (SSG precisa delas existir)
  echo "  → Aplicando migrations em '${_BUILD_DB_NAME}'..."
  DATABASE_URL="postgresql://${_BUILD_DB_USER}:${_BUILD_DB_PASS}@localhost:5432/${_BUILD_DB_NAME}" \
    pnpm exec prisma migrate deploy

  echo "  ✓ PostgreSQL pronto para o build"
}

_cleanup_build_postgres() {
  if [ "$_BUILD_POSTGRES_STARTED" = "true" ]; then
    echo ""
    echo "==> Parando postgres de build (iniciado automaticamente)..."
    docker compose stop postgres && echo "  ✓ postgres parado"
  fi
}

# Garante cleanup mesmo se o build falhar
trap '_cleanup_build_postgres' EXIT

echo "==> [0] Verificando PostgreSQL para build..."
_start_postgres_for_build
echo ""
# ─────────────────────────────────────────────────────────────────────────────

echo "==> [1/${TOTAL_STEPS}] Building image..."
docker compose build app

echo ""
echo "==> [2/${TOTAL_STEPS}] Tagging as: ${FULL_TAG}"
if [ "${TAG}" != "latest" ]; then
  docker tag "${IMAGE}:latest" "${FULL_TAG}"
fi

echo ""
echo "==> [3/${TOTAL_STEPS}] Pushing: ${FULL_TAG}"
docker push "${FULL_TAG}"

if [ "${PUSH_LATEST}" = true ]; then
  echo ""
  echo "==> [4/${TOTAL_STEPS}] Pushing: ${IMAGE}:latest"
  if [ "${TAG}" != "latest" ]; then
    docker tag "${FULL_TAG}" "${IMAGE}:latest"
  fi
  docker push "${IMAGE}:latest"
else
  echo ""
  echo "==> [4/${TOTAL_STEPS}] Skipping latest push"
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
      deploy_ok=$((deploy_ok + 1))
      # Delay defensivo: worker deve começar o rollout antes da app disparar jobs
      if [ "${svc}" = "worker" ] && [ "${#SWARM_SERVICES[@]}" -gt 1 ]; then
        echo "  ⌛ Aguardando 1s para worker iniciar o rolling update..."
        sleep 1
      fi
    else
      deploy_fail=$((deploy_fail + 1))
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
echo "     - ${FULL_TAG}"
if [ "${PUSH_LATEST}" = true ]; then
  echo "     - ${IMAGE}:latest"
fi
if [ -n "${DEPLOY_STATUS}" ]; then
  echo ""
  echo "${DEPLOY_STATUS}"
fi
echo ""
