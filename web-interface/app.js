import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as socketIo } from 'socket.io';
import fs from 'fs';
import axios from 'axios';
import basicAuth from 'express-basic-auth';
import { promisify } from 'util';
import { generatePublic } from '../src/utils/generators.js';
import rateLimit from 'express-rate-limit';
import os from 'os';
import { createGzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';

const cache = {
  saldo: null,
  timestamp: 0,
  numChaves: 0,
  ttl: 60000, // 1 minuto
  isValid() {
    return this.saldo !== null && 
           Date.now() - this.timestamp < this.ttl;
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new socketIo(server);

const port = 3000;

let authMiddleware;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // limite de 100 requisições por IP
});

app.use(limiter);

const perguntarParaIniciarInterface = (rl) => {
  return new Promise((resolve, reject) => {
    
    rl.question('[beta] Deseja iniciar a interface web? (s/n) [n]: ', (resposta) => {
      const respostaNormalizada = resposta.trim().toLowerCase();
      if (respostaNormalizada === 's' || respostaNormalizada === 'sim') {
        //As credencias de usuário e senha servem para conseguir acessar as chaves privadas e evitar que qualquer pessoa da rede seja capaz de ter acesso as chaves.
        rl.question('Crie um nome de usuário: ', (username) => {
          rl.question('Crie uma senha: ', (password) => {
            authMiddleware = basicAuth({
              users: { [username]: password },
              challenge: true,
              unauthorizedResponse: (req) => (req.auth ? 'Credenciais inválidas' : 'Necessário fornecer credenciais'),
            });
            resolve(true);
          });
        });
      } else {
        resolve(false);
      }
    });
  });
};

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/keys', (req, res, next) => {
  if (authMiddleware) {
    authMiddleware(req, res, next);
  } else {
    next();
  }
}, (req, res) => {
  const filePath = path.join(__dirname, '../keys.txt');
  const chavesWIF = lerChavesWIF(filePath);
  res.render('keys', { keys: chavesWIF ? chavesWIF : [] });
});

io.on('connection', (socket) => {
  descobrirSaldoNasCarteiras().then((saldo) => {
    enviarSaldoAtualizado(socket, saldo);
  });
  enviarCarteirasEncontradas(socket);
});

const enviarSaldoAtualizado = (socket, saldo) => {
  socket.emit('saldoAtualizado', saldo.trim());
};

const enviarCarteirasEncontradas = (socket) => {
  const filePath = path.join(__dirname, '../keys.txt');

  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.error('O arquivo não foi encontrado:', err);
      } else {
        console.error('Erro ao ler o arquivo:', err);
      }
      const numChaves = 0;
      socket.emit('carteirasEncontradas', numChaves);
      return;
    }

    const chavesPrivadas = lerChavesPrivadas(filePath);
    const numChaves = chavesPrivadas.length;

    socket.emit('carteirasEncontradas', numChaves);
  });
};


const lerChavesPrivadas = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const linhas = content.split('\n');
    const chavesPrivadas = [];

    linhas.forEach((linha) => {
      const match = linha.match(/Private key: ([a-fA-F0-9]+)/);
      if (match) {
        const chavePrivada = match[1];
        chavesPrivadas.push(chavePrivada);
      }
    });

    return chavesPrivadas;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('O arquivo não foi encontrado:', error);
    } else {
      console.error('Erro ao ler o arquivo:', error);
    }
    return [];
  }
};

const lerChavesWIF = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const linhas = content.split('\n');
  const chavesWIF = [];

  linhas.forEach((linha) => {
    const match = linha.match(/WIF: ([A-Za-z0-9]+)/);
    if (match) {
      const chaveWIF = match[1];
      chavesWIF.push(chaveWIF);
    }
  });

  return chavesWIF;
};

const buscarSaldos = async (enderecosParaConsulta) => {
  try {
    //Essa requisição não é perigosa, ela envia os endereços das chaves encontradas para conseguir o saldo em bitcoin de cada uma delas
    const response = await axios.get(`https://blockchain.info/balance?active=${enderecosParaConsulta}`);
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar saldos:', error);
  }
};

const descobrirSaldoNasCarteiras = async () => {
  const filePath = path.join(__dirname, '../keys.txt');
  const chavesPrivadas = lerChavesPrivadas(filePath);
  const numChaves = chavesPrivadas.length;

  if (cache.isValid() && cache.numChaves === numChaves) {
    logToFile(`Usando cache para saldo: ${cache.saldo} BTC`, 'CACHE');
    return cache.saldo;
  }

  const chavesPublicas = chavesPrivadas.map((chavePrivada) => generatePublic(chavePrivada));
  const enderecosParaConsulta = chavesPublicas.join(',');
  
  try {
    const dados = await buscarSaldos(enderecosParaConsulta);
    
    let somaFinalBalance = 0;
    for (const endereco in dados) {
      if (dados.hasOwnProperty(endereco)) {
        somaFinalBalance += dados[endereco].final_balance;
      }
    }

    const resultadoEmBitcoin = somaFinalBalance / 1e8;
    const saldoArredondado = resultadoEmBitcoin.toFixed(2);

    const saldoFilePath = path.join(__dirname, '../saldo.txt');
    fs.writeFileSync(saldoFilePath, saldoArredondado, 'utf8');

    Object.assign(cache, {
      saldo: saldoArredondado,
      timestamp: Date.now(),
      numChaves: numChaves
    });

    logToFile(`Saldo atualizado: ${saldoArredondado} BTC`, 'UPDATE');
    return saldoArredondado;
  } catch (error) {
    logToFile(`Erro ao buscar saldo: ${error.message}`, 'ERROR');
    throw error;
  }
};

const monitorarKeys = () => {
  const filePath = path.join(__dirname, '../keys.txt');

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      fs.writeFileSync(filePath, '', 'utf8');
      logToFile('Arquivo keys.txt criado', 'SYSTEM');
    }

    let timeoutId;
    fs.watch(filePath, (eventType, filename) => {
      if (filename && eventType === 'change') {
        // Debounce para evitar múltiplas atualizações
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          try {
            const numChaves = lerChavesPrivadas(filePath).length;
            metrics.carteirasEncontradas = numChaves;
            
            if (numChaves > 0) {
              notifyClients('success', `Nova carteira encontrada! Total: ${numChaves}`);
            }
            
            enviarCarteirasEncontradas(io);
            const saldo = await descobrirSaldoNasCarteiras();
            enviarSaldoAtualizado(io, saldo);
            
            logToFile(`Arquivo atualizado: ${numChaves} chaves encontradas`, 'UPDATE');
          } catch (error) {
            notifyClients('error', 'Erro ao processar atualização');
            logToFile(`Erro ao processar atualização: ${error.message}`, 'ERROR');
          }
        }, 1000); // Aguarda 1 segundo antes de processar
      }
    });
  });
};

const logDir = path.join(__dirname, '../logs');

// Garantir que o diretório de logs existe
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Função para log
const logToFile = (message, type = 'INFO') => {
  const timestamp = new Date().toISOString();
  const logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
  const logMessage = `${timestamp} - [${type}] - ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
};

// Expandir métricas
const metrics = {
  chavesVerificadas: 0,
  tempoTotal: 0,
  carteirasEncontradas: 0,
  // Novas métricas
  ultimaChaveVerificada: '',
  chavesVerificadasPorSegundo: 0,
  memoriaUtilizada: process.memoryUsage().heapUsed,
  uptime: process.uptime()
};

// Adicionar rota de métricas antes do healthcheck
app.get('/metrics', (req, res) => {
  // Atualizar métricas
  metrics.carteirasEncontradas = lerChavesPrivadas(path.join(__dirname, '../keys.txt')).length;
  
  // Adicionar log
  logToFile('Metrics endpoint accessed');
  
  res.json(metrics);
});

// Adicionar rota específica para healthcheck
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Adicionar logo após as configurações iniciais do app
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logToFile(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
      'REQUEST'
    );
  });
  
  next();
});

app.get('/status', (req, res) => {
  const status = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      ...process.memoryUsage(),
      formatted: {
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
      }
    },
    system: {
      platform: process.platform,
      version: process.version,
      cpus: os.cpus().length
    },
    metrics: {
      ...metrics,
      carteirasEncontradas: lerChavesPrivadas(path.join(__dirname, '../keys.txt')).length
    }
  };

  logToFile('Status endpoint accessed', 'INFO');
  res.json(status);
});

const listenAsync = promisify(server.listen).bind(server);

export const iniciarInterfaceWeb = async (rl) => {
  const iniciarInterface = await perguntarParaIniciarInterface(rl);
  if (iniciarInterface) {
    monitorarKeys();
    try {
      await listenAsync(port);
      console.log(`[beta] Servidor rodando em http://localhost:${port}`);
    } catch (error) {
      console.error('Erro ao iniciar o servidor:', error);
    }
  } else {
    console.log('Interface web não iniciada.');
  }
};

// Adicionar após as configurações do Socket.IO
const notifyClients = (type, message) => {
  io.emit('notification', {
    type,
    message,
    timestamp: new Date().toISOString()
  });
};

// Função para fazer backup dos arquivos importantes
const backupFiles = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../backups', timestamp);
  
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    
    // Backup das chaves
    const keysContent = fs.readFileSync(path.join(__dirname, '../keys.txt'));
    fs.writeFileSync(path.join(backupDir, 'keys.txt'), keysContent);
    
    // Backup do saldo
    const saldoContent = fs.readFileSync(path.join(__dirname, '../saldo.txt'));
    fs.writeFileSync(path.join(backupDir, 'saldo.txt'), saldoContent);
    
    logToFile(`Backup criado em ${backupDir}`, 'BACKUP');
  } catch (error) {
    logToFile(`Erro ao criar backup: ${error.message}`, 'ERROR');
  }
};

// Agendar backup a cada 6 horas
setInterval(backupFiles, 6 * 60 * 60 * 1000);

// Middleware de erro global
app.use((err, req, res, next) => {
  const errorId = Date.now().toString(36);
  logToFile(`Error ID ${errorId}: ${err.stack}`, 'ERROR');
  
  res.status(500).json({
    error: 'Erro interno do servidor',
    errorId,
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  logToFile(`Rota não encontrada: ${req.method} ${req.originalUrl}`, 'WARN');
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Monitor de memória
const monitorarMemoria = () => {
  const memoriaUsada = process.memoryUsage().heapUsed / 1024 / 1024;
  const limiteMemoria = 500; // 500MB
  
  if (memoriaUsada > limiteMemoria) {
    logToFile(`Alerta de memória: ${memoriaUsada.toFixed(2)}MB em uso`, 'WARN');
    notifyClients('warning', 'Alto uso de memória detectado');
    
    // Forçar coleta de lixo se disponível
    if (global.gc) {
      global.gc();
      logToFile('Coleta de lixo forçada executada', 'SYSTEM');
    }
  }
};

// Verificar a cada minuto
setInterval(monitorarMemoria, 60 * 1000);

const comprimirLogsAntigos = () => {
  const hoje = new Date();
  const logFiles = fs.readdirSync(logDir);
  
  logFiles.forEach(file => {
    if (!file.endsWith('.log')) return;
    
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);
    const diasDiferenca = (hoje - stats.mtime) / (1000 * 60 * 60 * 24);
    
    if (diasDiferenca > 7) { // Comprimir logs mais antigos que 7 dias
      const gzip = createGzip();
      const source = createReadStream(filePath);
      const destination = createWriteStream(`${filePath}.gz`);
      
      source.pipe(gzip).pipe(destination);
      
      source.on('end', () => {
        fs.unlinkSync(filePath);
        logToFile(`Log comprimido: ${file}`, 'SYSTEM');
      });
    }
  });
};

// Comprimir logs antigos diariamente
setInterval(comprimirLogsAntigos, 24 * 60 * 60 * 1000);


