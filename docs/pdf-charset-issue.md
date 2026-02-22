# Correção do Erro WinAnsi (pdf-lib)

## Problema
A biblioteca `pdf-lib` utiliza por padrão a codificação `WinAnsi` (Windows-1252) com fontes padrão como `StandardFonts.Helvetica`. Isso causa um erro crítico quando o sistema tenta injetar caracteres Unicode complexos (como emojis, aspas tipográficas ou símbolos matemáticos como `≥` e `≤`) originados de textos gerados por LLM. 
A stack trace original mostra o erro:
`[BullMQ] Erro ao processar análise: WinAnsi cannot encode "≥" (0x2265)`

## Solução Adotada
Foi criado um middleware de sanitização diretamente em `generate-analise-pdfs.ts`. A função `sanitizeAnaliseData` e `sanitizePdfText`.

### Como Funciona:
1. Recebe a estrutura `AnaliseData`.
2. O `sanitizePdfText` faz replace dos caracteres Unicode problemáticos comuns como:
   - `≥` para `>=`
   - `≤` para `<=`
   - Aspas inclinadas e "smart quotes" para aspas regulares.
   - Remove toda a faixa de emojis e _Dingbats_ utilizando fallback Unicode `/[\u{1F300}-\u{1F9FF}]/gu`.
3. Os dados seguros são direcionados para os geradores `generateRelatorioPdf` e `generateArgumentacaoPdf`.

*Documento gerado automaticamente pela Inteligência Artificial para fins de registro arquitetural.*
