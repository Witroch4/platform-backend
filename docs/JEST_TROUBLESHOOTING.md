# Jest Troubleshooting Guide

## Problema: "Jest did not exit one second after the test run has completed"

### O que é esse erro?

Este erro indica que há operações assíncronas que não foram adequadamente finalizadas após a execução dos testes. Isso pode acontecer por várias razões:

1. **Conexões de banco de dados não fechadas**
2. **Timers não limpos**
3. **Promises pendentes**
4. **Event listeners não removidos**
5. **Workers ou processos em background**

### Soluções Implementadas

#### 1. Configuração do Jest (`jest.config.js`)

```javascript
module.exports = {
  // ... outras configurações
  detectOpenHandles: true,  // Detecta handles abertos
  forceExit: true,          // Força saída após testes
  testEnvironmentOptions: {
    nodeOptions: ['--expose-gc']  // Habilita garbage collection
  }
};
```

#### 2. Setup Global (`jest.setup.js`)

```javascript
// Cleanup após cada teste
afterEach(async () => {
  jest.clearAllTimers();
  await new Promise(resolve => setImmediate(resolve));
});

// Cleanup global após todos os testes
afterAll(async () => {
  // Fecha conexões Prisma
  try {
    const { prisma } = require('@/lib/prisma');
    if (prisma && typeof prisma.$disconnect === 'function') {
      await prisma.$disconnect();
    }
  } catch (error) {
    // Ignora erros se prisma não estiver disponível
  }
  
  // Força garbage collection
  if (global.gc) {
    global.gc();
  }
  
  // Aguarda operações assíncronas
  await new Promise(resolve => setTimeout(resolve, 100));
});
```

#### 3. Scripts de Teste Otimizados

```json
{
  "scripts": {
    "test": "jest --detectOpenHandles --forceExit",
    "test:watch": "jest --watch --detectOpenHandles --forceExit",
    "test:coverage": "jest --coverage --detectOpenHandles --forceExit"
  }
}
```

#### 4. Script PowerShell (`scripts/run-tests.ps1`)

Execute testes com configurações otimizadas:

```powershell
# Executar todos os testes
.\scripts\run-tests.ps1

# Executar testes unitários
.\scripts\run-tests.ps1 -TestType unit

# Executar com watch mode
.\scripts\run-tests.ps1 -Watch

# Executar com coverage
.\scripts\run-tests.ps1 -Coverage
```

### Como Usar

#### Opção 1: Usando npm scripts
```bash
npm run test
npm run test:unit
npm run test:integration
```

#### Opção 2: Usando script PowerShell
```powershell
.\scripts\run-tests.ps1 -TestType unit -Verbose
.\scripts\run-tests.ps1 -TestType integration -Coverage
```

#### Opção 3: Comando direto
```bash
npx jest --detectOpenHandles --forceExit --testPathPattern=__tests__/unit
```

### Boas Práticas para Evitar o Problema

#### 1. Sempre feche conexões de banco de dados

```typescript
describe('Database Tests', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });
  
  // seus testes aqui
});
```

#### 2. Limpe timers e intervals

```typescript
describe('Timer Tests', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });
  
  // seus testes aqui
});
```

#### 3. Aguarde promises pendentes

```typescript
test('async operation', async () => {
  const result = await someAsyncOperation();
  expect(result).toBeDefined();
  
  // Aguarda microtasks pendentes
  await new Promise(resolve => setImmediate(resolve));
});
```

#### 4. Remova event listeners

```typescript
describe('Event Tests', () => {
  let cleanup: () => void;
  
  afterEach(() => {
    if (cleanup) cleanup();
  });
  
  test('event handling', () => {
    cleanup = someFunction.on('event', handler);
    // teste aqui
  });
});
```

### Debugging

Se o problema persistir, use estas opções para debug:

```bash
# Detecta handles abertos com detalhes
npx jest --detectOpenHandles --verbose

# Executa em modo debug
npx jest --detectOpenHandles --forceExit --verbose --no-cache

# Executa um teste específico
npx jest --detectOpenHandles --forceExit path/to/specific.test.ts
```

### Comandos Úteis

```powershell
# Executar testes com debug
.\scripts\run-tests.ps1 -Debug

# Executar testes específicos
.\scripts\run-tests.ps1 -TestType unit -Verbose

# Executar com coverage
.\scripts\run-tests.ps1 -Coverage
```

### Monitoramento

O script PowerShell inclui logs coloridos para facilitar o monitoramento:

- 🧪 Início da execução
- 📋 Testes unitários
- 🔗 Testes de integração
- 🌐 Testes end-to-end
- ⚡ Testes de performance
- ✅ Sucesso
- ❌ Falha
- 🧹 Limpeza
- 🎉 Conclusão

### Resolução de Problemas Comuns

1. **Se ainda houver handles abertos**: Verifique se há workers ou processos em background
2. **Se houver timeouts**: Aumente o `testTimeout` no `jest.config.js`
3. **Se houver problemas de memória**: Use `--maxWorkers=1` para executar testes sequencialmente
4. **Se houver problemas de rede**: Mock APIs externas nos testes

### Referências

- [Jest Documentation - Troubleshooting](https://jestjs.io/docs/troubleshooting)
- [Jest Configuration](https://jestjs.io/docs/configuration)
- [Node.js Event Loop](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/) 