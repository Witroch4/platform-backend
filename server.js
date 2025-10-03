// server.js novo
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { spawn } = require("child_process");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

// Função de fechamento de conexões simplificada
async function closeConnections() {
  console.log("🔌 Fechando conexões...");
  // Implementação simplificada - as conexões serão fechadas automaticamente
}

// Monitoramento simplificado para containers
if (process.env.NODE_ENV === 'production') {
  // Iniciar monitoramento básico após 30 segundos
  setTimeout(() => {
    console.log("📊 Monitoramento básico iniciado");
  }, 30000);
}

// Verifica se está em ambiente de desenvolvimento
const dev = process.env.NODE_ENV !== "production";

// Função para verificar conexão do banco (sem inicialização pesada)
async function checkDatabaseConnection() {
  if (process.env.NODE_ENV === 'production') {
    try {
      const prisma = new PrismaClient();
      await prisma.$connect();
      console.log('✅ Conexão com banco de dados verificada');
      await prisma.$disconnect();
    } catch (error) {
      console.error('❌ Erro na conexão com banco:', error.message);
      process.exit(1);
    }
  }
}

// Inicializa o app Next
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Verificar conexão com banco em produção
  await checkDatabaseConnection();
  // Cria um servidor HTTP simples
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Armazena conexões ativas para encerramento limpa
  const connections = new Set();
  server.on("connection", (socket) => {
    connections.add(socket);
    socket.on("close", () => {
      connections.delete(socket);
    });
  });

  // Inicia o servidor na porta 3002
  server.listen(3002, (err) => {
    if (err) throw err;

    const isDocker = process.env.RUN_IN_DOCKER === "true";
    const ngrokUrl = process.env.NGROK_URL || "https://moved-chigger-randomly.ngrok-free.app";

    console.log("\n" + "=".repeat(60));
    console.log("🚀 Servidor Next.js Iniciado com Sucesso!");
    console.log("=".repeat(60));
    console.log(`📡 Porta:     3002`);
    console.log(`🌍 Ambiente:  ${dev ? "desenvolvimento" : "produção"}`);
    console.log(`🐳 Docker:    ${isDocker ? "Sim" : "Não"}`);
    console.log("-".repeat(60));
    console.log("🔗 URLs Disponíveis:");
    console.log(`   Local:     http://localhost:3002`);
    console.log(`   Bull UI:   http://localhost:3005`);
    if (isDocker) {
      console.log(`   Ngrok:     ${ngrokUrl}`);
      console.log(`   Dashboard: http://localhost:4040`);
    }
    console.log("=".repeat(60) + "\n");
  });

  if (dev && !process.env.RUN_IN_DOCKER) {
    // ---------------------------------------------------------------
    // SPAWN DOS WORKERS (apenas em desenvolvimento local)
    // ---------------------------------------------------------------

    const npxPath = path.join(process.cwd(), 'node_modules', '.bin', 'npx');

    // Bull Board (que por sua vez inicializa seus próprios workers)
    const bullBoardServer = spawn(
      npxPath,
      ["ts-node", "-r", "tsconfig-paths/register", "bull-board-server.ts"],
      { shell: true, stdio: "inherit" }
    );

    // Worker de automação (caso queira rodar separado)
    const workerInstagram = spawn(
      npxPath,
      ["ts-node", "-r", "tsconfig-paths/register", "worker/automacao.worker.ts"],
      { shell: true, stdio: "inherit" }
    );

    // ngrok removido - agora é um serviço Docker separado

    // função de shutdown encerra também esses spawns
    function shutdown() {
      console.log("> [server] Encerrando servidor e workers...");
      for (const conn of connections) conn.destroy();
      server.close(() => {
        console.log("> [server] Servidor encerrado.");
        bullBoardServer.kill();
        workerInstagram.kill();
        process.exit(0);
      });
    }
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else {
    // Em produção, apenas o servidor é iniciado
    function shutdown() {
      console.log("> [server] Encerrando servidor...");

      for (const conn of connections) {
        conn.destroy();
      }

      server.close(async () => {
        await closeConnections();
        console.log("> [server] Servidor encerrado.");
        process.exit(0);
      });
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
});
