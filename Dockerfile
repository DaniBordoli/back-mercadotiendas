# Usar una imagen base oficial de Node.js (Debian buster es muy estable para FFmpeg)
FROM node:18-buster

# 1. Instalar FFmpeg y dependencias del sistema
# Esto evita el SIGSEGV porque usa la versión compilada para este sistema exacto
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

# 6. Exponer el puerto (Render usa la variable PORT, pero exponemos 3000 por defecto)
EXPOSE 3000

# 7. Comando de inicio
CMD [ "npm", "start" ]