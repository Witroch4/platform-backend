# Sistema de Espelhos Padrão

## Visão Geral

O sistema de espelhos padrão permite associar um template de resposta padrão a cada lead baseado na especialidade jurídica. Quando um espelho é enviado para processamento, o texto do espelho padrão é incluído automaticamente junto com as imagens específicas do lead.

## Funcionalidades

### 1. Célula Espelho Padrão

A nova célula `EspelhoPadraoCell` permite:
- Selecionar uma especialidade jurídica para cada lead
- Visualizar o status do espelho padrão (Pronto/Sem texto)
- Atualizar a especialidade do lead em tempo real

### 2. Especialidades Disponíveis

- **Administrativo**: Padrão de respostas definitivo (Direito Administrativo)
- **Civil**: Padrão de respostas definitivo (Direito Civil)
- **Constitucional**: Padrão de respostas definitivo (Direito Constitucional)
- **Trabalho**: Padrão de respostas definitivo (Direito do Trabalho)
- **Empresarial**: Padrão de respostas definitivo (Direito Empresarial)
- **Penal**: Padrão de respostas definitivo (Direito Penal)
- **Tributário**: Padrão de respostas definitivo (Direito Tributário)

### 3. Integração com Envio de Documentos

Quando um lead tem uma especialidade definida e o espelho padrão está processado:
- O sistema automaticamente inclui o texto do espelho padrão (`textoMarkdown`) no payload enviado para o sistema externo
- O campo `espelhoPadraoTexto` é adicionado ao payload do webhook
- O processo funciona tanto para manuscritos quanto para espelhos

## Fluxo de Uso

1. **Configurar Especialidade**: Selecionar a especialidade jurídica na célula "Espelho Padrão"
2. **Verificar Status**: Confirmar que o badge mostra "Pronto" (espelho padrão tem texto processado)
3. **Enviar Espelho**: Usar o botão "Selecionar Espelho" normalmente
4. **Processamento**: O sistema inclui automaticamente o texto do espelho padrão junto com as imagens

## Estrutura de Dados

```typescript
interface EspelhoPadrao {
  id: string;
  especialidade: EspecialidadeJuridica;
  nome: string;
  textoMarkdown?: string;
  espelhoCorrecao?: string;
  isAtivo: boolean;
  processado: boolean;
  aguardandoProcessamento: boolean;
}
```

## Payload do Webhook

Quando um lead tem especialidade definida, o payload inclui:

```json
{
  "leadID": "lead-123",
  "espelho": true,
  "arquivos_imagens_espelho": [...],
  "espelhoPadraoTexto": "Texto markdown do espelho padrão..."
}
```

## Notas Técnicas

- A especialidade é armazenada no campo `especialidade` da tabela `LeadChatwit`
- Apenas espelhos padrão ativos e processados são incluídos
- O sistema verifica automaticamente se existe espelho padrão para a especialidade
- A integração é transparente para o usuário - apenas seleciona a especialidade e usa o sistema normalmente 