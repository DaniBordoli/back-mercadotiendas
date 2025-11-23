# Sistema de Pago Mock - MercadoTiendas

## Descripción General

Este documento describe la implementación del sistema de pago mock (simulado) para MercadoTiendas, que permite probar el flujo completo de checkout sin realizar transacciones reales.

## Arquitectura del Sistema Mock

### Backend (API)

#### 1. Controlador de Pago Mock
**Archivo:** `src/controllers/payment.controller.js`

**Función:** `completeMockPayment(paymentId)`
- Simula la finalización exitosa de un pago
- Busca el pago en la base de datos
- Simula un webhook exitoso de Mobbex
- Procesa el pago y actualiza el stock
- Retorna respuesta de éxito

#### 2. Ruta de Finalización Mock
**Endpoint:** `POST /api/payments/mock-complete/:paymentId`
- Permite completar manualmente un pago mock
- Útil para pruebas automatizadas y manuales

### Frontend (React)

#### 1. Pantalla de Pago Mock
**Archivo:** `src/screens/MockPayment.tsx`
- Simula una interfaz de pago real
- Muestra formulario de tarjeta de crédito (solo visual)
- Procesa el pago mock automáticamente
- Redirige al usuario a la página de confirmación

#### 2. Servicio de Pago Mock
**Archivo:** `src/services/paymentService.ts`
- Función `completeMockPayment()` para comunicarse con el backend
- Maneja errores y respuestas del servidor

#### 3. Store de Pago Actualizado
**Archivo:** `src/stores/paymentStore.ts`
- Función `createMockCheckout()` que crea un checkout simulado
- Genera URLs locales en lugar de URLs de Mobbex
- Mantiene la misma interfaz que el checkout real

## Flujo de Pago Mock

### 1. Inicio del Checkout
```
Usuario en CartSummary → Confirmar Compra → createMockCheckout()
```

### 2. Creación del Pago
```
Frontend → Backend (/api/payments/checkout) → Crear pago en BD → Retornar paymentId
```

### 3. Redirección a Pago Mock
```
Frontend → Navegar a /payment/mock/:paymentId
```

### 4. Simulación de Pago
```
MockPayment.tsx → Mostrar formulario → Simular procesamiento → completeMockPayment()
```

### 5. Finalización
```
Backend → Procesar webhook simulado → Actualizar pago y stock → Confirmar éxito
Frontend → Redirigir a /payment/return?status=approved
```

## Configuración y Uso

### Activar Modo Mock

En `CartSummary.tsx`, el sistema usa `createMockCheckout()` en lugar de `createCheckout()`:

```typescript
// Modo Mock (actual)
const checkoutResponse = await createMockCheckout(paymentData);

// Modo Real (comentado)
// const checkoutResponse = await createCheckout(paymentData);
```

### Datos de Prueba

La pantalla mock incluye datos de tarjeta predefinidos:
- **Número:** 4111 1111 1111 1111
- **Vencimiento:** 12/25
- **CVV:** 123
- **Titular:** JUAN PEREZ

### URLs y Rutas

- **Pago Mock:** `/payment/mock/:paymentId`
- **API Finalización:** `POST /api/payments/mock-complete/:paymentId`
- **Retorno:** `/payment/return?status=approved&payment_id=:paymentId`

## Ventajas del Sistema Mock

1. **Pruebas Sin Costo:** No se realizan transacciones reales
2. **Desarrollo Rápido:** No requiere configuración de Mobbex
3. **Control Total:** Simula diferentes escenarios de pago
4. **Interfaz Realista:** Mantiene la experiencia de usuario esperada
5. **Fácil Debugging:** Logs detallados en cada paso

## Diferencias con Pago Real

| Aspecto | Pago Real (Mobbex) | Pago Mock |
|---------|-------------------|-----------|
| Procesamiento | Externo (Mobbex) | Interno (simulado) |
| Interfaz | Popup de Mobbex | Página local |
| Validación | Real | Simulada |
| Costo | Comisiones reales | Sin costo |
| Tiempo | Variable | Controlado (2 segundos) |

## Logs y Debugging

El sistema incluye logs detallados en:
- **Frontend:** Console logs con prefijo `=== FRONTEND:`
- **Backend:** Console logs con prefijo `=== BACKEND:`
- **Payment Store:** Console logs con prefijo `=== PAYMENT STORE:`

## Migración a Producción

Para cambiar a pagos reales:

1. En `CartSummary.tsx`, cambiar:
   ```typescript
   // De:
   const checkoutResponse = await createMockCheckout(paymentData);
   
   // A:
   const checkoutResponse = await createCheckout(paymentData);
   ```

2. Configurar credenciales reales de Mobbex en variables de entorno

3. Remover o comentar las rutas mock del router

## Archivos Modificados

### Backend
- `src/controllers/payment.controller.js` - Agregada función `completeMockPayment`
- `src/routes/payment.routes.js` - Agregada ruta mock

### Frontend
- `src/screens/MockPayment.tsx` - Nueva pantalla de pago mock
- `src/services/paymentService.ts` - Agregada función `completeMockPayment`
- `src/stores/paymentStore.ts` - Agregada función `createMockCheckout`
- `src/screens/CartSummary.tsx` - Modificado para usar checkout mock
- `src/navigation/routes.tsx` - Agregada ruta `/payment/mock/:paymentId`

## Consideraciones de Seguridad

- El sistema mock NO debe usarse en producción
- Los datos de tarjeta son solo visuales, no se procesan
- Las validaciones de seguridad están deshabilitadas en modo mock
- Asegurar que las rutas mock estén protegidas o removidas en producción