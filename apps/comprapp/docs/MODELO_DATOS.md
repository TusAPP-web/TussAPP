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

## 2. Identidades y espacios de consumo

### Firebase Authentication
Firebase Auth identifica a la persona mediante uid. El perfil funcional se almacena separado de los proveedores de autenticación.

### users/{uid}
Perfil mínimo de usuario:
- displayName
- email (si corresponde; preferir el dato de Auth cuando sea suficiente)
- countryCode
- locale
- createdAt
- updatedAt
- status

No almacenar contraseñas ni tokens de sesión en Firestore.

### spaces/{spaceId}
Espacio de compras/economía. Este concepto permite que la modalidad individual y la familiar compartan el mismo modelo:
- ownerUid
- name
- mode: individual o family
- countryCode
- currencyCode
- planSnapshot (solo lectura del cliente; la fuente autoritativa de plan se valida en backend)
- createdAt, updatedAt, status

### spaces/{spaceId}/members/{uid}
- role: owner, admin, member, viewer
- status: invited, active, disabled
- joinedAt
- permissions (solo si se define una matriz de permisos explícita)

La posibilidad de invitar miembros y el límite por plan quedan sujetos a la decisión FREE/PRO y al alcance familiar.

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

### spaces/{spaceId}/merchantLinks/{linkId}
- merchantId
- rubricId
- branchIds[] (si se decide selección de sucursal)
- status
- createdAt, updatedAt

FREE permite un comercio por rubro; PRO permite hasta tres, según decisión funcional existente. Una Cloud Function debe comprobar el plan y realizar reemplazos de forma atómica. El cliente no puede saltarse el límite escribiendo directamente.

## 6. Listas y favoritos

### spaces/{spaceId}/shoppingLists/{listId}
Cabecera de lista:
- name
- status: active, archived
- createdByUid
- createdAt, updatedAt

### spaces/{spaceId}/shoppingLists/{listId}/items/{itemId}
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

### spaces/{spaceId}/favorites/{variantId}
- variantId
- createdAt
- createdByUid

Se guardan referencias a variantes, no duplicados de los productos. Si se decide que favoritos sean por familia de producto en vez de variante, se ajustará antes de implementarlos.

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

## 8. Fuentes e importaciones

### priceSourceConfigs/{sourceId} (solo backend/admin)
Configuración de adaptadores, alcance geográfico, frecuencia, licencias y estado. Las claves privadas viven en Secret Manager o configuración segura de Functions, nunca en documentos accesibles al cliente.

Las importaciones deben registrar procedencia, fecha de observación y unidad/currency. No tratar una lista importada como precio actual sin validar fecha y cobertura.

## 9. Seguridad por límites

- users: el usuario solo lee/actualiza su perfil permitido.
- spaces: solo miembros activos; roles limitan escritura.
- catalog*: lectura pública o autenticada según decisión; escritura solo por moderación/backend.
- merchants: datos públicos publicados separados de datos administrativos privados.
- offers: solo miembros autorizados del comercio pueden crear borradores/editar; publicación validada por backend.
- priceHistory: solo backend escribe; lectura filtrada a precios publicables.
- merchantLinks: miembros del espacio leen; cambios de límites pasan por Cloud Function.
- shoppingLists y favorites: miembros del espacio con permiso correspondiente.
- billingAccounts y priceSourceConfigs: no accesibles directamente desde cliente.

Las reglas concretas de Firestore deben escribirse y probarse con Firebase Emulator antes de datos reales. Este documento no sustituye las reglas.

## 10. Índices y consultas a diseñar

Índices compuestos previsibles:
- ofertas por variantId + branchId + status
- ofertas por rubricId + status + updatedAt
- sucursales por zoneId + status
- listas por status + updatedAt
- historial por offerId + observedAt

La búsqueda textual/geográfica puede requerir un servicio de búsqueda específico; Firestore no debe asumirse como motor de búsqueda de texto completo.

## 11. Decisiones que siguen abiertas

1. Espacio individual o familiar como experiencia inicial; el modelo soporta ambos.
2. Favoritos por producto/familia o por variante exacta.
3. Si una lista pertenece a un usuario o a un espacio compartido.
4. Roles y permisos exactos para miembros familiares.
5. Taxonomía de rubros y categorías por país.
6. Selección de sucursales y alcance de precios por zona.
7. Política de conflictos offline y sincronización por entidad.
8. Retención y granularidad del historial de precios.
9. Fuente maestra y proceso de moderación del catálogo.
10. Proveedor de búsqueda y geolocalización.
11. Modelo final de planes, período de prueba y titularidad de suscripción.

## 12. Orden de implementación después de aprobar el modelo

1. Crear proyecto Firebase exclusivo de ComprAPP y registrar aplicaciones web.
2. Activar Authentication y definir proveedores.
3. Crear estructura Firestore y reglas iniciales deny-by-default.
4. Configurar Firebase Emulator y pruebas automatizadas de reglas.
5. Implementar catálogo de prueba y moderación controlada.
6. Implementar espacios, miembros, listas y favoritos.
7. Implementar comercios, ofertas y publicación de precios.
8. Implementar Functions para operaciones privilegiadas, límites y sincronización.
9. Conectar módulos PWA de a uno, con pruebas funcionales y offline.

**No crear todavía colecciones ni cargar datos reales hasta aprobar el modelo y configurar el proyecto propio.**
