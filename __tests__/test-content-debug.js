// Teste de processamento de conteúdo
const testContent = `Aqui estão duas versões de um gato em baixa resolução e pixelado, uma ainda mais simples e outra com um pouco mais de detalhes.

![Imagem gerada](https://objstoreapi.witdev.com.br/chatwit-social/589ac732-7cd1-4b37-ae23-1824e6ec3035-generated-image-1748112774257.png)`;

console.log('Conteúdo de teste:', testContent);

// Função para simular o processamento do MessageContent
function processContent(text) {
  const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+|data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    // Adicionar texto antes da imagem
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }

    // Adicionar imagem
    parts.push({
      type: 'image',
      alt: match[1] || 'Imagem gerada',
      src: match[2] || '',
      isProgress: false
    });

    lastIndex = match.index + match[0].length;
  }

  // Adicionar texto restante
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}

const processedParts = processContent(testContent);
console.log('Partes processadas:', processedParts);

// Verificar se encontrou a imagem
const imageParts = processedParts.filter(part => part.type === 'image');
console.log('Imagens encontradas:', imageParts.length);
console.log('Detalhes das imagens:', imageParts); 