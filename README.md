# Instruções para rodar o projeto

## Requisitos
  -  [NODE][install-node]
  -  [NPM][install-npm]

[![instalação do Node.js no Windows](https://img.youtube.com/vi/3bDtzMzaaCw/0.jpg)](https://www.youtube.com/watch?v=3bDtzMzaaCw)


## Execução do projeto (na maquina)
Execute os seguintes comandos no terminal:
 * Clone o repositório:
  ``` git clone git@github.com:lmajowka/btc-finder.git ```
 * Entre na pasta do projeto:
  ``` cd btc-finder ```
 * Instale as dependências:
 ``` npm install ```
 * Execute o projeto:
 ``` npm start ```

## Execução do projeto (em container)
## Requisitos
  -  [Docker][install-docker]
  -  [Docker-compose][install-dockercompose]

## É fácil como voar, siga os passos:
 * Clona o repo:
  ``` git clone git@github.com:lmajowka/btc-finder.git && cd btc-finder```
 * Build do Dockerfile:
   ``` docker buildx build --no-cache -t btc-finder .```
 * Executa a imagem contruída no passo anterior:
   ``` docker run -it --name btc-finder -p 3000:3000 btc-finder```

## 🚀 Melhorias Recentes

### 1. Sistema de Cache
- Implementação de cache inteligente para consultas de saldo
- TTL (Time To Live) configurável
- Validação automática de cache

### 2. Sistema de Logs Aprimorado
- Logs estruturados com timestamps
- Diferentes níveis de log (INFO, WARN, ERROR, SYSTEM, etc.)
- Compressão automática de logs antigos (após 7 dias)
- Diretório dedicado para armazenamento de logs

### 3. Monitoramento e Métricas
- Endpoint `/metrics` com métricas detalhadas
- Endpoint `/health` para healthcheck
- Endpoint `/status` com informações do sistema
- Monitoramento de uso de memória
- Métricas de performance

### 4. Sistema de Backup
- Backup automático a cada 6 horas
- Backup de chaves e saldos
- Diretório dedicado com timestamps
- Logs de backup

### 5. Segurança
- Rate limiting para prevenção de ataques
- Autenticação básica para acesso às chaves
- Validação de credenciais
- Proteção contra sobrecarga de requisições

### 6. Notificações em Tempo Real
- Sistema de notificações via WebSocket
- Notificações de novas carteiras encontradas
- Alertas de uso de memória
- Notificações de erros

### 7. Tratamento de Erros
- Middleware global de erro
- IDs únicos para cada erro
- Logs detalhados de erros
- Tratamento de rotas não encontradas

### 8. Performance
- Debounce em operações frequentes
- Otimização de uso de memória
- Coleta de lixo automática
- Compressão de dados antigos

### 9. Monitoramento de Sistema
- Monitoramento de uso de CPU
- Monitoramento de memória
- Alertas automáticos
- Métricas de sistema em tempo real

### 10. Melhorias na Interface Web
- Métricas em tempo real
- Sistema de autenticação
- Endpoints para monitoramento
- Logs de acesso detalhados

[install-node]: https://nodejs.org/en/download/
[install-npm]: https://www.npmjs.com/get-npm
[install-docker]: https://www.docker.com/get-started/
[install-dockercompose]: https://docs.docker.com/compose/install/