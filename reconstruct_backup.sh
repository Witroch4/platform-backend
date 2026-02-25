#!/bin/bash

# Este script será preenchido com as partes base64 do servidor
# Placeholder para a reconstrução

parts=(aa ab ac ad ae af ag ah ai aj ak al am an)

> backup-20260224-095158.sql.gz

for part in "${parts[@]}"; do
  echo "Aguardando parte $part..."
  # As partes serão salvas como variáveis de ambiente pelo CLI
  if [ ! -z "${PART_$part}" ]; then
    echo "${PART_$part}" | base64 -d >> backup-20260224-095158.sql.gz
  fi
done

if [ -s backup-20260224-095158.sql.gz ]; then
  echo "✅ Backup reconstruído!"
  ls -lh backup-20260224-095158.sql.gz
  md5sum backup-20260224-095158.sql.gz
fi
