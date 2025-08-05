// Teste simples do streaming de imagens
async function testImageStream() {
  try {
    console.log('Iniciando teste de streaming de imagens...');
    
    const response = await fetch('http://localhost:3000/api/chatwitia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: 'Gere uma imagem de uma borboleta colorida'
          }
        ],
        model: 'gpt-4.1-nano',
        stream: true
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        try {
          if (line.startsWith('{')) {
            const data = JSON.parse(line);
            console.log('Evento recebido:', data.type);
            
            if (data.type === 'partial_image') {
              console.log(`Imagem parcial ${data.index} recebida (${data.image_data?.length || 0} bytes)`);
            } else if (data.type === 'image_generated') {
              console.log('Imagem final gerada:', data.image_url);
            }
          }
        } catch (e) {
          console.log('Erro ao parsear JSON:', e.message);
        }
      }
    }

    console.log('Teste concluído');
  } catch (error) {
    console.error('Erro no teste:', error);
  }
}

// Executar o teste
if (typeof window === 'undefined') {
  // Node.js environment
  const fetch = require('node-fetch');
  testImageStream();
} 