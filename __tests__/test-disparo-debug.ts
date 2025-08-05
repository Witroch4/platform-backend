// test-disparo-debug.ts
// Script para testar o disparo e debug de variáveis

import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

async function testDisparoDebug() {
  console.log('🔍 Testando debug de disparo...\n');

  try {
    // 1. Buscar um template para análise
    const template = await prisma.template.findFirst({
      where: {
        status: 'APPROVED'
      },
      select: {
        id: true,
        templateId: true,
        name: true,
        components: true,
        usuarioChatwitId: true
      }
    });

    if (!template) {
      console.log('❌ Nenhum template aprovado encontrado');
      return;
    }

    console.log('📋 Template encontrado:');
    console.log(`- ID: ${template.id}`);
    console.log(`- Template ID: ${template.templateId}`);
    console.log(`- Nome: ${template.name}`);
    console.log(`- Usuário: ${template.usuarioChatwitId}`);

    // 2. Analisar componentes do template
    const components = template.components as any[];
    console.log('\n🔧 Componentes do template:');
    
    components.forEach((comp, index) => {
      console.log(`\n[${index}] Tipo: ${comp.type}`);
      
      if (comp.type === 'BODY') {
        console.log(`    Texto: "${comp.text}"`);
        
        // Detectar placeholders
        const placeholders = (comp.text.match(/\{\{(\d+)\}\}/g) || []);
        console.log(`    Placeholders encontrados: ${placeholders.length}`);
        if (placeholders.length > 0) {
          console.log(`    Placeholders: ${placeholders.join(', ')}`);
        }
      }
      
      if (comp.type === 'HEADER') {
        console.log(`    Formato: ${comp.format}`);
        if (comp.text) {
          console.log(`    Texto: "${comp.text}"`);
        }
      }
      
      if (comp.type === 'BUTTONS') {
        console.log(`    Botões: ${comp.buttons?.length || 0}`);
        comp.buttons?.forEach((btn: any, btnIndex: number) => {
          console.log(`      [${btnIndex}] ${btn.type}: ${btn.text || btn.phone_number || btn.url || 'N/A'}`);
        });
      }
    });

    // 3. Buscar um lead para teste
    const lead = await prisma.lead.findFirst({
      where: {
        userId: template.usuarioChatwitId,
        phone: { not: null }
      },
      select: {
        id: true,
        name: true,
        phone: true
      }
    });

    if (!lead) {
      console.log('\n❌ Nenhum lead encontrado para este usuário');
      return;
    }

    console.log('\n👤 Lead encontrado:');
    console.log(`- ID: ${lead.id}`);
    console.log(`- Nome: ${lead.name}`);
    console.log(`- Telefone: ${lead.phone}`);

    // 4. Simular diferentes cenários de parâmetros
    const testScenarios = [
      {
        name: 'Sem parâmetros',
        parameters: {}
      },
      {
        name: 'Parâmetros vazios',
        parameters: null
      },
      {
        name: 'Parâmetros com bodyVars',
        parameters: {
          bodyVars: ['Teste', 'Variável 2']
        }
      },
      {
        name: 'Parâmetros com chaves numéricas',
        parameters: {
          '1': 'Primeira variável',
          '2': 'Segunda variável'
        }
      },
      {
        name: 'Parâmetros mistos',
        parameters: {
          bodyVars: ['Var1'],
          headerVar: 'Header Test',
          couponCode: 'TEST123'
        }
      }
    ];

    console.log('\n🧪 Testando cenários de parâmetros:\n');

    testScenarios.forEach((scenario, index) => {
      console.log(`[${index + 1}] ${scenario.name}:`);
      console.log(`    Parameters:`, JSON.stringify(scenario.parameters, null, 2));
      
      // Simular conversão de parâmetros
      const sendOpts: any = {};
      const parameters = scenario.parameters;
      
      if (parameters && Object.keys(parameters).length > 0) {
        const paramKeys = Object.keys(parameters).sort((a, b) => Number(a) - Number(b));
        if (paramKeys.length > 0 && paramKeys.every(key => /^\d+$/.test(key))) {
          sendOpts.bodyVars = paramKeys.map(key => parameters[key]);
        } else {
          if (parameters.bodyVars) sendOpts.bodyVars = parameters.bodyVars;
          if (parameters.headerVar) sendOpts.headerVar = parameters.headerVar;
          if (parameters.headerMedia) sendOpts.headerMedia = parameters.headerMedia;
          if (parameters.buttonOverrides) sendOpts.buttonOverrides = parameters.buttonOverrides;
          if (parameters.couponCode) sendOpts.couponCode = parameters.couponCode;
        }
      }
      
      console.log(`    SendOpts convertido:`, JSON.stringify(sendOpts, null, 2));
      console.log('');
    });

    // 5. Verificar disparos recentes
    const recentDisparos = await prisma.disparoMtfDiamante.findMany({
      where: {
        templateId: template.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5,
      select: {
        id: true,
        status: true,
        parameters: true,
        errorMessage: true,
        createdAt: true,
        leadNome: true,
        leadTelefone: true
      }
    });

    console.log('\n📊 Disparos recentes para este template:');
    if (recentDisparos.length === 0) {
      console.log('   Nenhum disparo encontrado');
    } else {
      recentDisparos.forEach((disparo, index) => {
        console.log(`\n[${index + 1}] ID: ${disparo.id}`);
        console.log(`    Status: ${disparo.status}`);
        console.log(`    Lead: ${disparo.leadNome} (${disparo.leadTelefone})`);
        console.log(`    Parameters:`, JSON.stringify(disparo.parameters, null, 2));
        if (disparo.errorMessage) {
          console.log(`    Erro: ${disparo.errorMessage}`);
        }
        console.log(`    Data: ${disparo.createdAt}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar o teste
testDisparoDebug().catch(console.error);