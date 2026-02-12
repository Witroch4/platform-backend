#!/usr/bin/env bash
set -euo pipefail

IMAGE="witrocha/socialwise"
TAG="${1:-latest}"
FULL_TAG="${IMAGE}:${TAG}"

echo "==> Build: ${FULL_TAG}"
docker compose build app

if [ "${TAG}" != "latest" ]; then
  echo "==> Tag adicional: ${FULL_TAG}"
  docker tag "${IMAGE}:latest" "${FULL_TAG}"
fi

echo "==> Push: ${IMAGE}:latest"
docker push "${IMAGE}:latest"

if [ "${TAG}" != "latest" ]; then
  echo "==> Push: ${FULL_TAG}"
  docker push "${FULL_TAG}"
fi

echo "==> Pronto: ${IMAGE}:latest"
