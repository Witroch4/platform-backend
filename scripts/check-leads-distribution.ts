#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';

async function checkLeadsDistribution() {
  console.log('🔍 Verificando distribuição dos leads no backup...');

  try {
    // Ler o backup mais recente
    const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-12_18-25-34.json');
    const backupData = JSON.parse(readFileSync(backupPath, 'utf-8'));
    
    const leads = backupData.data.leadsChatwit;
    const usuarios = backupData.data.usuariosChatwit;

    console.log(`📊 Total de leads no backup: ${leads.length}`);
    console.log(`👥 Total de usuários Chatwit no backup: ${usuarios.length}`);

    usuarios.forEach((u: any) => {
      const leadsDoUsuario = leads.filter((l: any) => l.usuarioId === u.id);
      console.log(`${u.name} (${u.id}): ${leadsDoUsuario.length} leads`);
    });

    // Verificar leads sem usuário
    const leadsSemUsuario = leads.filter((l: any) => !usuarios.find((u: any) => u.id === l.usuarioId));
    if (leadsSemUsuario.length > 0) {
      console.log(`⚠️ Leads sem usuário: ${leadsSemUsuario.length}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  checkLeadsDistribution().catch(console.error);
}

export { checkLeadsDistribution }; 