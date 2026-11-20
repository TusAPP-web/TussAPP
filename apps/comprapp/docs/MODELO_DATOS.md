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

## 16. Relaciones e integridad referencial

Esta sección completa el borrador lógico. Las reglas indicadas son propuestas técnicas para validar antes de implementarlas; no crean todavía colecciones ni decisiones funcionales nuevas.

### 16.1 Cuenta, propietario y miembros

- Cada `comprappAccounts/{accountId}` debe tener un `ownerUid` válido.
- El propietario también debe tener un documento de membresía activo en `members/{uid}`, con rol `owner`. Así, las comprobaciones de acceso utilizan una única relación de membresía.
- No se debe permitir eliminar o deshabilitar la membresía del propietario mientras la cuenta siga activa. Un eventual cambio de propietario requiere una operación privilegiada y atómica.
- El uid del documento `members/{uid}` debe coincidir con la identidad autenticada; el cliente no puede crear membresías para otros usuarios.
- Una invitación PRO debe tener un estado pendiente y no concede acceso hasta que el destinatario la acepte mediante un flujo validado por backend.
- Deshabilitar o revocar una membresía debe bloquear el acceso posterior, aunque el usuario conserve datos locales en IndexedDB.
- La regla FREE de un único usuario y la admisión de varios miembros en PRO se verifican en backend. No se deducen de la cantidad de documentos visibles en el cliente.

**Pendiente:** definir la matriz final de roles y permisos PRO y el flujo de invitación/aceptación. Los roles `owner/admin/member/viewer` son nombres preliminares, no una matriz aprobada.

### 16.2 Comercio, sucursales y personal

- Cada sucursal debe pertenecer a un único comercio; su ubicación lógica bajo `merchants/{merchantId}/branches/{branchId}` expresa esa pertenencia.
- Cada miembro del comercio debe estar asociado al comercio correspondiente y tener una membresía activa antes de administrar sucursales u ofertas.
- El `merchantId` de una oferta se deriva de su ruta; cualquier referencia redundante debe coincidir con esa ruta.
- El `branchId` de una oferta debe identificar una sucursal hija del mismo comercio. No aceptar una sucursal de otro comercio.
- El `rubricId` de una oferta debe corresponder a un rubro permitido para ese comercio y a la taxonomía vigente. La taxonomía inicial sigue pendiente.
- Una sucursal desactivada no debe recibir nuevas ofertas publicadas. Las ofertas históricas deben conservarse para trazabilidad.

### 16.3 Ofertas, variantes e historial

- Toda oferta publicada debe referenciar una variante existente y activa del catálogo.
- La sucursal referenciada debe pertenecer al comercio propietario de la oferta.
- `currencyCode` debe ser un código de moneda válido y coherente con el mercado configurado; no mezclar monedas en sumas ni comparaciones sin conversión explícita.
- `priceAmount` debe ser numérico, finito y no negativo. La validación de precisión/escala debe definirse por moneda en backend.
- `unitPriceAmount` es un dato derivado: debe calcularse o validarse en backend a partir del precio y contenido de la variante. El cliente no es autoridad para publicarlo.
- Al publicar o cambiar una oferta, el backend registra un evento de historial asociado a esa oferta, variante, sucursal y comercio.
- `priceHistory` es append-only para clientes y operadores. Correcciones administrativas deben generar un nuevo evento de corrección/auditoría, no reescribir silenciosamente el pasado.
- Una oferta pausada, vencida o retirada no se borra si ya tiene historial asociado. Su estado cambia y el historial permanece.
- Las referencias a catálogo, comercio y sucursal deben validarse al escribir; Firestore no aplica claves foráneas automáticamente.

### 16.4 Listas, artículos y favoritos

- Cada lista y cada artículo pertenecen a una cuenta; la ruta anidada debe ser la autoridad para determinar el `accountId`.
- Si un artículo contiene `variantId`, debe apuntar a una variante existente. Si se permite artículo manual, debe quedar claro que no tiene identidad de catálogo y no debe inventarse un `variantId`.
- `displayNameSnapshot` conserva el texto que el usuario veía al agregar el artículo; no reemplaza la referencia de catálogo.
- `selectedMerchantId` debe corresponder a un comercio vinculado a esa cuenta para el rubro aplicable, si se mantiene esa selección en el artículo.
- Un favorito debe apuntar a un producto o variante existente según `targetType`; la validación debe comprobar que el tipo y el documento destino coincidan.
- El borrado o desactivación de un producto no debe romper listas históricas: conservar el snapshot y resolver la referencia como retirada/no disponible.
- `clientMutationId` debe ser único dentro del ámbito definido para cada operación sincronizada. El ámbito exacto (por cuenta, dispositivo o entidad) se debe fijar en el contrato de sincronización.

### 16.5 Ingresos, gastos y presupuestos

- Los registros económicos pertenecen a la cuenta, no directamente al uid que los creó.
- `createdByUid` (a incorporar si se requiere auditoría) debe corresponder a un miembro activo autorizado de esa cuenta.
- Los importes deben tener moneda explícita. No sumar importes de monedas distintas sin una regla de conversión y fecha de cotización definidas.
- Un gasto con `categoryId` debe referenciar una categoría válida para el mercado/cuenta.
- Los presupuestos deben tener un período y un rango de fechas coherentes; la regla de inclusión de gastos y el tratamiento de gastos compartidos siguen pendientes.
- No inferir cuentas bancarias, efectivo, billeteras ni transferencias a partir de `incomeSources` o `expenses`. Ese modelo continúa sin aprobar.

## 17. Permisos y operaciones privilegiadas

La matriz siguiente es una orientación de seguridad para diseñar reglas y Cloud Functions. No reemplaza la matriz de roles PRO pendiente.

| Recurso/operación | Cliente consumidor | Miembro de cuenta | Backend/proceso autorizado |
| --- | --- | --- | --- |
| Perfil propio | Leer y editar campos permitidos | No aplica | Validar identidad |
| Cuenta y miembros | Sin acceso a membresías ajenas | Leer datos permitidos de su cuenta | Crear cuenta, invitar, aceptar, revocar y cambiar propietario |
| Catálogo maestro | Lectura según política de publicación | Igual | Crear, revisar, aprobar, retirar |
| Comercios/sucursales | Leer datos públicos publicados | No concede administración del comercio | Gestionar altas y estados |
| Ofertas | Leer ofertas publicadas | No concede permiso comercial por sí solo | Validar publicaciones; el personal autorizado del comercio opera mediante backend |
| Historial de precios | Leer eventos publicables | No escribir ni editar | Append-only y correcciones auditadas |
| Vínculos de comercios | Leer sus vínculos | Solicitar alta/reemplazo/eliminación | Verificar plan y aplicar cambios atómicos |
| Listas/favoritos/economía | No acceder a otras cuentas | Acceso según rol y permiso aprobado | Validar pertenencia y operaciones restringidas |
| Facturación/fuentes/importaciones | Sin acceso administrativo directo | Sin acceso administrativo directo | Backend/admin solamente |
| Enlaces públicos QR/NFC | Resolver solo destinos publicados | Administrar mediante flujo autorizado | Crear, cambiar o revocar destinos |

**Regla de diseño:** las reglas Firestore deben denegar por defecto. No permitir que el cliente escriba directamente campos autoritativos como `planId`, `ownerUid`, roles, estado de aprobación, precio validado, historial, contadores de cupos o resultados de importación.

Las operaciones que cambian límites o varias relaciones deben pasar por Cloud Functions/capa backend autenticada. La función debe volver a comprobar identidad, membresía, rol, plan y estado de los documentos dentro de la misma operación transaccional cuando corresponda.

## 18. Operaciones atómicas y concurrencia

### 18.1 Reemplazo de comercio por rubro

El reemplazo debe ser una operación de backend, no una secuencia de escrituras independientes del cliente:

1. Leer la membresía activa de la cuenta y el plan autoritativo.
2. Leer los vínculos activos del rubro solicitado.
3. Verificar el límite: uno en FREE o hasta tres en PRO.
4. Si se reemplaza, identificar exactamente el vínculo que sale y comprobar que la confirmación del usuario corresponde a ese vínculo.
5. En una transacción, desactivar/eliminar el vínculo anterior y crear el nuevo, afectando solo ese rubro.
6. Si cualquier validación falla, no modificar ningún vínculo.

Se debe evitar que dos solicitudes simultáneas superen el límite. La transacción debe leer y escribir el conjunto de documentos que determina el cupo. El identificador de vínculo y la estrategia de unicidad por cuenta/comercio/rubro deben definirse antes de implementar.

### 18.2 Otras operaciones

- Aceptar una invitación y consumir un cupo PRO debe ser atómico.
- Cambiar propietario debe actualizar la cuenta y las membresías relacionadas en una operación privilegiada.
- Publicar una oferta y registrar su evento de historial debe evitar estados parciales.
- Procesar una mutación offline debe reconocer su `clientMutationId` para no duplicar efectos al reintentar.
- Las operaciones con varios documentos deben respetar los límites de transacciones/lotes de Firestore; si el volumen supera esos límites, diseñar un proceso por etapas con estado y recuperación.

## 19. Consultas, índices y límites de Firestore

Las consultas siguientes son casos de uso previstos, no índices ya creados ni consultas probadas:

| Caso de uso | Filtros/orden esperados | Consideraciones |
| --- | --- | --- |
| Productos por zona/categoría | estado activo, alcance de país/zona, categoría | Definir cómo se materializa la disponibilidad geográfica; no asumir joins |
| Ofertas de una variante en sucursales cercanas | variantId, estado publicado, sucursales de zona | Geobúsqueda no nativa; definir proveedor/estrategia |
| Catálogo de un comercio por rubro | rubricId, estado publicado, categoría/variante | Puede requerir paginación e índices compuestos |
| Ofertas para comparar por rubro | rubro, sucursal/zona, vigencia, moneda | La comparación debe normalizar unidad y moneda antes de ordenar |
| Historial de una oferta | offerId y observedAt descendente | Paginación; política de retención pendiente |
| Vínculos de una cuenta | rubricId y estado activo | Lectura para mostrar cupos; la validación definitiva ocurre en backend |
| Listas de una cuenta | status y updatedAt descendente | Paginación si crece el historial |
| Artículos de una lista | sortOrder | La ruta ya acota la lista; evitar duplicar filtros innecesarios |
| Favoritos de una cuenta | createdAt descendente o targetType | Definir orden de presentación |
| Ingresos/gastos | fechas, estado y categoría | Definir reportes y períodos antes de fijar índices definitivos |
| Presupuestos activos | status y rango de fechas | Reglas de período y acumulación pendientes |

### Límites que deben contemplarse

- Firestore no ofrece búsqueda de texto completo ni joins relacionales generales.
- No se debe asumir que filtrar por proximidad geográfica se resuelve con una consulta Firestore simple.
- Las consultas deben paginar; no cargar colecciones completas para filtrar en el cliente.
- Los índices compuestos se crearán a partir de consultas reales y errores de índice documentados, no por anticipación indiscriminada.
- La disponibilidad de una oferta debe evaluarse con fechas/estado en servidor y mostrarse con su fecha de observación.
- Las consultas públicas deben exponer solo campos de catálogo/comercio/oferta aprobados, nunca documentos administrativos privados.

## 20. Decisiones técnicas pendientes antes de aprobar

1. Definir si cada propietario tendrá siempre un documento `members/{uid}` con rol `owner` (recomendación de este borrador: sí).
2. Aprobar roles y permisos PRO y del personal de comercios.
3. Definir IDs determinísticos o mecanismo de unicidad para vínculos por cuenta/comercio/rubro.
4. Definir flujo de invitaciones, aceptación, revocación y cambio de propietario.
5. Definir cómo se representa zona y proximidad y qué servicio geográfico se utilizará.
6. Definir moneda/precisión, conversión y comparación de importes.
7. Definir alcance de auditoría para cambios de ofertas, miembros y datos económicos.
8. Definir idempotencia, ámbito de `clientMutationId`, resolución de conflictos y orden de sincronización.
9. Definir eliminación lógica, retención y tratamiento de referencias a productos/comercios desactivados.
10. Validar consultas reales y generar únicamente los índices compuestos necesarios.

**Estado de esta revisión:** relaciones, permisos, integridad y consultas fueron analizados y documentados como propuestas. El modelo todavía no está aprobado; las decisiones enumeradas deben cerrarse antes de crear Firebase.


## 21. Propuesta de roles y permisos PRO — pendiente de aprobación

Esta matriz desarrolla la decisión funcional ya tomada de que PRO admite varios usuarios autorizados dentro de una misma cuenta. Los nombres y permisos siguientes son una propuesta técnica para revisión; **no deben tratarse como decisión confirmada ni implementarse hasta su aprobación**.

### 21.1 Roles propuestos dentro de una cuenta ComprAPP

| Capacidad | owner | admin | member | viewer |
| --- | --- | --- | --- | --- |
| Ver datos generales de la cuenta | Sí | Sí | Sí | Sí |
| Ver y editar listas de compras | Sí | Sí | Sí | Solo lectura |
| Ver y administrar favoritos | Sí | Sí | Sí | Solo lectura |
| Ver comercios vinculados | Sí | Sí | Sí | Sí |
| Agregar/quitar/reemplazar vínculos de comercios | Sí | Sí | Sí, sujeto al plan | No |
| Ver ingresos, gastos y presupuestos | Sí | Sí | Según permiso económico | Según permiso económico |
| Crear/editar registros económicos | Sí | Sí | Según permiso económico | No |
| Invitar miembros | Sí | Sí, limitado | No | No |
| Cambiar roles de miembros | Sí | Limitado a roles no privilegiados | No | No |
| Deshabilitar miembros | Sí | Limitado a miembros no privilegiados | No | No |
| Cambiar propietario | Sí, mediante proceso especial | No | No | No |
| Gestionar plan, facturación y titularidad de pago | Sí | No | No | No |
| Eliminar/cerrar la cuenta | Sí, con confirmación reforzada | No | No | No |

**Interpretación propuesta:**

- `owner`: titular responsable de la cuenta; conserva control total y es el único que puede transferir titularidad, gestionar facturación y cerrar la cuenta.
- `admin`: ayuda a administrar la cuenta y sus miembros, pero no puede transferir propiedad, cambiar facturación ni eliminar la cuenta. No puede asignar el rol owner ni elevarse a sí mismo.
- `member`: participa en las tareas cotidianas de compras. Sus permisos económicos deben depender de una autorización explícita.
- `viewer`: consulta la información que la cuenta le permita ver, sin crear, editar ni eliminar registros.

### 21.2 Protección de información económica

No se debe asumir que todo miembro PRO puede ver ingresos, gastos y presupuestos solo por pertenecer a la cuenta. Se propone un permiso independiente, por ejemplo:

- `economy.read`: consultar ingresos, gastos y presupuestos.
- `economy.write`: crear y modificar registros económicos.
- `economy.manage`: administrar categorías, presupuestos y configuraciones económicas, si ese alcance se aprueba.

El propietario conserva acceso completo. Para los demás miembros, el propietario asignaría explícitamente estos permisos. Un permiso de escritura no debe implicar automáticamente permiso para administrar miembros, facturación o titularidad.

**Decisión pendiente:** confirmar si la economía se comparte con todos los miembros por defecto o si siempre requiere autorización individual. Recomendación: acceso económico explícito, no automático.

### 21.3 Separación entre roles de cuenta y roles de comercio

Los roles `owner/admin/member/viewer` de una cuenta ComprAPP no otorgan derechos administrativos sobre un comercio vinculado.

La administración del comercio se controla en su propio ámbito, mediante la membresía `merchants/{merchantId}/members/{uid}`. Se propone distinguir:

- propietario del comercio: controla la entidad comercial y puede administrar sus miembros;
- administrador del comercio: administra sucursales, rubros y ofertas según permisos asignados;
- operador: carga o actualiza ofertas/precios permitidos, sin controlar titularidad ni facturación;
- consulta: puede ver información interna autorizada, sin modificarla.

Los nombres son preliminares. Los permisos del personal comercial deben definirse por separado y no heredarse de la cuenta consumidora.

### 21.4 Reglas de seguridad obligatorias para cualquier matriz aprobada

1. La autorización se comprueba en backend/reglas usando el uid autenticado y la membresía vigente; nunca se acepta un rol enviado por el cliente como autoridad.
2. El cliente no puede crear su propia membresía, cambiar su rol ni otorgarse permisos.
3. Solo el propietario puede transferir titularidad y gestionar la facturación.
4. Un administrador no puede asignar roles superiores al suyo ni alterar al propietario.
5. Revocar o deshabilitar una membresía debe impedir nuevas lecturas/escrituras en nube desde ese momento.
6. Las operaciones privilegiadas deben validar la membresía y el estado de la cuenta dentro de la operación; no confiar en permisos cacheados indefinidamente.
7. El acceso económico se evalúa de forma independiente si se aprueba el permiso granular.
8. La pertenencia a una cuenta no concede acceso a otras cuentas ni a datos privados de comercios.

### 21.5 Decisiones que requieren confirmación

1. Aprobar, cambiar o descartar los cuatro roles propuestos.
2. Confirmar si los miembros `member` pueden editar listas compartidas o si debe existir una lista personal y otra compartida.
3. Confirmar si el acceso a economía es siempre explícito por miembro.
4. Definir si `admin` puede invitar y deshabilitar miembros, y qué roles puede administrar.
5. Definir si el propietario puede cerrar la cuenta inmediatamente o si se requiere un período de recuperación.
6. Aprobar por separado los roles del personal de comercios.

**Estado:** propuesta documentada para revisión. No es una decisión funcional confirmada, no modifica el comportamiento actual de ComprAPP y no autoriza la creación de Firebase.

