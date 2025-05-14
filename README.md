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
5. Solicitar y colocar el archivo `firebase-service-account-dev.json` en la carpeta `src/config/`

### Archivos necesarios para desarrollo

- `.env` con las variables de entorno (copiar de `.env.example`)
- `src/config/firebase-service-account-dev.json` para autenticación con Firebase

> Nota: Estos archivos contienen credenciales sensibles y no están incluidos en el repositorio. Solicítalos al equipo de desarrollo.

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
