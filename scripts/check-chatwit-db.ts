#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const usuarios = await prisma.usuarioChatwit.findMany({ take: 2 });
  const leads = await prisma.leadChatwit.findMany({ take: 2 });
  const arquivos = await prisma.arquivoLeadChatwit.findMany({ take: 2 });

  const usuariosCount = await prisma.usuarioChatwit.count();
  const leadsCount = await prisma.leadChatwit.count();
  const arquivosCount = await prisma.arquivoLeadChatwit.count();

  console.log('UsuarioChatwit:', usuariosCount);
  usuarios.forEach(u => console.log(u));
  console.log('LeadChatwit:', leadsCount);
  leads.forEach(l => console.log(l));
  console.log('ArquivoLeadChatwit:', arquivosCount);
  arquivos.forEach(a => console.log(a));

  await prisma.$disconnect();
}

main().catch(console.error); 