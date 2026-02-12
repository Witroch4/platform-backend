/**
 * n8n Code Node - Stop/Start Stack no Portainer (com opção de deletar volume)
 *
 * Espera receber do nó anterior:
 * - account_token: API Key do Portainer
 * - LinkPortainer: URL do Portainer (ex: https://portainer.exemplo.com)
 * - stackName: Nome da stack para reiniciar
 * - stackBase: (opcional) Conteúdo do docker-compose para recriar se necessário
 * - endpointId: (opcional) ID do environment, default 1
 * - deleteVolume: (opcional) Nome do volume para deletar entre stop/start (ex: "chatwoot_public")
 */

const axios = require('axios');

// Função auxiliar para esperar (Delay)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const items = $input.all();
const output = [];

for (const item of items) {
  const data = item.json;
  let log = [];

  try {
    // ---------------- SETUP INICIAL ----------------
    const token = data.account_token;
    let baseUrl = (data.LinkPortainer || '').replace(/\/$/, '');
    if (!baseUrl.includes('/api')) baseUrl += '/api';

    const endpointId = data.endpointId || 1;
    const targetStackName = data.stackName;
    const volumeToDelete = data.deleteVolume; // Nome do volume para deletar (opcional)

    const config = { headers: { 'X-API-Key': token } };

    // ---------------- PASSO 1: ENCONTRAR O ID DA STACK ----------------
    const stacksResponse = await axios.get(`${baseUrl}/stacks`, config);
    const targetStack = stacksResponse.data.find(s => s.Name === targetStackName);

    if (!targetStack) {
      throw new Error(`Stack "${targetStackName}" não encontrada.`);
    }

    const stackId = targetStack.Id;
    log.push(`Stack encontrada: ID ${stackId}.`);

    // ---------------- PASSO 2: PARAR A STACK ----------------
    console.log(`Parando a stack ${targetStackName}...`);
    await axios.post(
      `${baseUrl}/stacks/${stackId}/stop?endpointId=${endpointId}`,
      {},
      config
    );
    log.push('Stack parada com sucesso.');

    // Aguarda containers pararem
    console.log('Aguardando 10 segundos para containers pararem...');
    await sleep(10000);

    // ---------------- PASSO 3: DELETAR VOLUME (SE ESPECIFICADO) ----------------
    if (volumeToDelete) {
      console.log(`Deletando volume: ${volumeToDelete}...`);
      try {
        await axios.delete(
          `${baseUrl}/endpoints/${endpointId}/docker/volumes/${volumeToDelete}?force=true`,
          config
        );
        log.push(`Volume "${volumeToDelete}" deletado com sucesso.`);
      } catch (volumeError) {
        // Se o volume não existir ou já foi deletado, continua
        const volErrMsg = volumeError.response?.data?.message || volumeError.message;
        log.push(`Aviso ao deletar volume: ${volErrMsg}`);
        console.log(`Aviso ao deletar volume: ${volErrMsg}`);
      }

      // Aguarda limpeza
      console.log('Aguardando 5 segundos para limpeza do volume...');
      await sleep(5000);
    }

    // ---------------- PASSO 4: INICIAR A STACK ----------------
    console.log(`Iniciando a stack ${targetStackName}...`);
    await axios.post(
      `${baseUrl}/stacks/${stackId}/start?endpointId=${endpointId}`,
      {},
      config
    );
    log.push('Stack iniciada com sucesso.');

    output.push({
      json: {
        ...data,
        status: 'SUCESSO',
        mensagem: volumeToDelete
          ? `Stack reiniciada e volume "${volumeToDelete}" deletado.`
          : 'Stack reiniciada via Stop/Start API.',
        logs: log.join(' '),
        stack_id: stackId
      }
    });

  } catch (error) {
    // ---------------- TRATAMENTO DE ERRO GERAL ----------------
    const errorMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    output.push({
      json: {
        ...data,
        status: 'ERRO_FATAL',
        mensagem: 'Não foi possível completar a operação.',
        logs: log.join(' '),
        erro_tecnico: errorMsg
      }
    });
  }
}

return output;
