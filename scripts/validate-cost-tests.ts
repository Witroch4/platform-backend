#!/usr/bin/env tsx

/**
 * Script para validar os testes do sistema de custos
 * Verifica se os arquivos de teste estão bem formados e podem ser executados
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

interface TestFile {
  path: string;
  type: 'unit' | 'integration';
  valid: boolean;
  errors: string[];
}

function validateTestFile(filePath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    if (!existsSync(filePath)) {
      errors.push('Arquivo não encontrado');
      return { valid: false, errors };
    }

    const content = readFileSync(filePath, 'utf-8');
    
    // Verificações básicas de estrutura
    if (!content.includes('describe(')) {
      errors.push('Não contém blocos describe()');
    }
    
    if (!content.includes('it(') && !content.includes('test(')) {
      errors.push('Não contém testes (it() ou test())');
    }
    
    if (!content.includes('expect(')) {
      errors.push('Não contém assertions (expect())');
    }
    
    // Verificações específicas para testes de custo
    if (content.includes('cost') || content.includes('Cost')) {
      if (!content.includes('jest.mock')) {
        errors.push('Testes de custo devem incluir mocks');
      }
    }
    
    // Verificar imports
    if (!content.includes("import") && !content.includes("require")) {
      errors.push('Não contém imports/requires');
    }
    
    return { valid: errors.length === 0, errors };
    
  } catch (error) {
    errors.push(`Erro ao ler arquivo: ${error}`);
    return { valid: false, errors };
  }
}

async function main() {
  console.log('🔍 Validando testes do sistema de custos...\n');

  const testFiles: TestFile[] = [
    // Testes unitários
    {
      path: path.join(PROJECT_ROOT, '__tests__/unit/cost/openai-wrapper.test.ts'),
      type: 'unit',
      valid: false,
      errors: [],
    },
    {
      path: path.join(PROJECT_ROOT, '__tests__/unit/cost/whatsapp-wrapper.test.ts'),
      type: 'unit',
      valid: false,
      errors: [],
    },
    {
      path: path.join(PROJECT_ROOT, '__tests__/unit/cost/cost-worker.test.ts'),
      type: 'unit',
      valid: false,
      errors: [],
    },
    {
      path: path.join(PROJECT_ROOT, '__tests__/unit/cost/budget-monitor.test.ts'),
      type: 'unit',
      valid: false,
      errors: [],
    },
    // Testes de integração
    {
      path: path.join(PROJECT_ROOT, '__tests__/integration/cost/cost-system-e2e.test.ts'),
      type: 'integration',
      valid: false,
      errors: [],
    },
    {
      path: path.join(PROJECT_ROOT, '__tests__/integration/cost/cost-dashboard-api.test.ts'),
      type: 'integration',
      valid: false,
      errors: [],
    },
  ];

  let totalValid = 0;
  let totalInvalid = 0;

  for (const testFile of testFiles) {
    const validation = validateTestFile(testFile.path);
    testFile.valid = validation.valid;
    testFile.errors = validation.errors;

    const status = testFile.valid ? '✅' : '❌';
    const fileName = path.basename(testFile.path);
    
    console.log(`${status} ${testFile.type.toUpperCase()}: ${fileName}`);
    
    if (!testFile.valid) {
      testFile.errors.forEach(error => {
        console.log(`   ⚠️ ${error}`);
      });
      totalInvalid++;
    } else {
      totalValid++;
    }
    
    console.log('');
  }

  // Resumo
  console.log('📊 Resumo da validação:');
  console.log(`   ✅ Arquivos válidos: ${totalValid}`);
  console.log(`   ❌ Arquivos inválidos: ${totalInvalid}`);
  console.log(`   📁 Total de arquivos: ${testFiles.length}`);

  if (totalInvalid > 0) {
    console.log('\n⚠️ Alguns arquivos de teste precisam de correção antes da execução.');
    return false;
  } else {
    console.log('\n🎉 Todos os arquivos de teste estão válidos!');
    
    // Verificar dependências dos testes
    console.log('\n🔧 Verificando dependências...');
    
    const requiredDeps = [
      'bullmq',
      '@prisma/client',
      'jest',
      'ts-jest',
    ];
    
    try {
      const packageJson = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      const missingDeps = requiredDeps.filter(dep => !allDeps[dep]);
      
      if (missingDeps.length > 0) {
        console.log(`❌ Dependências ausentes: ${missingDeps.join(', ')}`);
        return false;
      } else {
        console.log('✅ Todas as dependências necessárias estão instaladas');
      }
      
    } catch (error) {
      console.log(`⚠️ Erro ao verificar dependências: ${error}`);
    }
    
    return true;
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Erro na validação:', error);
    process.exit(1);
  });
}

export { main as validateCostTests };