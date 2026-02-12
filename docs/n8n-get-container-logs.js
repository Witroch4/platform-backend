/**
 * n8n Code Node - Pegar logs de um container específico de uma stack
 *
 * Espera receber do nó anterior:
 * - account_token: API Key do Portainer
 * - LinkPortainer: URL do Portainer (ex: https://portainer.exemplo.com)
 * - stackName: Nome da stack (ex: "socialwise")
 * - serviceName: Nome do serviço (ex: "socialwise_app" ou apenas "app")
 * - endpointId: (opcional) ID do environment, default 1
 * - tailLines: (opcional) Número de linhas do log, default 1000
 * - timestamps: (opcional) Incluir timestamps, default true
 */

const axios = require('axios');

const items = $input.all();
const output = [];

for (const item of items) {
  const data = item.json;

  try {
    // ---------------- SETUP INICIAL ----------------
    const token = data.account_token;
    let baseUrl = (data.LinkPortainer || '').replace(/\/$/, '');
    if (!baseUrl.includes('/api')) baseUrl += '/api';

    const endpointId = data.endpointId || 1;
    const stackName = data.stackName;
    const serviceName = data.serviceName;
    const tailLines = data.tailLines || 1000;
    const includeTimestamps = data.timestamps !== false; // default true

    const config = { headers: { 'X-API-Key': token } };

    // ---------------- PASSO 1: LISTAR CONTAINERS ----------------
    console.log('Listando containers...');
    const containersResponse = await axios.get(
      `${baseUrl}/endpoints/${endpointId}/docker/containers/json?all=true`,
      config
    );

    const containers = containersResponse.data;

    // ---------------- PASSO 2: ENCONTRAR O CONTAINER DO SERVIÇO ----------------
    // Padrão Swarm: {stackName}_{serviceName}.{replica}.{taskId}
    // Também pode ser: {stackName}_{serviceName} se for compose standalone

    // Constrói possíveis padrões de nome
    const patterns = [
      `${stackName}_${serviceName}`,           // ex: socialwise_socialwise_app
      `${stackName}_${stackName}_${serviceName}`, // caso o service name não inclua stack
    ];

    // Se serviceName já inclui o stackName, usa direto
    // Se não, tenta com e sem o prefixo da stack
    let fullServiceName = serviceName;
    if (!serviceName.startsWith(stackName)) {
      fullServiceName = `${stackName}_${serviceName}`;
    }

    console.log(`Procurando container para serviço: ${fullServiceName}`);

    // Encontra o container que corresponde ao serviço
    const targetContainer = containers.find(c => {
      // Nomes dos containers vêm com "/" no início
      const names = c.Names.map(n => n.replace(/^\//, ''));

      // Verifica se algum nome começa com o padrão do serviço
      return names.some(name =>
        name.startsWith(fullServiceName) ||
        name.startsWith(`${stackName}_${serviceName}`)
      );
    });

    if (!targetContainer) {
      // Lista os containers disponíveis para debug
      const availableContainers = containers
        .map(c => c.Names[0]?.replace(/^\//, ''))
        .filter(n => n?.includes(stackName))
        .join(', ');

      throw new Error(
        `Container não encontrado para serviço "${fullServiceName}". ` +
        `Containers da stack "${stackName}": [${availableContainers || 'nenhum'}]`
      );
    }

    const containerId = targetContainer.Id;
    const containerName = targetContainer.Names[0]?.replace(/^\//, '');
    console.log(`Container encontrado: ${containerName} (${containerId.substring(0, 12)})`);

    // ---------------- PASSO 3: PEGAR OS LOGS ----------------
    console.log(`Buscando últimas ${tailLines} linhas de log...`);

    const logsResponse = await axios.get(
      `${baseUrl}/endpoints/${endpointId}/docker/containers/${containerId}/logs`,
      {
        ...config,
        params: {
          tail: tailLines,
          stdout: true,
          stderr: true,
          timestamps: includeTimestamps
        },
        // Logs vêm como texto, não JSON
        responseType: 'text'
      }
    );

    // Limpa os caracteres de controle do Docker (primeiros 8 bytes de cada linha)
    const rawLogs = logsResponse.data;
    const cleanedLogs = rawLogs
      .split('\n')
      .map(line => {
        // Remove os 8 bytes de header do Docker multiplex
        if (line.length > 8) {
          return line.substring(8);
        }
        return line;
      })
      .join('\n')
      .trim();

    output.push({
      json: {
        ...data,
        status: 'SUCESSO',
        container_id: containerId,
        container_name: containerName,
        lines_requested: tailLines,
        logs: cleanedLogs
      }
    });

  } catch (error) {
    const errorMsg = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    output.push({
      json: {
        ...data,
        status: 'ERRO',
        erro: errorMsg
      }
    });
  }
}

return output;
