Dominando o Gerenciamento de Dados em Next.js: Um Guia Completo sobre SWR e Atualizações OtimistasSeção 1: Introdução à Filosofia Stale-While-Revalidate (SWR)1.1 Desmistificando o SWR: O Que É e Por Que Foi CriadoNo universo do desenvolvimento de aplicações web modernas, a busca por interfaces rápidas, reativas e que proporcionem uma experiência de usuário fluida é incessante. É nesse contexto que surge o SWR, uma biblioteca de React Hooks para busca de dados (data fetching) desenvolvida pela Vercel, a mesma empresa por trás do Next.js.1 O nome "SWR" não é um acrônimo arbitrário; ele deriva diretamente de uma estratégia de invalidação de cache padronizada pela HTTP RFC 5861, conhecida como stale-while-revalidate.2A principal motivação para a criação do SWR foi simplificar e padronizar o complexo gerenciamento de estado do servidor em aplicações React. Tradicionalmente, desenvolvedores recorriam a uma combinação de hooks como useEffect e useState para buscar dados, o que rapidamente introduzia uma quantidade significativa de código boilerplate para gerenciar estados de carregamento, sucesso, erro, além de lógicas complexas para cache, revalidação e sincronização de dados entre diferentes componentes.3 O SWR foi projetado para abstrair toda essa complexidade, oferecendo uma camada poderosa e declarativa sobre mecanismos de busca de dados como o fetch nativo ou bibliotecas como o Axios.6 Essencialmente, o SWR não é apenas uma ferramenta para "buscar dados", mas sim uma estratégia completa para gerenciar o ciclo de vida desses dados no lado do cliente, garantindo que a UI seja sempre rápida e reativa.21.2 O Fluxo "Stale-While-Revalidate": A Mágica por Trás da ReatividadeA genialidade do SWR reside na implementação do fluxo stale-while-revalidate, um processo elegante que otimiza a experiência do usuário ao priorizar a velocidade percebida em detrimento da consistência imediata dos dados, sem sacrificar a atualização destes. O fluxo opera em três etapas distintas:Stale (Obsoleto): Ao solicitar um dado pela primeira vez (ou em navegações subsequentes), o SWR retorna imediatamente a versão que está em seu cache local, mesmo que essa versão seja considerada "obsoleta" ou "stale".2 Para o usuário, o efeito é instantâneo: a interface é renderizada com dados, eliminando a necessidade de aguardar uma resposta da rede e evitando telas de carregamento vazias.8While (Enquanto): Simultaneamente, enquanto a UI já exibe os dados obsoletos, o SWR envia uma requisição em segundo plano para o servidor ou API. Esta etapa é a "revalidação".2 O usuário pode interagir com a aplicação sem perceber que uma atualização está em andamento.Revalidate (Revalidar): Assim que a requisição em segundo plano é concluída e os novos dados são recebidos, o SWR atualiza silenciosamente seu cache local e, de forma reativa, dispara uma nova renderização do componente com os dados frescos.2Este padrão de stale-while-revalidate é a causa direta da melhoria na "latência percebida".10 O fluxo de interação do usuário muda fundamentalmente. Em uma abordagem tradicional, o ciclo é: Ação do Usuário → Requisição → Tela de Carregamento → Dados → UI Atualizada. Com o SWR, o ciclo se transforma em: Ação do Usuário → Dados do Cache (UI Atualizada Imediatamente) → Requisição em Segundo Plano → Novos Dados (UI Re-sincronizada). Essa inversão é o que torna as aplicações que utilizam SWR tão rápidas e responsivas, pois a experiência de espera passiva é substituída por uma interação imediata com dados que, na maioria dos cenários, são "bons o suficiente" até que a atualização final chegue.1.3 Configuração Inicial: useSWR, fetcher e EstadosA implementação básica do SWR é notavelmente simples e se concentra no hook useSWR. Este hook é o ponto de entrada para toda a funcionalidade da biblioteca e requer, no mínimo, dois argumentos: uma key e uma função fetcher.11JavaScriptimport useSWR from 'swr';

// 1. Defina a função 'fetcher'
const fetcher = (url) => fetch(url).then((res) => res.json());

function Profile() {
  // 2. Use o hook SWR
  const { data, error, isLoading } = useSWR('/api/user', fetcher);

  if (error) return <div>Falha ao carregar</div>;
  if (isLoading) return <div>Carregando...</div>;

  // 3. Renderize os dados
  return <div>Olá, {data.name}!</div>;
}
Os componentes fundamentais desta configuração são:key: O primeiro argumento do useSWR, que serve como um identificador único para a requisição e, crucialmente, para a entrada no cache.13 Geralmente, é a URL do endpoint da API, mas pode ser também um objeto, um array ou uma função, permitindo a criação de chaves mais complexas e dependentes.14fetcher: O segundo argumento é uma função assíncrona que recebe a key e é responsável por efetivamente buscar os dados. O fetcher pode ser implementado com qualquer lógica de busca de dados, seja fetch, axios ou clientes GraphQL como graphql-request.12 O valor que esta promessa resolve é o que será retornado como data.Valores de Retorno: O hook useSWR retorna um objeto contendo o estado da requisição. Os valores mais importantes são 13:data: Os dados resolvidos pela função fetcher. Será undefined até que a primeira busca seja concluída.error: Um objeto de erro caso a promessa do fetcher seja rejeitada.isLoading: Um booleano que é true apenas durante a primeira requisição para uma determinada key. É ideal para exibir esqueletos de UI ou carregadores iniciais.isValidating: Um booleano que é true sempre que uma requisição ou revalidação está em andamento, incluindo a primeira.A simplicidade desta API esconde uma poderosa gestão de estado. O hook gerencia internamente todos os estados intermediários, eliminando a necessidade de múltiplos useState e lógicas complexas dentro de useEffect, o que resulta em um código de componente mais limpo, declarativo e focado na apresentação dos dados.1Seção 2: Integração Estratégica do SWR com Next.jsA sinergia entre SWR e Next.js é natural, dado que ambas as tecnologias foram criadas pela Vercel com um foco compartilhado em performance e experiência do desenvolvedor. A integração não se limita à compatibilidade; ela permite a criação de arquiteturas de dados robustas que aproveitam o melhor dos dois mundos: a otimização de renderização do Next.js e o gerenciamento dinâmico de dados do SWR no cliente.2.1 Client-Side Data Fetching no App RouterCom a introdução do App Router no Next.js 13, a distinção entre Componentes de Servidor (React Server Components - RSC) e Componentes de Cliente (Client Components) tornou-se central na arquitetura das aplicações. Os RSCs, que são o padrão, executam no servidor e não podem usar hooks do React como useState ou useEffect. Consequentemente, eles não podem usar o useSWR.14O SWR encontra seu lugar ideal dentro dos Componentes de Cliente, que são explicitamente marcados com a diretiva 'use client' no topo do arquivo.12 Esta arquitetura promove uma clara separação de responsabilidades:Server Components: São ideais para buscar os dados iniciais, estáticos ou que não mudam com frequência. Eles são responsáveis por gerar o HTML inicial da página, o que é excelente para a performance de carregamento (First Contentful Paint - FCP) e para a otimização de mecanismos de busca (SEO).Client Components com SWR: São perfeitos para partes da UI que são altamente interativas e dependem de dados que mudam com frequência, como dashboards de usuário, feeds de notificações, caixas de comentários ou qualquer dado que dependa da interação do usuário. O SWR assume a responsabilidade de manter esses dados atualizados e sincronizados após o carregamento inicial da página.142.2 Pré-renderização com Dados Iniciais (SSG e SSR)Uma das questões mais críticas em aplicações web modernas é como combinar a performance e os benefícios de SEO da pré-renderização no servidor (seja por Geração de Site Estático - SSG, ou Renderização no Lado do Servidor - SSR) com a natureza dinâmica do data fetching no cliente. O SWR oferece uma solução elegante para este problema através da opção fallback do seu provedor de configuração, o SWRConfig.A estratégia consiste em buscar os dados iniciais durante o processo de build (com getStaticProps) ou a cada requisição (com getServerSideProps) no servidor. Esses dados são então "injetados" no cache do SWR no lado do cliente como um valor inicial. Quando o componente que usa useSWR com a mesma key é renderizado no navegador, ele encontra os dados já no cache e os exibe imediatamente, sem a necessidade de uma requisição inicial no cliente.14Veja um exemplo prático utilizando getStaticProps em uma página do diretório pages (a lógica é análoga para o App Router usando generateStaticParams e fetch):JavaScript// pages/posts/[slug].js
import { SWRConfig } from 'swr';
import PostComponent from '../../components/PostComponent';

// Esta função roda no servidor durante o build
export async function getStaticProps({ params }) {
  // Busca os dados do post
  const post = await getPostFromAPI(params.slug);
  return {
    props: {
      // Passa os dados para o componente da página via props
      fallback: {
        // A chave aqui deve corresponder exatamente à chave usada no useSWR
        [`/api/posts/${params.slug}`]: post,
      },
    },
  };
}

// O componente da página recebe 'fallback' como prop
export default function PostPage({ fallback }) {
  return (
    // O SWRConfig usa o fallback para popular o cache inicial
    <SWRConfig value={{ fallback }}>
      <PostComponent />
    </SWRConfig>
  );
}
Dentro de PostComponent, a chamada useSWR('/api/posts/...') irá, na primeira renderização, servir os dados fornecidos pelo fallback. A página é entregue ao navegador como HTML estático, garantindo um carregamento rápido e sendo totalmente indexável. Após a hidratação no cliente, o SWR assume o controle, habilitando todas as suas funcionalidades de revalidação automática (como ao focar na janela) para manter os dados sempre atualizados.14Este padrão representa uma arquitetura de "transferência de responsabilidade". O servidor realiza o trabalho pesado para a renderização inicial, otimizando o LCP e o SEO. Uma vez no cliente, a responsabilidade pelo ciclo de vida dos dados é transferida para o SWR, que transforma a página estática em uma aplicação dinâmica e viva. Isso resolve o dilema clássico entre SSR/SSG (bom para SEO, mas pode ser menos interativo) e CSR (interativo, mas ruim para SEO e carregamento inicial), oferecendo uma transição suave e performática do servidor para o cliente.2.3 Arquitetura de Provedores com SWRConfigPara aplicações de maior escala, configurar cada chamada useSWR individualmente pode levar à repetição de código. O componente SWRConfig atua como um provedor de contexto, permitindo definir configurações globais (opções) que serão herdadas por todos os hooks SWR aninhados dentro dele.18 É uma prática recomendada envolver toda a aplicação ou seções significativas dela com um SWRConfig no arquivo de layout raiz (layout.tsx).As configurações globais mais comuns incluem:fetcher: Definir uma função fetcher padrão evita a necessidade de passá-la em cada chamada useSWR.18onError: Centraliza o tratamento de erros. É o local ideal para integrar serviços de logging de erros como Sentry ou para disparar notificações globais (toasts) para o usuário, sem poluir a lógica dos componentes.19Opções de Revalidação: É possível definir comportamentos padrão para revalidateOnFocus, refreshInterval, shouldRetryOnError, entre outros, garantindo consistência em toda a aplicação.20No App Router, como o layout.tsx é um Server Component, é necessário criar um componente provedor intermediário que seja um Client Component para poder usar o SWRConfig:JavaScript// app/providers.tsx
'use client';

import { SWRConfig } from 'swr';

const fetcher = (url) => fetch(url).then((res) => res.json());

export function SWRProvider({ children }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        onError: (error, key) => {
          console.error(`SWR Error for key ${key}:`, error);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
JavaScript// app/layout.tsx
import { SWRProvider } from './providers';

export default function RootLayout({ children }) {
  return (
    <html lang="pt-br">
      <body>
        <SWRProvider>{children}</SWRProvider>
      </body>
    </html>
  );
}
Esta abordagem promove um código mais limpo, manutenível e alinhado com o princípio DRY (Don't Repeat Yourself), centralizando a lógica de data fetching e o tratamento de erros em um único local.11Seção 3: O Coração da Reatividade: Mutações e UI OtimistaEnquanto o useSWR é primariamente focado na leitura (read) de dados, a interatividade de uma aplicação moderna depende crucialmente da capacidade de modificar esses dados (create, update, delete). É aqui que a API de mutação do SWR se torna a peça central, permitindo não apenas a atualização dos dados no servidor, mas também a manipulação inteligente do cache local para criar interfaces de usuário extremamente responsivas.3.1 A Função mutate: A Chave Mestra do CacheA função mutate é a principal ferramenta para interagir programaticamente com o cache do SWR. Ela permite invalidar, atualizar e revalidar dados de forma flexível. Existem duas formas de acessá-la:mutate Vinculada (Bound): É a função retornada diretamente pelo hook useSWR. Ela já está "vinculada" à key daquele hook específico, tornando sua utilização mais concisa.13mutate Global: Pode ser importada diretamente do pacote swr ou obtida através do hook useSWRConfig. Esta versão requer que a key do cache a ser modificada seja passada como seu primeiro argumento, permitindo que um componente atualize dados que são utilizados por outro componente completamente diferente na árvore de componentes.3A função mutate possui duas funcionalidades principais:Revalidar Dados: Chamar mutate(key) (ou apenas mutate() para a versão vinculada) sem passar novos dados instrui o SWR a marcar o cache daquela key como obsoleto e a disparar uma revalidação (uma nova busca) imediatamente.17Atualizar Cache Localmente: Chamar mutate(key, newData, options) permite atualizar o valor no cache para newData de forma síncrona, sem necessariamente fazer uma requisição à rede. Isso é a base para as atualizações otimistas.213.2 UI Otimista: A Percepção da VelocidadeA UI Otimista (Optimistic UI) é um padrão de design poderoso que visa melhorar a percepção de velocidade e responsividade de uma aplicação. A premissa é simples: quando um usuário realiza uma ação, como enviar uma mensagem ou curtir uma foto, a interface do usuário é atualizada imediatamente, como se a operação no servidor já tivesse sido concluída com sucesso, antes mesmo de receber a confirmação da rede.10Este "otimismo" reduz a latência percebida a zero, pois a resposta visual à ação do usuário é instantânea.10 O SWR, então, lida com a sincronização com o servidor em segundo plano. Se a operação for bem-sucedida, o estado da UI permanece. Se falhar, a UI é revertida para o estado anterior, e uma notificação de erro pode ser exibida. Este padrão é amplamente utilizado em aplicações de mensagens instantâneas, redes sociais e ferramentas de colaboração, onde a fluidez da interação é primordial.10 É importante notar que, por ser um compromisso, a UI otimista não é adequada para todas as situações. Operações financeiras ou outras ações críticas, onde a confirmação do servidor é indispensável antes de prosseguir, são maus candidatos para esta abordagem.243.3 Anatomia da Mutação Otimista com SWR 2.0A versão 2.0 do SWR revolucionou a implementação de UIs otimistas ao introduzir um conjunto de opções declarativas para a função mutate. Essas opções, quando combinadas, permitem construir fluxos de mutação robustos e resilientes com um código surpreendentemente limpo.25A assinatura completa da função mutate para uma atualização otimista é mutate(asyncAction, options).OpçãoDescriçãoCaso de UsooptimisticDataFornece os dados que serão usados para atualizar a UI imediatamente, antes do início da asyncAction. Pode ser um valor direto ou uma função que recebe os dados atuais e retorna o novo estado otimista.Ao adicionar uma nova mensagem a uma lista, optimisticData seria o array de mensagens atual concatenado com a nova mensagem temporária.populateCacheSe true, o valor resolvido pela asyncAction (a resposta da sua API de POST/PUT) será usado para atualizar o cache. Isso evita uma revalidação GET subsequente.Sua API de criação de mensagem retorna o objeto completo da mensagem, incluindo o id gerado pelo banco de dados e o timestamp. Use populateCache: true para que esses dados "oficiais" substituam os dados otimistas no cache.revalidateUm booleano (true por padrão) que controla se o SWR deve disparar uma revalidação após a conclusão da asyncAction.Defina como false quando populateCache for true e a resposta da API já for a fonte da verdade, economizando uma requisição de rede desnecessária.rollbackOnErrorSe true (padrão), em caso de erro na asyncAction, o SWR reverterá o cache para o estado anterior à atualização otimista, desfazendo a mudança na UI.Essencial para a robustez. Se a API falhar ao salvar a nova mensagem, a UI reverte e a mensagem "otimista" desaparece, evitando um estado inconsistente.A combinação estratégica dessas opções permite um fluxo de mutação completo. O padrão C(R)UD (Create, Read, Update, Delete), onde cada mutação é seguida por uma requisição de leitura (Read) para obter o estado atualizado, pode ser otimizado. Com populateCache, o fluxo se torna C(U)D. A resposta da própria mutação (Create/Update) é usada para atualizar o cache, eliminando a necessidade de uma requisição Read (revalidação) subsequente. Isso significa que, ao invés de dizer ao SWR "algo mudou, vá verificar", você diz "algo mudou, e aqui estão os novos dados", economizando uma viagem completa de ida e volta à rede e tornando a aplicação genuinamente mais eficiente.3.4 O Hook useSWRMutation: Uma API DeclarativaPara ações que modificam dados (POST, PUT, DELETE), o SWR 2.0 introduziu o hook useSWRMutation. Diferente do useSWR, ele não dispara a requisição na renderização do componente. Em vez disso, ele retorna uma função trigger que deve ser chamada manualmente para iniciar a mutação.21JavaScriptimport useSWRMutation from 'swr/mutation';

// O 'fetcher' da mutação recebe um argumento extra 'arg'
async function sendRequest(url, { arg }) {
  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(arg),
  });
}

function CreateUserButton() {
  const { trigger, isMutating } = useSWRMutation('/api/user', sendRequest);

  const handleCreate = async () => {
    try {
      await trigger({ username: 'novo_usuario' });
      // Ação após sucesso
    } catch (error) {
      // Lidar com erro
    }
  };

  return (
    <button onClick={handleCreate} disabled={isMutating}>
      {isMutating? 'Criando...' : 'Criar Usuário'}
    </button>
  );
}
As principais vantagens do useSWRMutation são:API Declarativa: Separa a definição da mutação da sua execução.Segurança: Compartilha o mesmo cache que o useSWR, o que ajuda a prevenir condições de corrida entre leituras e escritas para a mesma key.21Integração Completa: Suporta todas as opções de UI otimista (optimisticData, populateCache, etc.), que podem ser passadas tanto para o hook quanto para a função trigger.21Seção 4: Cenário Prático - Construindo um Chat de Mensagens InterativasPara solidificar os conceitos de mutação e UI otimista, vamos aplicá-los ao cenário proposto: uma aplicação de chat que lista mensagens interativas. O objetivo é criar uma experiência de usuário fluida para adicionar, atualizar e deletar mensagens. A key principal para a lista de mensagens será /api/messages.4.1 Estrutura do CenárioVamos assumir uma estrutura de dados simples para as mensagens:{ id: number, text: string, status: 'sent' | 'sending' | 'failed', createdAt: string }A aplicação terá um componente principal que busca e exibe a lista de mensagens e um componente de entrada para o usuário digitar e enviar novas mensagens. Para uma arquitetura escalável, encapsularemos toda a lógica de dados em um hook customizado useMessages.JavaScript// hooks/useMessages.js
import useSWR from 'swr';
import { api } from '../lib/api'; // Módulo de API abstrato

const fetcher = (url) => api.get(url);

export function useMessages() {
  const { data, error, isLoading, mutate } = useSWR('/api/messages', fetcher);

  // Funções de mutação serão adicionadas aqui...

  return {
    messages: data,
    error,
    isLoading,
    //...funções de mutação
  };
}
4.2 Adicionando uma Nova Mensagem (Passo a Passo Detalhado)Este é o fluxo mais crítico para a experiência do usuário em um chat: a mensagem deve aparecer instantaneamente.Ação do Usuário: O usuário digita o texto e clica em "Enviar".Construção Otimista: No manipulador do evento, criamos um objeto de mensagem temporário. Um ponto crucial aqui é a key para o React. Como o id final virá do banco de dados, geramos um id temporário e único no cliente (usando Date.now() ou uma biblioteca de UUID) para renderização otimista. Também adicionamos um status sending para feedback visual.28Chamada mutate: A função mutate é chamada com a combinação ideal de opções para uma UI otimista robusta.JavaScript// Dentro do hook useMessages.js

const addMessage = async (text) => {
  // 1. Criar a mensagem otimista
  const tempId = `temp-${Date.now()}`;
  const optimisticMessage = {
    id: tempId,
    text,
    status: 'sending',
    createdAt: new Date().toISOString(),
  };

  // 2. A promessa que representa a chamada real à API
  const apiPromise = api.post('/api/messages', { text });

  // 3. Chamar mutate com as opções otimistas
  await mutate(apiPromise, {
    // 3.1. Atualiza a UI imediatamente com a mensagem otimista
    optimisticData: (currentMessages) => [...currentMessages, optimisticMessage],

    // 3.2. Usa a resposta da API (que deve retornar a mensagem criada) para atualizar o cache
    populateCache: (newMessage, currentMessages) => {
      // Substitui a mensagem temporária pela versão final da API
      return currentMessages.map((msg) =>
        msg.id === tempId? {...newMessage, status: 'sent' } : msg
      );
    },

    // 3.3. Desativa a revalidação GET, pois o cache já foi populado
    revalidate: false,

    // 3.4. Reverte a UI em caso de falha na API
    rollbackOnError: true,
  });
};

// Retornar 'addMessage' do hook
return { messages: data, addMessage, /*... */ };
Análise Detalhada do Fluxo:optimisticData é uma função que recebe o estado atual do cache (currentMessages) e retorna o novo estado. Isso adiciona a mensagem à lista na UI instantaneamente.25A apiPromise é passada como o primeiro argumento para mutate. O SWR aguarda sua resolução ou rejeição.21populateCache é a etapa de reconciliação. Quando a apiPromise resolve, seu resultado (newMessage) é passado para esta função. Nós então encontramos a mensagem temporária pelo tempId e a substituímos pela versão final retornada pela API, que agora contém o id permanente e o status correto. Isso é crucial para manter a consistência dos dados sem uma nova requisição.26revalidate: false é uma otimização de performance vital aqui. Como populateCache já nos deu a "fonte da verdade", uma requisição GET adicional para revalidar seria redundante.25rollbackOnError: true garante que, se a apiPromise falhar, a optimisticData seja desfeita, e a mensagem com status sending desapareça da UI, permitindo um tratamento de erro adequado (por exemplo, mudando o status para failed).264.3 Atualizando uma Mensagem Existente (Pós-Criação ou Edição)O processo para atualizar uma mensagem existente é conceitualmente semelhante, mas em vez de adicionar um item, usamos o método .map() em optimisticData para encontrar e modificar o item relevante.JavaScript// Dentro do hook useMessages.js

const updateMessage = async (messageId, updatedText) => {
  const apiPromise = api.put(`/api/messages/${messageId}`, { text: updatedText });

  await mutate(apiPromise, {
    optimisticData: (currentMessages) =>
      currentMessages.map((msg) =>
        msg.id === messageId? {...msg, text: updatedText } : msg
      ),
    populateCache: (updatedMessage, currentMessages) => {
      // A resposta da API pode conter campos atualizados como 'updatedAt'
      return currentMessages.map((msg) =>
        msg.id === messageId? updatedMessage : msg
      );
    },
    revalidate: false,
    rollbackOnError: true,
  });
};

// Retornar 'updateMessage' do hook
A lógica otimista aqui é simplesmente aplicar a mudança de texto localmente. A etapa populateCache garante que quaisquer outros campos que o servidor possa ter modificado (como um timestamp updatedAt) sejam corretamente sincronizados no cache do cliente.4.4 Deletando uma MensagemPara a exclusão, a atualização otimista envolve filtrar o item da lista. A resposta de uma API de exclusão geralmente é um status 204 No Content, então a lógica de populateCache é diferente.JavaScript// Dentro do hook useMessages.js

const deleteMessage = async (messageId) => {
  const apiPromise = api.delete(`/api/messages/${messageId}`);

  await mutate(apiPromise, {
    // Remove a mensagem da UI imediatamente
    optimisticData: (currentMessages) =>
      currentMessages.filter((msg) => msg.id!== messageId),
    
    // Como a API de delete não retorna conteúdo, não precisamos popular o cache.
    // O estado otimista já é o estado final desejado.
    populateCache: false, 
    
    // Revalidar pode ser útil em alguns casos, mas para delete simples,
    // o estado otimista é suficiente.
    revalidate: false,
    rollbackOnError: true,
  });
};

// Retornar 'deleteMessage' do hook
Neste caso, populateCache é desnecessário. O estado otimista (a lista sem o item deletado) já reflete o estado final verdadeiro após uma exclusão bem-sucedida. Se a API falhar, rollbackOnError garantirá que a mensagem reapareça na lista, mantendo a integridade da UI. Uma abordagem alternativa, mas igualmente válida, seria atualizar o cache localmente primeiro e depois chamar a API, revalidando manualmente no final se necessário.30Seção 5: Estratégias Avançadas de Revalidação e SincronizaçãoAlém das mutações iniciadas pelo usuário, uma aplicação robusta precisa lidar com dados que mudam externamente. O SWR oferece um conjunto poderoso de ferramentas para manter os dados sincronizados, seja através de busca periódica (polling) ou em resposta a eventos em tempo real do servidor.5.1 Polling e o Dilema da EdiçãoA busca periódica de dados, ou polling, é uma técnica útil para manter a UI atualizada com mudanças que podem ocorrer no servidor a qualquer momento. No SWR, isso é facilmente ativado com a opção refreshInterval, que aceita um valor em milissegundos.32JavaScriptuseSWR('/api/messages', fetcher, { refreshInterval: 5000 }); // Revalida a cada 5 segundos
No entanto, isso introduz um problema crítico no cenário de edição: se um usuário estiver preenchendo um formulário com dados carregados pelo SWR, uma revalidação automática causada pelo refreshInterval pode buscar dados novos do servidor e sobrescrever as alterações que o usuário está fazendo, resultando em perda de trabalho e uma péssima experiência.A solução para este conflito reside na flexibilidade das opções do SWR. A opção refreshInterval não aceita apenas um número, mas também uma função que recebe os dados mais recentes e deve retornar o intervalo desejado.13 Isso permite que o comportamento de polling seja condicional e reativo ao estado do componente.Podemos usar um estado local, como isEditing, para desativar dinamicamente o polling enquanto o usuário está editando:JavaScriptimport { useState } from 'react';
import useSWR from 'swr';

function EditableMessage({ messageId }) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');

  const { data: message } = useSWR(`/api/messages/${messageId}`, fetcher, {
    // A mágica acontece aqui:
    refreshInterval: isEditing? 0 : 5000, // 0 desativa o polling
    // Também é uma boa prática desativar outras revalidações durante a edição
    revalidateOnFocus:!isEditing,
    revalidateOnReconnect:!isEditing,
  });

  const handleStartEditing = () => {
    setContent(message.text);
    setIsEditing(true);
  };

  const handleSaveChanges = async () => {
    // Lógica para salvar as mudanças (usando mutate)
    //...
    setIsEditing(false); // Reativa o polling após salvar
  };

  //... JSX para exibir e editar a mensagem
}
Essa capacidade de tornar as opções de configuração do SWR dinâmicas e dependentes do estado do componente é um princípio de design fundamental da biblioteca. Ela permite que a lógica de data-fetching se adapte contextualmente ao que o usuário está fazendo, resolvendo problemas complexos como o conflito de edição de forma declarativa e elegante.5.2 Revalidação Disparada pelo Servidor: Garantindo a ConsistênciaA questão final e crucial é: como podemos usar um "sinal" da API para disparar uma revalidação, garantindo que a busca por novos dados ocorra precisamente quando o banco de dados foi atualizado? Existem duas estratégias principais para alcançar isso.Estratégia 1: Revalidação Pós-Mutação (Padrão Síncrono)Esta é a abordagem mais comum e direta. Após uma operação de escrita (POST, PUT, DELETE) ser enviada e confirmada pelo servidor, o cliente dispara manualmente uma revalidação para buscar o estado mais recente e consistente.JavaScriptconst saveChanges = async (dataToSave) => {
  try {
    // 1. Aguarda a confirmação da API de que a operação foi concluída com sucesso
    await api.put('/api/messages/1', dataToSave);
    
    // 2. Após o sucesso, dispara a revalidação para a 'key' relevante
    mutate('/api/messages'); 
  } catch (error) {
    // Lida com o erro da operação de escrita
  }
};
Neste padrão, a chamada mutate('/api/messages') atua como o "sinal" de que a operação no servidor foi concluída. Isso garante que a revalidação não ocorra prematuramente, enquanto a transação do banco de dados ainda está em andamento, prevenindo a busca por dados que ainda não foram atualizados.30Estratégia 2: Tempo Real com WebSockets (Padrão Assíncrono/Push)Para aplicações verdadeiramente colaborativas e em tempo real, onde as mudanças de um usuário devem ser refletidas para todos os outros clientes conectados instantaneamente, a melhor solução é usar WebSockets.A integração com SWR é surpreendentemente simples e revela seu poder como um cliente de cache universal. O SWR gerencia o estado do cache e a re-renderização, enquanto o WebSocket atua como o "transporte" para o sinal de invalidação.Conexão: O cliente estabelece uma conexão WebSocket com o servidor.Ação e Broadcast: Quando o Usuário A envia uma nova mensagem, o servidor a processa, salva no banco de dados e, em seguida, transmite (broadcast) um evento (ex: 'new_message') para todos os outros clientes conectados (Usuário B, C, etc.).Listener e mutate: No lado do cliente, um listener de eventos do WebSocket está sempre ativo. Ao receber o evento 'new_message', ele simplesmente chama a função mutate global com a key apropriada para acionar uma revalidação.JavaScript// Em um hook ou componente de alto nível (ex: no layout principal)
import { useEffect } from 'react';
import { mutate } from 'swr'; // Importa a mutação global
import { io } from 'socket.io-client';

function RealtimeProvider() {
  useEffect(() => {
    const socket = io('https://sua-api.com');

    // Ouve por um evento customizado do servidor
    socket.on('messages_updated', (data) => {
      console.log('Recebido sinal do servidor para revalidar mensagens.');
      // O "sinal" do servidor dispara a revalidação do SWR
      mutate('/api/messages');
    });

    // Limpa a conexão ao desmontar o componente
    return () => {
      socket.disconnect();
    };
  },);

  return null; // Este componente não renderiza nada
}
Esta abordagem é a forma mais precisa de implementar a "revalidação por sinal do servidor". O servidor se torna a fonte autoritativa que dita quando os clientes devem atualizar seus dados. Isso revela que a função mutate do SWR é um mecanismo de invalidação de cache agnóstico à fonte do gatilho. O sinal pode vir de uma ação do usuário, de um timer, do foco da janela ou, como neste caso, de um push do servidor, tornando a arquitetura da aplicação extremamente modular e robusta.35Seção 6: Gerenciamento de Cache e Boas Práticas de ArquiteturaPara construir aplicações grandes e manuteníveis com SWR, é essencial ir além do uso básico do hook e adotar práticas de arquitetura que promovam a organização, a reutilização de código e a robustez do sistema.6.1 Aprofundando no Cache do SWRPor padrão, o SWR utiliza um Map global, armazenado em memória, para gerenciar seu cache.37 Isso significa que todos os dados buscados são compartilhados entre todos os componentes da aplicação. Se dois componentes diferentes, em locais distintos da árvore de componentes, chamarem useSWR('/api/user', fetcher), apenas uma requisição de rede será feita. O segundo componente receberá os dados do cache e ambos serão atualizados quando a revalidação for concluída. Este comportamento é conhecido como "desduplicação de requisições" e é uma otimização de performance fundamental.9Embora o cache em memória seja suficiente para a maioria dos casos de uso, o SWR permite a customização completa do provedor de cache através da opção provider no SWRConfig. Isso abre a possibilidade de implementar caches persistentes, por exemplo, utilizando localStorage ou IndexedDB.37 Um cache persistente pode ser útil para aplicações que precisam funcionar offline ou para manter o estado da UI entre sessões de navegação, melhorando ainda mais a experiência do usuário ao carregar a aplicação com dados instantâneos, mesmo na primeira visita após um recarregamento da página.6.2 Arquitetura com Hooks CustomizadosA melhor prática para organizar a lógica de data fetching em uma aplicação escalável é encapsular as chamadas useSWR e a lógica de mutação associada em hooks customizados, agrupados por domínio de dados.7 Em vez de espalhar useSWR('/api/messages',...) e a lógica de mutate para adicionar/deletar mensagens por vários componentes, centraliza-se tudo em um único hook, como useMessages.JavaScript// hooks/useMessages.js
import useSWR from 'swr';
import { api } from '../lib/api';

const fetcher = (url) => api.get(url);

export function useMessages() {
  const { data: messages, error, isLoading, mutate } = useSWR('/api/messages', fetcher);

  const addMessage = async (text) => {
    // Implementação completa da mutação otimista para adicionar mensagem...
    const optimisticMessage = { /*... */ };
    const apiPromise = api.post('/api/messages', { text });
    await mutate(apiPromise, {
      optimisticData: (current) => [...current, optimisticMessage],
      //... outras opções
    });
  };

  const deleteMessage = async (id) => {
    // Implementação da mutação otimista para deletar mensagem...
    const apiPromise = api.delete(`/api/messages/${id}`);
    await mutate(apiPromise, {
      optimisticData: (current) => current.filter(msg => msg.id!== id),
      //... outras opções
    });
  };

  return {
    messages,
    error,
    isLoading,
    addMessage,
    deleteMessage,
  };
}
Os componentes da UI então consomem este hook de forma muito mais limpa:JavaScript// components/MessageList.jsx
import { useMessages } from '../hooks/useMessages';

function MessageList() {
  const { messages, isLoading, deleteMessage } = useMessages();
  if (isLoading) return <p>Carregando mensagens...</p>;
  return (
    <ul>
      {messages.map(msg => (
        <li key={msg.id}>
          {msg.text} <button onClick={() => deleteMessage(msg.id)}>X</button>
        </li>
      ))}
    </ul>
  );
}
Esta abordagem oferece vantagens significativas:Centralização da Lógica: Qualquer alteração na estrutura da API, nos endpoints ou na lógica de mutação é feita em um único arquivo, facilitando a manutenção.38Componentes Mais Simples: Os componentes da UI se tornam mais "burros", focados exclusivamente na apresentação dos dados e no disparo de ações, sem se preocuparem com os detalhes da implementação do data fetching.Reutilização e Consistência: O hook useMessages pode ser reutilizado em qualquer parte da aplicação que precise acessar ou modificar as mensagens, garantindo consistência.6.3 Tratamento Global de ErrosRepetir a lógica de tratamento de erros em cada chamada useSWR é ineficiente e propenso a inconsistências. O SWR oferece uma solução centralizada através da propriedade onError no SWRConfig.19 Este callback global será invocado sempre que qualquer fetcher dentro do seu escopo lançar um erro.JavaScript// app/providers.tsx
'use client';

import { SWRConfig } from 'swr';
import toast from 'react-hot-toast'; // Exemplo com uma biblioteca de notificações
import { Sentry } from '../lib/sentry'; // Exemplo com um serviço de logging

export function SWRProvider({ children }) {
  return (
    <SWRConfig
      value={{
        fetcher: (url) => fetch(url).then((res) => res.json()),
        onError: (error, key) => {
          // Não notificar o usuário sobre erros 403 (não autorizado) ou 404 (não encontrado)
          // pois eles podem ser tratados de forma específica na UI (ex: redirecionamento).
          if (error.status!== 403 && error.status!== 404) {
            // Para todos os outros erros (ex: 500), mostrar uma notificação genérica.
            toast.error('Ocorreu um erro inesperado. Tente novamente mais tarde.');
            
            // Enviar o erro para um serviço de monitoramento.
            Sentry.captureException(error);
          }
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
Esta configuração centraliza os "efeitos colaterais" dos erros, como logging e notificações ao usuário, mantendo os componentes limpos e a lógica de tratamento de erros consistente em toda a aplicação.19Seção 7: Conclusão e Recomendações Finais7.1 Resumo das Melhores PráticasAo longo deste guia, exploramos a profundidade e a flexibilidade do SWR para o gerenciamento de dados em aplicações Next.js. A maestria da biblioteca reside na aplicação consistente de um conjunto de melhores práticas que transformam a experiência do usuário e a manutenibilidade do código:Adote a UI Otimista: Para ações iniciadas pelo usuário (criar, atualizar, deletar), utilize o poderoso objeto de opções da função mutate (optimisticData, populateCache, revalidate, rollbackOnError) para fornecer feedback instantâneo e criar uma UI que se sente extremamente rápida.Combine Pré-renderização e Reatividade: Use as funcionalidades de pré-renderização do Next.js (SSG/SSR) em conjunto com a opção fallback do SWRConfig para obter o melhor dos dois mundos: carregamento inicial rápido e SEO, seguido por uma hidratação transparente para um estado dinâmico no cliente.Proteja a Interação do Usuário: Em cenários de edição de formulários, use a forma funcional de opções como refreshInterval para pausar dinamicamente o polling e outras revalidações automáticas, prevenindo a perda de dados inseridos pelo usuário.Revalide com Precisão: Garanta a consistência dos dados revalidando o cache (mutate(key)) somente após a confirmação de sucesso de uma operação de escrita na API. Para aplicações em tempo real, integre com WebSockets para que o servidor dite o momento exato da revalidação.Encapsule e Centralize: Construa uma arquitetura de dados escalável encapsulando a lógica do SWR em hooks customizados por domínio (useMessages, useUser, etc.) e utilize o SWRConfig para centralizar configurações globais como o fetcher e o tratamento de erros.7.2 SWR vs. Alternativas (Contexto Adicional)No ecossistema React, o principal concorrente do SWR é o React Query (agora TanStack Query). Ambas as bibliotecas resolvem o mesmo conjunto fundamental de problemas, mas com filosofias e trade-offs diferentes.40SWR é frequentemente elogiado por sua simplicidade, API minimalista e tamanho de pacote menor. Sua integração com o ecossistema Vercel/Next.js é perfeita, tornando-o uma escolha natural para muitos projetos construídos sobre essa stack. Ele se destaca em cenários onde o foco principal é a busca e revalidação de dados de forma eficiente.42React Query é considerado mais "opinativo" e rico em funcionalidades "out-of-the-box". Ele oferece ferramentas de desenvolvimento dedicadas (DevTools), uma API de mutação mais estruturada (useMutation) e um sistema de gerenciamento de cache mais granular com conceitos como staleTime. Essas funcionalidades adicionais vêm com o custo de um tamanho de pacote maior e uma curva de aprendizado potencialmente mais acentuada.41A escolha entre os dois geralmente depende da complexidade do projeto. Para a maioria das aplicações, incluindo cenários complexos de UI otimista como os discutidos aqui, o SWR (especialmente a partir da versão 2.0) é mais do que capaz e oferece uma solução mais leve e elegante. O React Query pode ser vantajoso em aplicações de grande escala com necessidades de gerenciamento de estado do servidor extremamente complexas e onde suas ferramentas de desenvolvimento são consideradas um requisito.7.3 Veredito FinalO SWR se estabelece como uma ferramenta indispensável no arsenal de um desenvolvedor Next.js. Ele vai muito além de uma simples biblioteca de data fetching, oferecendo uma estratégia coesa e poderosa para construir aplicações web que não são apenas funcionais, mas também rápidas, resilientes e prazerosas de usar. Ao dominar seus padrões de mutação otimista, revalidação inteligente e arquitetura de hooks, os desenvolvedores podem enfrentar os desafios mais complexos de gerenciamento de estado assíncrono com um código mais limpo, declarativo e robusto, entregando produtos de alta qualidade com maior eficiência.