#!/usr/bin/env bash
# =============================================================================
# dev.sh - Script para gerenciar o ambiente de desenvolvimento do Chatwit Social
# =============================================================================
#
# Tudo roda em Docker. Basta executar:
#   ./dev.sh           → Sobe tudo (app, worker, redis, postgres)
#   ./dev.sh -n        → Sobe tudo + ngrok (túnel público)
#
# E abrir: http://localhost:3002
#
# =============================================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configurações
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose-dev.yml"
COMPOSE_FILE_NGROK="$SCRIPT_DIR/docker-compose-dev-ngrok.yml"
ENV_FILE="$SCRIPT_DIR/.env.development"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"
SHARED_INFRA_DIR="/home/wital/shared-infra"
SHARED_INFRA_COMPOSE="$SHARED_INFRA_DIR/docker-compose.yml"
SHARED_NETWORK="minha_rede"
NGROK_MODE=false

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────────────────────
# Funções auxiliares
# ─────────────────────────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
log_success() { echo -e "${GREEN}✔${NC}  $1"; }
log_warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
log_error()   { echo -e "${RED}✖${NC}  $1"; }
log_header()  { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }

# Verifica se .env.development existe
ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_EXAMPLE" ]; then
      log_warn "Arquivo .env.development não encontrado. Criando a partir de .env.example..."
      cp "$ENV_EXAMPLE" "$ENV_FILE"
      log_success ".env.development criado! Edite-o conforme necessário."
    else
      log_error "Nem .env.development nem .env.example encontrados!"
      exit 1
    fi
  fi
}

# Verifica dependências necessárias
check_dependencies() {
  local missing=()

  if ! command -v docker &> /dev/null; then
    missing+=("docker")
  fi

  if ! docker compose version &> /dev/null 2>&1; then
    if ! command -v docker-compose &> /dev/null; then
      missing+=("docker-compose")
    fi
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    log_error "Dependências faltando: ${missing[*]}"
    log_info "Instale as dependências e tente novamente."
    exit 1
  fi
}

# Garante que a rede externa existe
ensure_network() {
  if ! docker network inspect "$SHARED_NETWORK" &> /dev/null; then
    log_info "Criando rede Docker '$SHARED_NETWORK'..."
    docker network create "$SHARED_NETWORK" > /dev/null
    log_success "Rede '$SHARED_NETWORK' criada!"
  fi
}

# Comando Docker Compose (suporta v1 e v2)
dc() {
  local compose_file="$COMPOSE_FILE"
  if [ "$NGROK_MODE" = true ]; then
    compose_file="$COMPOSE_FILE_NGROK"
  fi

  if docker compose version &> /dev/null 2>&1; then
    docker compose -f "$compose_file" "$@"
  else
    docker-compose -f "$compose_file" "$@"
  fi
}

infra_dc() {
  if docker compose version &> /dev/null 2>&1; then
    docker compose -f "$SHARED_INFRA_COMPOSE" "$@"
  else
    docker-compose -f "$SHARED_INFRA_COMPOSE" "$@"
  fi
}

container_running() {
  local container_name="$1"
  local running

  running=$(docker inspect -f '{{.State.Running}}' "$container_name" 2>/dev/null || true)
  [ "$running" = "true" ]
}

container_healthy() {
  local container_name="$1"
  local health_status

  health_status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_name" 2>/dev/null || true)
  [ "$health_status" = "healthy" ] || [ "$health_status" = "none" ]
}

wait_for_postgres() {
  local retries=0
  local max_retries=30

  until docker exec postgres pg_isready -U postgres -d postgres -q 2>/dev/null; do
    retries=$((retries + 1))
    if [ "$retries" -ge "$max_retries" ]; then
      log_error "Postgres compartilhado não ficou pronto em ${max_retries}s"
      exit 1
    fi
    sleep 1
  done
}

wait_for_redis() {
  local retries=0
  local max_retries=30

  until docker exec redis redis-cli ping 2>/dev/null | grep -q PONG; do
    retries=$((retries + 1))
    if [ "$retries" -ge "$max_retries" ]; then
      log_error "Redis compartilhado não ficou pronto em ${max_retries}s"
      exit 1
    fi
    sleep 1
  done
}

ensure_shared_infra() {
  ensure_network

  if ! container_running postgres || ! container_running redis; then
    log_info "Subindo infra compartilhada (postgres + redis)..."
    infra_dc up -d postgres redis
  else
    log_info "Infra compartilhada já está ativa; validando saúde de postgres e redis..."
  fi

  wait_for_postgres
  wait_for_redis
  log_success "Infra compartilhada pronta!"
}

# ─────────────────────────────────────────────────────────────────────────────
# Comandos
# ─────────────────────────────────────────────────────────────────────────────

cmd_up() {
  log_header "Subindo ambiente de desenvolvimento"

  ensure_env_file
  ensure_shared_infra

  # Sobe containers (sem rebuild)
  dc up -d
  log_info "Aguardando serviços iniciarem..."
  sleep 5

  # Aplica migrations pendentes automaticamente
  log_info "Aplicando migrations pendentes..."
  dc exec -T app pnpm exec prisma migrate deploy 2>&1 | grep -v "^$" || log_warn "Migrations: verifique se o container app está pronto."

  print_urls

  log_info "Exibindo logs (Ctrl+C para parar containers)..."

  # Trap para capturar Ctrl+C e fazer graceful stop
  trap 'echo ""; log_info "Parando containers..."; dc down; log_success "Ambiente parado!"; exit 0' INT TERM

  dc logs -f --tail=100
}

cmd_up_detached() {
  log_header "Subindo ambiente de desenvolvimento (detached)"

  ensure_env_file
  ensure_shared_infra

  dc up -d
  log_info "Aguardando serviços iniciarem..."
  sleep 5

  # Aplica migrations pendentes automaticamente
  log_info "Aplicando migrations pendentes..."
  dc exec -T app pnpm exec prisma migrate deploy 2>&1 | grep -v "^$" || log_warn "Migrations: verifique se o container app está pronto."

  log_success "Ambiente iniciado em background!"
  print_urls
}

print_urls() {
  echo ""
  log_success "Ambiente de desenvolvimento pronto!"
  echo ""
  echo -e "  ${BOLD}${GREEN}URLs:${NC}"
  echo -e "  ${CYAN}🌐 Aplicação${NC}     → ${BOLD}http://localhost:3002${NC}"

  if [ "$NGROK_MODE" = true ]; then
    echo -e "  ${CYAN}🔗 Ngrok${NC}         → ${BOLD}https://moved-chigger-randomly.ngrok-free.app${NC}"
    echo -e "  ${CYAN}🔗 Ngrok UI${NC}      → http://localhost:4040"
  fi
  echo ""
  echo -e "  ${BOLD}Infraestrutura:${NC}"
  echo -e "  ${CYAN}🐘 PostgreSQL${NC}    → localhost:5432 (container compartilhado: postgres)"
  echo -e "  ${CYAN}🔴 Redis${NC}         → localhost:6379 (container compartilhado: redis)"
  echo ""
  echo -e "  ${BOLD}Comandos úteis:${NC}"
  echo -e "    ./dev.sh logs              Ver logs de todos os serviços"
  echo -e "    ./dev.sh logs app          Ver logs apenas da aplicação"
  echo -e "    ./dev.sh logs worker       Ver logs do worker (tempo real)"
  echo -e "    ./dev.sh logs worker tar   Compactar logs do worker"
  echo -e "    ./dev.sh logs worker cat   Ver últimos 500 logs do worker"
  echo -e "    ./dev.sh build             Rebuild incremental ⚡ (usa cache)"
  echo -e "    ./dev.sh build --no-cache  Rebuild limpo 🐌 (lento, só se necessário)"
  echo -e "    ./dev.sh shell             Abrir shell no container app"
  echo -e "    ./dev.sh prisma            Abrir Prisma Studio"
  echo ""
}

cmd_build() {
  local no_cache_flag=""
  
  # Verifica se --no-cache foi passado
  if [ "${1:-}" = "--no-cache" ]; then
    no_cache_flag="--no-cache"
    log_header "Rebuild LIMPO (sem cache - LENTO)"
    log_warn "Isso vai ignorar cache Docker e pode levar vários minutos!"
  else
    log_header "Rebuild incremental (usa cache Docker)"
  fi

  ensure_env_file
  ensure_shared_infra

  # 1. Para containers e remove volumes locais do compose
  log_info "Parando containers..."
  dc down -v --remove-orphans 2>/dev/null || true

  # 2. Garante limpeza de qualquer volume legado de node_modules
  log_info "Removendo volume node_modules..."
  docker volume rm \
    chatwit-social-dev_node_modules \
    socialwise_node_modules \
    socialwise_app_node_modules \
    socialwise_worker_node_modules 2>/dev/null || true

  # 3. Rebuild imagens
  if [ -n "$no_cache_flag" ]; then
    log_info "Rebuildando imagens (--no-cache)..."
    dc build --no-cache
  else
    log_info "Rebuildando imagens (incremental - usa cache)..."
    dc build
  fi

  # 4. Sobe containers em sequência para evitar corrida ao popular o volume node_modules
  log_info "Subindo container app..."
  dc up -d app

  log_info "Subindo container worker..."
  dc up -d worker

  # 5. Aguarda app estar pronto
  log_info "Aguardando serviços iniciarem..."
  sleep 10

  # 6. Gera Prisma Client e roda migrations
  log_info "Gerando Prisma Client..."
  dc exec -T app pnpm exec prisma generate || true

  log_info "Rodando migrations..."
  dc exec -T app pnpm exec prisma migrate deploy || true

  if [ -n "$no_cache_flag" ]; then
    log_success "Build limpo finalizado!"
  else
    log_success "Build incremental finalizado! ⚡"
  fi

  print_urls

  # Exibe logs de todos os serviços após o build
  log_info "Mostrando logs de todos os serviços (Ctrl+C para sair)..."

  # Trap para capturar Ctrl+C e fazer graceful stop também após build
  trap 'echo ""; log_info "Parando containers..."; dc down; log_success "Ambiente parado!"; exit 0' INT TERM

  ./dev.sh logs
}

cmd_down() {
  log_header "Parando ambiente"
  dc down
  log_success "Ambiente parado."
}

cmd_restart() {
  log_header "Reiniciando ambiente"
  dc restart
  log_success "Ambiente reiniciado."
}

# Find worker container dinamicamente
find_worker_container() {
  local container
  container=$(docker ps --format '{{.Names}}' | grep -i worker | head -1)
  if [ -z "$container" ]; then
    log_error "Nenhum container worker encontrado. Containers ativos:"
    docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
    return 1
  fi
  echo "$container"
}

cmd_logs() {
  local service="${1:-}"
  local mode="${2:-live}"
  
  # Se é logs de um serviço specific via docker-compose
  if [ -n "$service" ] && [ "$mode" = "live" ]; then
    dc logs -f --tail 200 "$service"
    return
  fi
  
  # Comandos especiais para worker
  if [ "$service" = "worker" ]; then
    case "$mode" in
      live)
        local container
        container=$(find_worker_container) || return 1
        log_info "Seguindo logs de: $container"
        log_info "Pressione Ctrl+C para parar"
        docker logs -f --tail 200 "$container"
        ;;
      tar)
        local container logfile tarfile
        container=$(find_worker_container) || return 1
        logfile="/tmp/worker_logs_${container}_$(date +%s).log"
        tarfile="/tmp/worker_logs_$(date +%Y%m%d_%H%M%S).tar.gz"
        
        log_info "Capturando logs do worker: $container"
        docker logs --tail 500 "$container" > "$logfile" 2>&1
        
        log_info "Compactando em: $tarfile"
        tar -czf "$tarfile" "$logfile"
        rm -f "$logfile"
        
        log_success "Logs compactados: $tarfile"
        echo "   Tamanho: $(du -h "$tarfile" | cut -f1)"
        echo "   Para extrair: tar -xzf $tarfile"
        ;;
      cat)
        local container
        container=$(find_worker_container) || return 1
        log_info "Últimos 500 logs de: $container"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        docker logs --tail 500 "$container"
        ;;
      *)
        log_error "Modo desconhecido: $mode"
        log_info "Modos disponíveis: live (default), tar, cat"
        return 1
        ;;
    esac
  else
    # Logs de todos os serviços ou específico
    if [ -n "$service" ]; then
      dc logs -f --tail 200 "$service"
    else
      dc logs -f --tail 200
    fi
  fi
}

cmd_status() {
  log_header "Status dos containers"
  dc ps -a
}

cmd_shell() {
  log_info "Abrindo shell no container app..."
  dc exec app sh
}

cmd_exec() {
  log_info "Executando comando no container app..."
  dc exec app "$@"
}

cmd_prisma() {
  log_info "Abrindo Prisma Studio..."
  dc exec app pnpm exec prisma studio
}

cmd_db_migrate() {
  log_header "Rodando migrations"
  ensure_shared_infra
  dc exec app pnpm exec prisma migrate dev
  log_success "Migrations aplicadas!"
}

cmd_db_generate() {
  log_header "Gerando Prisma Client"
  ensure_shared_infra
  dc exec app pnpm exec prisma generate
  log_success "Prisma Client gerado!"
}

cmd_db_reset() {
  log_header "Resetando banco de dados"
  ensure_shared_infra
  log_warn "Isso vai APAGAR todos os dados do banco!"
  read -p "Tem certeza? (y/N): " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    dc exec app pnpm run db:reset:dev
    log_success "Banco de dados resetado!"
  else
    log_info "Operação cancelada."
  fi
}

cmd_db_seed() {
  log_header "Rodando seeds"
  ensure_shared_infra
  dc exec app pnpm exec prisma db seed
  log_success "Seeds aplicados!"
}

cmd_tsc() {
  local target="${1:-}"

  case "$target" in
    worker)
      log_header "Verificando TypeScript (worker)"
      dc exec app pnpm exec tsc --noEmit --project tsconfig.worker.json
      log_success "TypeScript Worker OK!"
      ;;
    all)
      log_header "Verificando TypeScript (projeto + worker)"
      dc exec app pnpm exec tsc --noEmit
      log_success "TypeScript Projeto OK!"
      dc exec app pnpm exec tsc --noEmit --project tsconfig.worker.json
      log_success "TypeScript Worker OK!"
      ;;
    *)
      log_header "Verificando TypeScript"
      dc exec app pnpm exec tsc --noEmit
      log_success "TypeScript OK!"
      ;;
  esac
}

cmd_lint() {
  log_header "Rodando linter"
  dc exec app pnpm run lint
  log_success "Lint concluído!"
}

cmd_test() {
  log_header "Rodando testes"
  dc exec app pnpm test "$@"
}

cmd_install() {
  log_header "Instalando dependências"
  dc exec app pnpm install
  log_success "Dependências instaladas!"
}

cmd_clean() {
  log_header "Limpeza completa"
  log_warn "Isso vai PARAR os containers do Socialwise e REMOVER apenas volumes locais (node_modules). A infra compartilhada não será apagada."
  read -p "Tem certeza? (y/N): " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    dc down -v --remove-orphans
    log_success "Containers parados e volumes removidos."
  else
    log_info "Operação cancelada."
  fi
}

cmd_help() {
  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║        🚀  Chatwit Social - Dev Environment                 ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Uso:${NC} ./dev.sh [comando]"
  echo ""
  echo -e "  ${BOLD}Comandos principais:${NC}"
  echo -e "    ${GREEN}(sem argumento)${NC}   Sobe, segue logs, Ctrl+C para containers"
  echo -e "    ${GREEN}-n${NC}                Sobe com ngrok (túnel público)"
  echo -e "    ${GREEN}up${NC}                Sobe e segue logs (Ctrl+C = stop)"
  echo -e "    ${GREEN}up:d${NC}              Sobe em background (containers persistem)"
  echo -e "    ${GREEN}build${NC}             Rebuild incremental (usa cache - RÁPIDO)"
  echo -e "    ${GREEN}build --no-cache${NC}  Rebuild sem cache (LENTO - só se necessário)"
  echo -e "    ${GREEN}down${NC}              Para todos os containers"
  echo -e "    ${GREEN}restart${NC}           Reinicia todos os containers"
  echo ""
  echo -e "  ${BOLD}Monitoramento:${NC}"
  echo -e "    ${GREEN}logs [serviço] [modo]${NC}  Mostra logs (ex: logs app)"
  echo -e "      ${GREEN}logs worker${NC}          Logs do worker em tempo real"
  echo -e "      ${GREEN}logs worker tar${NC}      Compacta logs do worker em tar.gz"
  echo -e "      ${GREEN}logs worker cat${NC}      Mostra últimos 500 logs"
  echo -e "    ${GREEN}status${NC}                 Mostra status dos containers"
  echo ""
  echo -e "  ${BOLD}Acesso:${NC}"
  echo -e "    ${GREEN}shell${NC}             Abre shell no container app"
  echo -e "    ${GREEN}exec <cmd>${NC}        Executa comando no container"
  echo ""
  echo -e "  ${BOLD}Banco de dados (Prisma):${NC}"
  echo -e "    ${GREEN}prisma${NC}            Abre Prisma Studio"
  echo -e "    ${GREEN}db:migrate${NC}        Roda migrations pendentes"
  echo -e "    ${GREEN}db:generate${NC}       Gera Prisma Client"
  echo -e "    ${GREEN}db:reset${NC}          Reseta o banco (APAGA DADOS!)"
  echo -e "    ${GREEN}db:seed${NC}           Roda seeds do banco"
  echo ""
  echo -e "  ${BOLD}Qualidade de código:${NC}"
  echo -e "    ${GREEN}tsc${NC}               Verifica TypeScript do projeto"
  echo -e "    ${GREEN}tsc worker${NC}        Verifica TypeScript dos workers"
  echo -e "    ${GREEN}tsc all${NC}           Verifica TypeScript projeto + workers"
  echo -e "    ${GREEN}lint${NC}              Roda linter (Biome)"
  echo -e "    ${GREEN}test [args]${NC}       Roda testes (Jest)"
  echo ""
  echo -e "  ${BOLD}Dependências:${NC}"
  echo -e "    ${GREEN}install${NC}           Instala dependências (pnpm install)"
  echo ""
  echo -e "  ${BOLD}Limpeza:${NC}"
  echo -e "    ${GREEN}clean${NC}             Remove containers + volumes"
  echo ""
  echo -e "  ${BOLD}URLs:${NC}"
  echo -e "    🌐 Aplicação    → ${BOLD}http://localhost:3002${NC}"

  echo -e "    🐘 PostgreSQL   → localhost:5432 (compartilhado)"
  echo -e "    🔴 Redis        → localhost:6379 (compartilhado)"
  echo -e "    🔗 Ngrok        → ./dev.sh -n (túnel público)"
  echo -e "    🔗 Ngrok UI     → http://localhost:4040"
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

check_dependencies

# Parse do flag -n (ngrok)
if [ "${1:-}" = "-n" ]; then
  NGROK_MODE=true
  shift
fi

case "${1:-}" in
  up)          cmd_up ;;
  up:d)        cmd_up_detached ;;
  build)       shift; cmd_build "$@" ;;
  down)        cmd_down ;;
  restart)     cmd_restart ;;
  logs)        shift; cmd_logs "$@" ;;
  status)      cmd_status ;;
  shell)       cmd_shell ;;
  exec)        shift; cmd_exec "$@" ;;
  prisma)      cmd_prisma ;;
  db:migrate)  cmd_db_migrate ;;
  db:generate) cmd_db_generate ;;
  db:reset)    cmd_db_reset ;;
  db:seed)     cmd_db_seed ;;
  tsc)         shift; cmd_tsc "$@" ;;
  lint)        cmd_lint ;;
  test)        shift; cmd_test "$@" ;;
  install)     cmd_install ;;
  clean)       cmd_clean ;;
  help|-h|--help) cmd_help ;;
  "")          cmd_up ;;
  *)
    log_error "Comando desconhecido: $1"
    cmd_help
    exit 1
    ;;
esac
