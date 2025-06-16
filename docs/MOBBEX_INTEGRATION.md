# Integración de Mobbex - Pasarela de Pagos

Este documento describe la integración de la plataforma de pagos [Mobbex](https://mobbex.dev/) en el backend de MercadoTiendas.

## Índice

1. [Configuración](#configuración)
2. [Estructura de la integración](#estructura-de-la-integración)
3. [Flujo de pago](#flujo-de-pago)
4. [API Reference](#api-reference)
5. [Webhooks](#webhooks)
6. [Ejemplos de uso](#ejemplos-de-uso)
7. [Troubleshooting](#troubleshooting)

## Flujo Completo de Pago con Mobbex

### Descripción General

El flujo de pago con Mobbex sigue un patrón estándar de pasarela de pagos que involucra múltiples etapas desde la iniciación del pago hasta la confirmación final. Este proceso garantiza la seguridad y trazabilidad de todas las transacciones.

### Diagrama de Flujo

```
[Frontend] → [Backend] → [Mobbex] → [Usuario] → [Pago Completado]
     ↓           ↓           ↓          ↓              ↓
  Solicita   Crea      Genera URL   Completa      [Webhook]
   pago    checkout    de pago       pago             ↓
     ↑           ↑           ↑          ↑         [Backend]
     ↑           ↑           ↑          ↑              ↓
[Retorno]  [Actualiza]  [Notifica] [Redirige]  [Procesa y DB]
```

### Etapas Detalladas del Flujo

#### 1. **Iniciación del Pago (Frontend → Backend)**

**Endpoint:** `POST /api/payments/checkout`
**Autenticación:** JWT Token requerido

El usuario inicia el proceso de pago desde el frontend enviando:

```javascript
// Ejemplo de solicitud desde el frontend
const paymentData = {
  orderData: {
    total: 1500.50,
    description: "Compra en MercadoTiendas",
    reference: "order_123456"
  },
  customerData: {
    email: "usuario@email.com",
    name: "Juan Pérez",
    identification: "12345678"
  },
  items: [
    {
      name: "Producto 1",
      description: "Descripción del producto",
      quantity: 2,
      price: 750.25,
      image: "https://example.com/producto1.jpg"
    }
  ]
};

const response = await fetch('/api/payments/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`
  },
  body: JSON.stringify(paymentData)
});
```

#### 2. **Validación y Procesamiento (Backend)**

El backend realiza las siguientes validaciones:

- **Autenticación:** Verifica el token JWT del usuario
- **Validación de datos:** Usa middleware de validación para verificar:
  - Estructura correcta del objeto
  - Campos obligatorios presentes
  - Tipos de datos correctos
  - Montos válidos

```javascript
// Validaciones implementadas
- orderData.total (requerido, número positivo)
- customerData.email (requerido, formato email válido)
- items (requerido, array no vacío)
- items[].name (requerido, string)
- items[].price (requerido, número positivo)
```

#### 3. **Creación del Checkout (Backend → Mobbex)**

El servicio de Mobbex procesa los datos y crea el checkout:

```javascript
// Transformación de datos para Mobbex
const checkoutData = {
  total: orderData.total,
  currency: 'ARS',
  description: orderData.description,
  reference: orderData.reference,
  test: process.env.NODE_ENV !== 'production',
  return_url: `${FRONTEND_URL}/payment/return`,
  webhook: `${BACKEND_URL}/api/payments/webhook`,
  customer: {
    email: customerData.email,
    name: customerData.name,
    identification: customerData.identification
  },
  items: items.map(item => ({
    title: item.name,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.price,
    total: item.price * item.quantity,
    image: item.image || 'default-image-url'
  }))
};
```

**Respuesta del Backend:**
```json
{
  "success": true,
  "data": {
    "id": "CHK:XXXXXXXXXX",
    "url": "https://mobbex.com/p/checkout/v2/CHK:XXXXXXXXXX",
    "redirectUrl": "https://mobbex.com/p/checkout/v2/CHK:XXXXXXXXXX"
  },
  "message": "Checkout creado exitosamente"
}
```

#### 4. **Redirección al Pago (Frontend → Mobbex)**

El frontend recibe la URL de Mobbex y redirige al usuario:

```javascript
// Redirección automática o manual
if (response.data.success) {
  window.location.href = response.data.data.url;
  // O usando un iframe para mantener al usuario en el sitio
}
```

#### 5. **Procesamiento del Pago (Usuario → Mobbex)**

En la plataforma de Mobbex, el usuario:

1. **Selecciona método de pago:**
   - Tarjetas de crédito/débito
   - Transferencias bancarias
   - Billeteras digitales
   - Efectivo (Rapipago, Pago Fácil)

2. **Completa los datos necesarios:**
   - Información de la tarjeta
   - Datos de facturación
   - Confirmación de la transacción

3. **Mobbex procesa el pago:**
   - Validación con entidades bancarias
   - Verificación de fondos
   - Autorización de la transacción

#### 6. **Notificación via Webhook (Mobbex → Backend)**

**Endpoint:** `POST /api/payments/webhook` (Público)

Mobbex envía notificaciones en tiempo real sobre cambios en el estado del pago:

```javascript
// Estructura del webhook recibido
{
  "type": "payment.approved", // o payment.rejected, payment.pending
  "data": {
    "id": "CHK:XXXXXXXXXX",
    "reference": "order_123456",
    "status": {
      "code": "200",
      "text": "Pago aprobado"
    },
    "payment_method": {
      "name": "Visa",
      "type": "credit_card"
    },
    "total": 1500.50,
    "currency": "ARS",
    "created": "2024-01-15T10:30:00Z",
    "customer": {
      "email": "usuario@email.com",
      "name": "Juan Pérez"
    }
  }
}
```

#### 7. **Procesamiento del Webhook (Backend)**

El controlador de webhook realiza:

1. **Validación del webhook:**
   - Verificación de la estructura
   - Validación de firma (si está configurada)

2. **Búsqueda/Creación del registro de pago:**
   ```javascript
   // Buscar pago existente o crear nuevo
   let payment = await Payment.findOne({ mobbexId: webhookData.data.id });
   
   if (!payment) {
     // Crear nuevo registro de pago
     payment = new Payment({
       mobbexId: webhookData.data.id,
       userId: extractedUserId,
       amount: webhookData.data.total,
       currency: webhookData.data.currency,
       status: webhookData.data.status.text,
       // ... otros campos
     });
   } else {
     // Actualizar pago existente
     payment.status = webhookData.data.status.text;
     payment.paymentMethod = webhookData.data.payment_method?.name;
     payment.updatedAt = new Date();
   }
   
   await payment.save();
   ```

3. **Lógica de negocio adicional:**
   - Actualización de estado de pedidos
   - Envío de emails de confirmación
   - Actualización de inventario
   - Generación de facturas

#### 8. **Retorno del Usuario (Mobbex → Frontend)**

Después del pago, Mobbex redirige al usuario usando la `return_url`:

```javascript
// URL de retorno configurada
return_url: `${FRONTEND_URL}/payment/return?status=success&id=CHK:XXXXXXXXXX`

// El frontend puede consultar el estado final
const checkPaymentStatus = async (paymentId) => {
  const response = await fetch(`/api/payments/status/${paymentId}`, {
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });
  return response.json();
};
```

### Estados de Pago

| Estado | Código | Descripción |
|--------|--------|-------------|
| Pendiente | 0, 1 | Pago iniciado, esperando procesamiento |
| Aprobado | 200 | Pago exitoso y confirmado |
| Rechazado | 400, 401, 402 | Pago fallido por diversos motivos |
| Cancelado | 600 | Pago cancelado por el usuario |
| En Proceso | 100 | Pago en verificación |

### Manejo de Errores

#### Errores Comunes y Soluciones

1. **Error de validación de items:**
   ```
   Error: The 'items[0].image' field is required
   ```
   **Solución:** Asegurar que todos los items tengan el campo `image`

2. **Error de autenticación:**
   ```
   Error: User not found
   ```
   **Solución:** Verificar que el token JWT sea válido y el usuario exista

3. **Error de configuración:**
   ```
   Error: Cannot read properties of undefined (reading 'configure')
   ```
   **Solución:** Verificar la importación correcta del SDK: `const { mobbex } = require('mobbex')`

### Seguridad

#### Validación de Webhooks

Para mayor seguridad, implementar validación de firma:

```javascript
const crypto = require('crypto');

const validateWebhookSignature = (payload, signature, auditKey) => {
  const expectedSignature = crypto
    .createHmac('sha256', auditKey)
    .update(payload)
    .digest('hex');
  
  return signature === expectedSignature;
};
```

#### Mejores Prácticas

1. **Siempre validar webhooks** antes de procesar
2. **Implementar idempotencia** para evitar procesamiento duplicado
3. **Usar HTTPS** en todos los endpoints
4. **Logs detallados** para debugging y auditoría
5. **Timeouts apropiados** para requests a Mobbex
6. **Manejo de reintentos** para webhooks fallidos

### Monitoreo y Debugging

#### Logs Importantes

```javascript
// Logs implementados en el sistema
console.log('Checkout creado:', { id, url, reference });
console.log('Webhook recibido:', { type, paymentId, status });
console.log('Pago actualizado:', { paymentId, newStatus, userId });
```

#### Endpoints de Consulta

- `GET /api/payments/status/:id` - Estado de un pago específico
- `GET /api/payments/history` - Historial de pagos del usuario

Este flujo garantiza una experiencia de pago segura y trazable, con notificaciones en tiempo real y manejo robusto de errores.

## Configuración

### Requisitos previos

- Cuenta en Mobbex (Producción o Sandbox)
- API Key y Access Token de Mobbex
- URL del backend accesible públicamente para webhooks

### Variables de entorno

Añadir las siguientes variables al archivo `.env`:

```
MOBBEX_API_KEY=tu_api_key
MOBBEX_ACCESS_TOKEN=tu_access_token
MOBBEX_AUDIT_KEY=tu_audit_key (opcional)
BACKEND_URL=https://tu-backend.com
FRONTEND_URL=https://tu-frontend.com
```

## Estructura de la integración

La integración de Mobbex consta de los siguientes componentes:

- **Configuración**: `src/config/mobbex.js`
- **Servicio**: `src/services/mobbex.service.js`
- **Controlador**: `src/controllers/payment.controller.js`
- **Rutas**: `src/routes/payment.routes.js`
- **Modelo**: `src/models/Payment.js`
- **Validadores**: Reglas en `src/middlewares/validate.js`

## Flujo de pago

1. **Creación del checkout**:
   - El frontend solicita un checkout con los datos del pedido
   - El backend crea un checkout en Mobbex y devuelve la URL o el ID de checkout
   - El frontend redirige al usuario a la página de pago de Mobbex

2. **Proceso de pago**:
   - El usuario completa el pago en Mobbex
   - Mobbex notifica al backend mediante webhook
   - El backend actualiza el estado del pedido

3. **Verificación del estado**:
   - El frontend puede consultar el estado del pago
   - El backend verifica el estado en la base de datos o en Mobbex

## API Reference

### Crear un checkout

```
POST /api/payments/checkout
```

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "orderData": {
    "total": 1000.50,
    "description": "Compra en MercadoTiendas",
    "reference": "order_123"
  },
  "customerData": {
    "email": "cliente@ejemplo.com",
    "name": "Juan Pérez",
    "identification": "12345678"
  },
  "items": [
    {
      "name": "Producto 1",
      "description": "Descripción del producto",
      "quantity": 1,
      "price": 1000.50
    }
  ]
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Checkout creado exitosamente",
  "data": {
    "id": "checkout_id",
    "url": "https://mobbex.com/p/checkout/...",
    "redirectUrl": "https://mobbex.com/p/checkout/..."
  }
}
```

### Verificar estado de pago

```
GET /api/payments/status/:id
```

**Headers:**
```
Authorization: Bearer {token}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Estado del pago obtenido exitosamente",
  "data": {
    "id": "payment_id",
    "status": {
      "code": "200",
      "text": "Pago aprobado"
    },
    "paymentMethod": "visa",
    "amount": 1000.50,
    "currency": "ARS",
    "createdAt": "2023-06-13T15:30:00Z"
  }
}
```

### Obtener historial de pagos

```
GET /api/payments/history
```

**Headers:**
```
Authorization: Bearer {token}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Historial de pagos obtenido exitosamente",
  "data": [
    {
      "id": "payment_id_1",
      "reference": "order_123",
      "amount": 1000.50,
      "status": {
        "code": "200",
        "text": "Pago aprobado"
      },
      "createdAt": "2023-06-13T15:30:00Z"
    },
    {
      "id": "payment_id_2",
      "reference": "order_124",
      "amount": 2500.00,
      "status": {
        "code": "200",
        "text": "Pago aprobado"
      },
      "createdAt": "2023-06-12T10:15:00Z"
    }
  ]
}
```

## Webhooks

Mobbex envía notificaciones a través de webhooks cuando ocurren eventos relacionados con los pagos.

### Endpoint de webhook

```
POST /api/payments/webhook
```

Este endpoint es público (no requiere autenticación) y procesa las notificaciones de Mobbex.

### Eventos soportados

- `payment.created`: Se ha creado un pago
- `payment.updated`: Se ha actualizado el estado de un pago
- `payment.approved`: Pago aprobado
- `payment.rejected`: Pago rechazado

### Seguridad de webhooks

Para verificar la autenticidad de los webhooks, se puede utilizar la clave de auditoría (Audit Key) proporcionada por Mobbex.

## Ejemplos de uso

### Frontend: Crear un checkout y redirigir al usuario

```javascript
// Ejemplo con fetch
async function createCheckout(orderData) {
  try {
    const response = await fetch('https://tu-backend.com/api/payments/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        orderData: {
          total: 1500,
          description: "Compra en MercadoTiendas",
          reference: `order_${Date.now()}`
        },
        customerData: {
          email: "cliente@ejemplo.com",
          name: "Juan Pérez"
        },
        items: [
          {
            name: "Producto Premium",
            price: 1500,
            quantity: 1
          }
        ]
      })
    });
    
    const result = await response.json();
    
    if (result.success && result.data.url) {
      // Redirigir al usuario a la página de pago
      window.location.href = result.data.url;
    } else {
      console.error("Error al crear el checkout:", result.message);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}
```



## Troubleshooting

### Problemas comunes

1. **El checkout no se crea**
   - Verificar que las credenciales de Mobbex sean correctas
   - Comprobar que todos los campos requeridos estén presentes

2. **No se reciben webhooks**
   - Verificar que la URL del backend sea accesible públicamente
   - Comprobar que la ruta del webhook esté correctamente configurada

3. **Error en el procesamiento del webhook**
   - Revisar el formato de los datos recibidos
   - Verificar que el modelo Payment esté correctamente configurado

### Logs y depuración

Para habilitar logs detallados, puedes configurar un logger específico para la integración de Mobbex:

```javascript
// En src/services/mobbex.service.js
const debug = require('debug')('app:mobbex');

// Usar debug para registrar información
debug('Creando checkout:', orderData);
```

---

Para cualquier consulta adicional sobre la integración de Mobbex, contactar al equipo de desarrollo o consultar la [documentación oficial de Mobbex](https://mobbex.dev/docs).
