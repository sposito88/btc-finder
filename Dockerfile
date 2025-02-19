FROM node:20-slim

# Instalar curl para o healthcheck
RUN apt-get update && apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Configurar diretório de trabalho
WORKDIR /app

# Copiar package.json primeiro para aproveitar cache do Docker
COPY package*.json ./

# Instalar dependências (mudando de npm ci para npm install)
RUN npm install --omit=dev

# Copiar resto dos arquivos do projeto
COPY . .

# Criar diretório de logs
RUN mkdir -p /app/logs
VOLUME ["/app/logs"]

# Expor porta
EXPOSE 3000

# Configurar healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/metrics || exit 1

# Comando para iniciar a aplicação
CMD ["npm", "start"]