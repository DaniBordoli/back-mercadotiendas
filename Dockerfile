# USAR 'bookworm' (Debian 12) en lugar de 'buster'.
# Bookworm es la versión estable actual y tiene repositorios activos.
FROM node:18-bookworm

# 1. Instalar FFmpeg y dependencias del sistema
# Al usar Bookworm, obtendrás una versión de FFmpeg más reciente (v5.x o v6.x)
# lo que ayuda mucho a la estabilidad de la transcodificación.
RUN apt-get update && apt-get install -y ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. Configurar directorio de trabajo
WORKDIR /usr/src/app

# 3. Copiar archivos de dependencias
COPY package*.json ./

# 4. Instalar dependencias de Node.js
RUN npm install

# 5. Copiar el código fuente
COPY . .

# 6. Exponer el puerto
EXPOSE 3000

# 7. Comando de inicio
CMD [ "npm", "start" ]