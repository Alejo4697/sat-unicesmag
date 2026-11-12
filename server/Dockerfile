# ==============================================================================
# Dockerfile para Backend API SAT-UNICESMAG (Node.js + Express)
# ==============================================================================

FROM node:20-alpine AS base

# Dependencias del sistema y zona horaria Colombia (UTC-5)
RUN apk add --no-cache tzdata wget && \
    cp /usr/share/zoneinfo/America/Bogota /etc/localtime && \
    echo "America/Bogota" > /etc/timezone

WORKDIR /app

# Copiar manifiestos de paquetes
COPY package*.json ./

# Instalar únicamente dependencias de producción
RUN npm install --omit=dev --no-audit --no-fund

# Copiar el código fuente del servidor
COPY src/ ./src/

# Configurar permisos y usuario no privilegiado para mayor seguridad
RUN chown -R node:node /app
USER node

# Exponer el puerto del servidor
EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

# Verificación de salud del contenedor
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

CMD ["node", "src/server.js"]
