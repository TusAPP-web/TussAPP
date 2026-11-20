# ComprAPP — Modelo de datos propuesto

Estado: **BORRADOR DE ARQUITECTURA — NO IMPLEMENTADO**
Backend previsto: Firebase Authentication + Cloud Firestore + Cloud Functions + Cloud Storage.

Este documento define una primera estructura lógica para revisar antes de crear el proyecto Firebase. No representa colecciones ya existentes ni autoriza a guardar datos reales.

## 1. Principios

1. Separar catálogo maestro, comercios y espacios privados de consumidores.
2. Usar IDs estables e inmutables para productos y variantes. El nombre visible puede cambiar; la identidad no.
3. Un comercio publica ofertas/precios asociados a variantes del catálogo. No crea copias independientes del producto maestro.
4. El cliente nunca decide por sí solo si una cuenta es FREE o PRO. Los límites se validan en backend.
5. Denegar por defecto. Cada lectura y escritura debe validar identidad, pertenencia y rol.
6. Los datos que deban sobrevivir sin conexión se mantienen en IndexedDB y se sincronizan con una cola explícita.
7. No guardar secretos de APIs, pagos ni credenciales de proveedores en el cliente.

## 2. Identidades y cuentas de ComprAPP

### Firebase Authentication
Firebase Auth identifica a cada persona mediante uid. La identidad de acceso es individual, aunque una cuenta/espacio PRO pueda admitir varios miembros. El perfil funcional se almacena separado de los proveedores de autenticación.

### users/{uid}
Perfil mínimo de cada persona:
- displayName
- email (si corresponde; preferir el dato de Auth cuando sea suficiente)
- countryCode
- locale
- createdAt
- updatedAt
- status

No almacenar contraseñas ni tokens de sesión en Firestore.

### comprappAccounts/{accountId}
Cuenta propietaria de los datos de ComprAPP. Los datos persistentes pertenecen a esta cuenta en la nube; IndexedDB conserva una copia local para uso offline y sincronización.
- ownerUid
- name
- countryCode
- currencyCode
- planId (la fuente autoritativa del plan se valida en backend)
- createdAt, updatedAt, status

Regla funcional ya definida: FREE admite un único usuario por cuenta. PRO admite múltiples usuarios autorizados en la misma cuenta. No introducir un modo familiar/individual como selector de producto separado sin una decisión previa del usuario.

### comprappAccounts/{accountId}/members/{uid}
- role: owner, admin, member, viewer
- status: invited, active, disabled
- joinedAt
- permissions (solo si se define una matriz de permisos explícita)

El backend debe validar la pertenencia y los límites de usuarios según el plan antes de aceptar invitaciones o cambios de miembros.

## 3. Catálogo maestro

### catalogCategories/{categoryId}
Taxonomía internacional con extensiones por país:
- name / traducciones
- parentId
- countryScope (global o códigos de país)
- status
- sortOrder

### catalogProducts/{productId}
Identidad de la familia de producto:
- canonicalName
- brandId (opcional)
- categoryId
- status: draft, active, deprecated
- createdAt, updatedAt
- sourceRefs[] (procedencia y licencia, no copiar datos sin revisar derechos)

### catalogVariants/{variantId}
Identidad exacta de la variante comercial:
- productId
- brandLabel
- variantLabel (sabor, modelo, tipo, etc.)
- netContent
- contentUnit (g, kg, ml, l, unidad, etc.)
- packCount
- barcode (opcional; nunca inventar)
- comparisonGroupId (para equivalencias, no para identidad exacta)
- status
- createdAt, updatedAt

Los campos de contenido y presentación permiten calcular precio por unidad comparable. Las equivalencias no deben confundirse con coincidencias exactas.

### catalogSubmissions/{submissionId}
Solicitudes de alta/corrección de producto o variante:
- submittedByUid
- proposedData
- evidenceRefs[]
- status: pending, approved, rejected
- reviewedBy, reviewedAt

Solo procesos autorizados publican en el catálogo maestro.

## 4. Comercios y ofertas

### merchants/{merchantId}
Entidad comercial:
- legalName / displayName
- countryCode
- ownerUid
- status
- createdAt, updatedAt

### merchants/{merchantId}/members/{uid}
Rol dentro del comercio: propietario, administrador, operador u otro rol que se defina. Las altas y permisos se validan en backend.

### merchants/{merchantId}/branches/{branchId}
Sucursal/localidad:
- name
- address
- geoPoint (si se habilita búsqueda por proximidad)
- zoneId
- status

### merchants/{merchantId}/offers/{offerId}
Oferta de una variante del catálogo en una sucursal:
- variantId
- branchId
- rubricId
- priceAmount
- currencyCode
- unitPriceAmount (calculado/validado por backend cuando corresponda)
- availability
- validFrom, validUntil
- publishedAt, updatedAt
- status: draft, published, paused, expired

La oferta es el estado vigente publicado. El historial no se sobrescribe.

### merchants/{merchantId}/priceHistory/{priceEventId}
Registro append-only generado por backend:
- offerId, variantId, branchId
- priceAmount, currencyCode
- observedAt, source
- actorUid o identificador del adaptador de importación

El cliente consumidor puede leer solo los datos publicados permitidos. No puede escribir ni modificar historial.

## 5. Vínculos del consumidor con comercios

### comprappAccounts/{accountId}/merchantLinks/{linkId}
- merchantId
- rubricId
- branchIds[] (si se decide selección de sucursal)
- status
- createdAt, updatedAt

FREE permite un comercio por rubro; PRO permite hasta tres, según decisión funcional existente. Una Cloud Function debe comprobar el plan y realizar reemplazos de forma atómica. El cliente no puede saltarse el límite escribiendo directamente.

## 6. Listas y favoritos

### comprappAccounts/{accountId}/shoppingLists/{listId}
Cabecera de lista:
- name
- status: active, archived
- createdByUid
- createdAt, updatedAt

### comprappAccounts/{accountId}/shoppingLists/{listId}/items/{itemId}
- variantId (opcional mientras se permita artículo manual)
- displayNameSnapshot (para mostrar la lista aunque el catálogo no esté disponible)
- quantity
- unit (opcional)
- purchased
- selectedMerchantId (opcional)
- sortOrder
- createdAt, updatedAt
- clientMutationId (idempotencia/sincronización)

La lista no guarda como verdad un precio permanente. Puede mostrar una cotización consultada, identificada con su fecha y comercio, sin confundirla con el precio vigente.

### comprappAccounts/{accountId}/favorites/{favoriteId}
- targetType (product o variant, para permitir favoritos de producto general o variante específica)
- targetId
- createdAt
- createdByUid

Se guardan referencias al catálogo, no duplicados de los productos. Esta estructura admite marcar como favorito un producto general o una variante exacta sin duplicar sus datos.

## 7. Planes y derechos

### billingAccounts/{accountId} (solo backend)
- ownerUid o spaceId
- planId
- status
- provider
- providerCustomerRef
- currentPeriodStart, currentPeriodEnd
- trialStart, trialEnd

No confiar en planSnapshot enviado por el cliente. Cloud Functions verifica permisos PRO, período gratuito, cantidad de vínculos y límites de miembros.

## 8. Economía personal y presupuestos

La decisión confirmada para FREE es permitir múltiples ingresos dentro de una cuenta. Los siguientes registros se proponen como datos privados de la cuenta; el alcance exacto de saldos, transferencias y reglas presupuestarias todavía debe definirse.

### comprappAccounts/{accountId}/incomeSources/{incomeId}
- name
- amount
- currencyCode
- frequency (único, semanal, quincenal, mensual u otra periodicidad definida)
- effectiveFrom, effectiveUntil (opcionales)
- createdAt, updatedAt
- status

Permite registrar más de una fuente de ingreso en FREE, sin convertir cada ingreso en una cuenta de usuario separada.

### comprappAccounts/{accountId}/expenses/{expenseId}
- description
- amount
- currencyCode
- categoryId
- occurredAt
- source (manual u otra fuente autorizada)
- createdAt, updatedAt

La clasificación y el alcance final de gastos quedan pendientes de definición funcional.

### comprappAccounts/{accountId}/budgets/{budgetId}
- name
- amountLimit
- currencyCode
- period (a definir)
- categoryIds[] (opcional)
- startDate, endDate
- status
- createdAt, updatedAt

La lógica de alertas, acumulación, presupuestos compartidos y reglas de cálculo no se debe implementar hasta cerrar su alcance.

### Cuentas, saldos y transferencias
Se había planteado incorporar cuentas/saldos y transferencias internas, pero el alcance exacto no está cerrado. No se debe asumir todavía un modelo contable ni crear entidades de movimientos/transferencias hasta definir si representan efectivo, cuentas bancarias, billeteras u otra cosa.

## 9. Fuentes e importaciones

### priceSourceConfigs/{sourceId} (solo backend/admin)
Configuración de adaptadores, alcance geográfico, frecuencia, licencias y estado. Las claves privadas viven en Secret Manager o configuración segura de Functions, nunca en documentos accesibles al cliente.

Las importaciones deben registrar procedencia, fecha de observación y unidad/currency. No tratar una lista importada como precio actual sin validar fecha y cobertura.

### priceImportRuns/{runId} (solo backend/admin)
Registro de cada proceso de importación:
- sourceId
- merchantId (si corresponde)
- startedAt, completedAt
- status
- recordsRead, recordsAccepted, recordsRejected
- errorSummary
- sourceFileRef (referencia segura al archivo, no credenciales)

Permite auditar de dónde y cuándo se incorporaron precios. El detalle de retención y almacenamiento de archivos queda pendiente.

## 10. Enlaces QR y NFC

Se prevé que un QR o etiqueta NFC dirija a un comercio, sucursal o catálogo mediante un enlace web/deep link. No se necesita duplicar el catálogo en el QR/NFC: el identificador o slug debe resolver al destino publicado.

### merchantLinksPublic/{publicLinkId} (solo backend/admin)
- merchantId
- branchId (opcional)
- rubricId (opcional)
- destinationType
- destinationId
- status
- createdAt

Esta estructura es una propuesta para resolver enlaces públicos. El formato final de URL, redirección a PWA o web y administración de enlaces sigue pendiente. No guardar información privada ni permisos en el identificador público.

## 11. Seguridad por límites

- users: el usuario solo lee/actualiza su perfil permitido.
- comprappAccounts: solo miembros activos; FREE admite un usuario y PRO varios; roles limitan escritura.
- catalog*: lectura pública o autenticada según decisión; escritura solo por moderación/backend.
- merchants: datos públicos publicados separados de datos administrativos privados.
- offers: solo miembros autorizados del comercio pueden crear borradores/editar; publicación validada por backend.
- priceHistory: solo backend escribe; lectura filtrada a precios publicables.
- merchantLinks: miembros de la cuenta leen; cambios de límites pasan por Cloud Function.
- shoppingLists y favorites: miembros de la cuenta con permiso correspondiente.
- billingAccounts y priceSourceConfigs: no accesibles directamente desde cliente.

Las reglas concretas de Firestore deben escribirse y probarse con Firebase Emulator antes de datos reales. Este documento no sustituye las reglas.

## 12. Índices y consultas a diseñar

Índices compuestos previsibles:
- ofertas por variantId + branchId + status
- ofertas por rubricId + status + updatedAt
- sucursales por zoneId + status
- listas por status + updatedAt
- historial por offerId + observedAt
- gastos por occurredAt + categoryId
- ingresos por status + effectiveFrom
- presupuestos por status + startDate

La búsqueda textual/geográfica puede requerir un servicio de búsqueda específico; Firestore no debe asumirse como motor de búsqueda de texto completo.

## 13. Decisiones que siguen abiertas

1. Matriz detallada de roles y permisos para usuarios PRO de una misma cuenta.
2. Taxonomía de rubros y categorías por país.
3. Selección de sucursales y alcance de precios por zona.
4. Política de conflictos offline y sincronización por entidad.
5. Retención y granularidad del historial de precios.
6. Fuente maestra y proceso de moderación del catálogo.
7. Proveedor de búsqueda y geolocalización.
8. Modelo de titularidad de suscripción, duración del período PRO gratuito y pagos por mercado.
9. Alcance y reglas de ingresos, gastos y presupuestos.
10. Definición funcional de cuentas/saldos/transferencias antes de modelarlas.
11. Formato de deep links y administración de destinos QR/NFC.
12. Reglas de listas habituales: duplicación, archivado, plantillas y uso compartido.

## 14. Orden de implementación después de aprobar el modelo

1. Crear proyecto Firebase exclusivo de ComprAPP y registrar aplicaciones web.
2. Activar Authentication y definir proveedores.
3. Crear estructura Firestore y reglas iniciales deny-by-default.
4. Configurar Firebase Emulator y pruebas automatizadas de reglas.
5. Implementar catálogo de prueba y moderación controlada.
6. Implementar cuentas ComprAPP, miembros PRO, listas y favoritos.
7. Implementar comercios, ofertas y publicación de precios.
8. Implementar Functions para operaciones privilegiadas, límites y sincronización.
9. Conectar módulos PWA de a uno, con pruebas funcionales y offline.

**No crear todavía colecciones ni cargar datos reales hasta aprobar el modelo y configurar el proyecto propio.**


## 15. Revisión de cobertura contra decisiones funcionales

Esta revisión incorpora entidades que faltaban en el primer borrador para representar decisiones ya documentadas y separa las funciones cuyo alcance todavía no está cerrado.

| Decisión o capacidad | Cobertura en este modelo | Estado |
| --- | --- | --- |
| FREE con un usuario y múltiples ingresos | `comprappAccounts`, `members`, `incomeSources` | Estructura propuesta; reglas por probar |
| PRO multiusuario | `members` | Estructura propuesta; roles detallados pendientes |
| Catálogo maestro e IDs estables | `catalogProducts`, `catalogVariants`, `catalogCategories` | Estructura propuesta |
| Moderación de productos nuevos | `catalogSubmissions` | Flujo operativo pendiente |
| Catálogos comerciales por rubro | `offers.rubricId` y sucursales | Estructura parcial; taxonomía pendiente |
| Uno o hasta tres comercios por rubro | `merchantLinks` + validación backend | Requiere Cloud Function y pruebas |
| Precio actual e historial | `offers`, `priceHistory` | Estructura propuesta |
| Precios offline identificados como últimos conocidos | caché local y metadatos de observación | Falta definir contrato de sincronización y presentación |
| Listas y artículos asociados al catálogo | `shoppingLists`, `items.variantId` | Estructura propuesta; integración pendiente |
| Favoritos de producto o variante | `favorites.targetType/targetId` | Estructura propuesta |
| Ingresos múltiples FREE | `incomeSources` | Incorporado en esta revisión |
| Gastos y presupuestos | `expenses`, `budgets` | Estructura preliminar; alcance pendiente |
| Cuentas, saldos y transferencias | No se crean colecciones todavía | Decisión de alcance pendiente |
| QR/NFC a comercio, sucursal o catálogo | `merchantLinksPublic` | Propuesta; formato de enlaces pendiente |
| Comparación exacta/equivalente y precio unitario | variantes, grupos de comparación y ofertas | Requiere lógica de comparación; no es una colección independiente |
| Sugerencias inteligentes PRO | Historial/listas como datos de entrada | Algoritmo y reglas pendientes; requiere confirmación del usuario |
| Pagos y titularidad PRO | `billingAccounts` | Modelo de alto nivel; proveedor y titularidad pendientes |

La tabla no declara implementadas estas funciones. Indica únicamente si el diseño de datos contempla su representación.