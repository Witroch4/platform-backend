// Script para adicionar badge de ação de handoff nas ocorrências restantes

const fs = require('fs');

const filePath = 'd:/nextjs/Chatwit-Social-dev/app/admin/mtf-diamante/components/shared/InteractivePreview.tsx';
const content = fs.readFileSync(filePath, 'utf8');

// Padrão para encontrar onde adicionar o badge de ação
const pattern = /(\s+{reaction\?\.textResponse && \(\s+<Badge variant="secondary" className="text-xs">\s+Texto\s+<\/Badge>\s+\)}\s+)({configMode && showReactionConfig &&)/g;

const replacement = `$1{reaction?.action && (
                                  <Badge variant="destructive" className="text-xs">
                                    {reaction.action === 'handoff' ? 'Atendente' : reaction.action}
                                  </Badge>
                                )}
                                $2`;

const updatedContent = content.replace(pattern, replacement);

if (updatedContent !== content) {
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log('✅ Badges de ação adicionados com sucesso!');
  console.log('📊 Total de ocorrências atualizadas:', (content.match(pattern) || []).length);
} else {
  console.log('⚠️ Nenhuma ocorrência encontrada para atualizar');
}
