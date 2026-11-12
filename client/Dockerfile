# ==============================================================================
# Dockerfile Multi-Stage para Frontend SAT-UNICESMAG (React + Vite + Nginx)
# ==============================================================================

# --- Etapa 1: Compilación de la aplicación React con Vite ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifiestos de paquetes
COPY package*.json ./

# Instalar dependencias
RUN npm install --no-audit --no-fund

# Copiar código fuente
COPY . .

# Argumento para la URL de la API (por defecto '/api' para usar el proxy de Nginx)
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Compilar los bundles de producción
RUN npm run build

# --- Etapa 2: Servidor web de producción con Nginx ---
FROM nginx:alpine AS runner

# Configurar zona horaria de Colombia
RUN apk add --no-cache tzdata wget && \
    cp /usr/share/zoneinfo/America/Bogota /etc/localtime && \
    echo "America/Bogota" > /etc/timezone

# Eliminar configuración predeterminada de Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Copiar configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los artefactos estáticos compilados desde la etapa builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Exponer el puerto HTTP
EXPOSE 80

# Verificación de salud del servidor Nginx
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
