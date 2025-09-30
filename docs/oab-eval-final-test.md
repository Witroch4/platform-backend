# Teste Batch Determinístico OAB (rodada final)

- **Data/Hora**: $(date -Is)
- **Comando**: `pnpm tsx test_batch_oab_pdfs.ts`

## Resultado do comando

```
🚀 INICIANDO TESTE BATCH DE GABARITOS OAB
📁 Diretório: ./lib/oab/pdf-exemplos-gabaritos
📚 Encontrados 7 PDFs para testar
...
📈 RESUMO GERAL DO TESTE BATCH
================================================================================
✅ Passou: 2/7
❌ Falhou: 5/7
🚨 Erro: 0/7
```

## Observações

- O script ainda sinaliza desvios de pontuação para cinco PDFs, especialmente na soma da peça (ex.: `DIREITO CONSTITUCIONAL.pdf` reportado com 4,9/5,0).
- Os logs de `parseLinhasItens` indicam tratamento de rótulos quebrados e captura de matrizes, mas há grupos `OU` que resultam em pontuação efetiva inferior à esperada.
- Para liberar o pipeline sem fallback LLM, é necessário ajustar o parser determinístico para que a soma final de cada segmento fique exatamente em `5,00` dentro da tolerância.

## Próximos passos sugeridos

1. Revisar a segmentação dos itens com grupos `OU`, confirmando quais casos devem somar (complementares) ou tomar o máximo (alternativos).
2. Validar novamente os sete PDFs após o ajuste para garantir o alvo `5,0/5,0` em peça e questões.
3. Documentar as heurísticas finais diretamente no parser para facilitar futuras manutenções.
