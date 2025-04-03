# MercadoTiendas Backend

Backend para el sistema de gestión de tiendas online MercadoTiendas.

## Requisitos

- Node.js 14 o superior
- MongoDB

## Instalación

1. Clonar el repositorio
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Copiar el archivo de variables de entorno:
   ```bash
   cp .env.example .env
   ```
4. Configurar las variables de entorno en el archivo `.env`

## Desarrollo

Para ejecutar en modo desarrollo:
```bash
npm run dev
```

## Producción

Para ejecutar en producción:
```bash
npm start
```

## Estructura del Proyecto

```
src/
  ├── config/         # Configuración de la aplicación
  ├── controllers/    # Controladores
  ├── middlewares/    # Middlewares personalizados
  ├── models/         # Modelos de datos
  ├── routes/         # Rutas de la API
  ├── services/       # Servicios
  ├── utils/          # Utilidades
  └── index.js        # Punto de entrada
```
