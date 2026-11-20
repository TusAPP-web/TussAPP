# ComprAPP — Resumen general del proyecto

**Documento de continuidad del proyecto**  
**Estado:** diseño funcional avanzado; base técnica inicial; backend todavía no creado.  
**Ubicación exclusiva:** `apps/comprapp/` dentro del repositorio `TusAPP-web/TussAPP`.  
**URL prevista:** https://tusapp-web.github.io/TussAPP/apps/comprapp/

> Este documento consolida decisiones previas, estado real del repositorio y tareas pendientes. Distingue lo decidido de lo propuesto y de lo que aún no fue implementado. No considerar una función terminada solo porque exista una pantalla o un documento.

---

## 1. Visión y objetivo

ComprAPP es una aplicación de la familia TusAPP para administrar la economía del hogar y organizar compras. Debe permitir crear listas, consultar productos de la zona, vincular comercios por rubro, comparar precios y, progresivamente, administrar presupuestos y otros aspectos de la economía familiar.

La aplicación se proyecta para uso internacional, con país, moneda, categorías y fuentes adaptables por región. Debe ser mobile-first, adaptable a escritorio y móvil, e instalable como PWA.

El objetivo no es una simple lista de supermercado: debe convertirse en una herramienta de compras y economía conectada a un catálogo compartido, comercios y precios.

## 2. Modelo de planes y usuarios

### FREE
- Una cuenta con un único usuario.
- Permite registrar múltiples ingresos.
- Permite vincular un comercio por rubro.
- Si se vincula otro comercio para el mismo rubro, debe advertir qué vínculo reemplazará. Si se cancela, no debe cambiar nada.
- La sustitución afecta solo al rubro elegido.

### PRO
- Una cuenta puede admitir varios usuarios autorizados.
- Permite vincular hasta tres comercios por rubro.
- Incluye funciones inteligentes basadas en el historial.
- El indicador de conexión/sincronización está previsto como función PRO.
- Las sugerencias inteligentes requieren confirmación antes de agregarse a la lista.

### Período de lanzamiento
Se decidió lanzar inicialmente con funciones PRO habilitadas gratuitamente durante un período. La duración todavía está pendiente.

### Reglas importantes
- Los límites FREE/PRO deben validarse en backend, no confiar en valores enviados por la aplicación.
- La identidad de cada persona se gestiona mediante autenticación individual; la cuenta ComprAPP es propietaria de los datos.
- FREE admite un usuario por cuenta y PRO admite varios miembros autorizados.
- La matriz exacta de roles y permisos de los miembros PRO todavía debe definirse.

## 3. Catálogo maestro de productos

Se decidió mantener un catálogo maestro compartido internacionalmente, con identificadores propios de TusAPP, estables e inmutables.

### Principios
- El producto no debe duplicarse cada vez que un comercio lo publica.
- Los comercios publican sus precios y disponibilidad asociados a una variante del catálogo maestro.
- Los productos nuevos o las correcciones deben pasar por un proceso de validación/moderación.
- Debe registrarse la procedencia de los datos y respetarse las licencias de textos e imágenes.
- No inventar códigos de barras/EAN cuando no existan.

### Identidad y comparación
Se deben distinguir:
- **Coincidencia exacta:** misma marca, variante y presentación.
- **Producto equivalente:** productos de distintas marcas o presentaciones que pertenecen a una clase comparable.

La comparación equivalente debe considerar unidad comparable (por kilo, litro o unidad), contenido y presentación. La interfaz debe explicar las diferencias; no presentar equivalencias como si fueran productos idénticos.

### Fuentes posibles
Open Food Facts se consideró como fuente potencial de información de productos, no como fuente de precios. Su uso queda sujeto a revisar ODbL, CC BY-SA, atribución y condiciones de reutilización. También se propuso mantener un catálogo propio para poder filtrar por país/zona y evitar resultados irrelevantes.

## 4. Productos, vistas y filtros

El usuario podrá explorar:
1. Todos los productos disponibles en su zona.
2. Productos de sus comercios vinculados.
3. Sus productos favoritos/habituales.

El usuario configura el país al iniciar.

Los filtros jerárquicos zona → categoría → producto → variante se pensaron principalmente para la carga e importación de catálogos de los comercios, con filtros intuitivos para seleccionar rubros, productos y variantes.

Los favoritos deben referenciar elementos del catálogo y no copiar sus datos. El modelo técnico contempla favoritos tanto de un producto general como de una variante exacta.

## 5. Comercios y rubros

- Cada comercio organiza su catálogo por rubros (por ejemplo, almacén, carnicería, verdulería, etc.).
- El consumidor vincula un comercio y selecciona el rubro al que desea asociarlo.
- FREE: un comercio por rubro.
- PRO: hasta tres comercios por rubro.
- Al reemplazar un comercio, la aplicación debe indicar claramente cuál será desvinculado y para qué rubro.
- Cancelar el reemplazo no debe producir ningún cambio.
- El reemplazo debe afectar solo al rubro seleccionado y ejecutarse de forma atómica en backend.
- Debe contemplarse la ubicación/localidad de las sucursales para filtrar por zona y proximidad.

Se planteó que los comercios puedan registrar sus catálogos y conectarse a ComprAPP. El alta de comercios, si será autogestionada o asistida, sigue pendiente.

## 6. Precios y comparación

- Los precios se asocian a la variante exacta, comercio y sucursal.
- Deben guardar moneda, fecha de observación/publicación, disponibilidad y vigencia cuando exista.
- El precio histórico no se debe sobrescribir: se conserva un historial de cambios.
- Los precios offline son los últimos conocidos y deben identificarse como tales; no se deben mostrar como garantía de vigencia.
- Promociones nuevas y envío de pedidos requieren conexión.
- Debe compararse precio total y precio por unidad comparable cuando sea posible.
- La comparación debe mostrar la localidad y permitir considerar la proximidad.
- Si existen tres fuentes/comercios aplicables, se propuso mostrar al menos tres alternativas.

### Fuentes de precios consideradas
- APIs o catálogos públicos.
- Importación de Excel/CSV/JSON.
- Carga manual por el comercio.
- Adaptadores para proveedores o fuentes específicas.
- SEPA/Precios Claros se consideró para Argentina, pero su cobertura efectiva en Panambí/Misiones todavía debe verificarse.

Las credenciales y secretos de integraciones deben permanecer en backend, nunca en el código cliente.

## 7. Lista de compras

La lista debe estar integrada con el catálogo y no limitarse a artículos escritos manualmente.

Se espera que permita:
- Agregar productos del catálogo y, cuando sea necesario, artículos manuales.
- Modificar cantidades.
- Marcar productos como comprados.
- Seleccionar comercio/precio cuando existan datos.
- Comparar el costo estimado por comercio.
- Mantener listas habituales.
- Consultar y trabajar offline con los últimos datos locales.
- Sincronizar cambios cuando vuelva la conexión.

Se había diseñado una vista comparativa compacta: productos en filas y comercios en columnas (hasta tres por rubro), cantidades editables, subtotales y total por comercio. Tocar un precio permite seleccionar ese comercio; tocar el producto abre su detalle y fecha de precio. El ahorro solo debe mostrarse si se puede calcular correctamente.

### Estado actual de la lista
La implementación existente es provisional:
- Una única lista local por navegador/dispositivo.
- Los artículos se cargan manualmente.
- Guarda nombre, cantidad y estado comprado/pendiente.
- Permite agregar, editar, marcar comprado y eliminar.
- Se guarda en IndexedDB.
- No está conectada al catálogo, favoritos, comercios, precios, cuenta en nube ni sincronización.

La apariencia se rediseñó a filas compactas tipo planilla y se cambió el control de guardado explícito para mostrar un mensaje. El usuario señaló que el diseño y el concepto todavía no representan la experiencia final deseada. No considerar resuelta ni aprobada la interfaz de lista. Debe replantearse cuando existan productos, favoritos, comercios y precios reales.

## 8. Economía, presupuestos y otras funciones

Se prevén módulos separados para:
- Mi economía.
- Ingresos y gastos.
- Presupuestos.
- Comparación de precios.
- Favoritos.
- Comercios.
- Catálogo.
- Sincronización.

Se planteó incorporar cuentas/saldos y transferencias internas, pero el alcance exacto todavía no está cerrado.

## 9. QR y NFC

Se propuso que los comercios puedan utilizar códigos QR y etiquetas/tarjetas NFC para que un consumidor abra el comercio o su catálogo desde ComprAPP o desde una página web/landing. El enlace debe funcionar incluso si la aplicación no está instalada.

Esta funcionalidad está en etapa de diseño; no está implementada.

## 10. Arquitectura técnica prevista

### Repositorio y aislamiento
- Repositorio: `TusAPP-web/TussAPP`.
- Carpeta exclusiva: `apps/comprapp/`.
- No modificar archivos raíz de TusAPP ni carpetas de GimAPP, TurnAPP, LubriAPP u otras aplicaciones.
- Cada módulo conserva HTML, CSS y JS propios.
- `app.js` coordina módulos; no debe concentrar lógica de negocio.
- `styles.css` solo agrega imports; no debe convertirse en una hoja monolítica.
- La comunicación entre módulos debe realizarse mediante contratos explícitos.

### Tecnologías previstas
- PWA: HTML, CSS y JavaScript modular.
- Backend previsto: Firebase Authentication, Cloud Firestore, Cloud Storage y Cloud Functions; Scheduler para tareas programadas si se necesita.
- IndexedDB para persistencia local y trabajo offline.
- Service Worker para cachear el shell y recursos estáticos.
- Firebase Emulator para probar reglas de seguridad antes de datos reales.

### Estructura actual del proyecto
```text
apps/comprapp/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── README.md
├── docs/
│   ├── ARQUITECTURA.md
│   ├── DECISIONES_FUNCIONALES.md
│   ├── ESTRUCTURA_MODULAR.md
│   ├── ALMACENAMIENTO_LOCAL.md
│   ├── MODELO_DATOS.md
│   ├── PENDIENTES.md
│   └── RESUMEN_PROYECTO.md
└── src/
    ├── css/
    │   ├── styles.css
    │   └── core/base.css
    └── js/
        ├── app.js
        ├── core/
        │   ├── router.js
        │   └── storage.js
        └── modules/
            ├── home/
            ├── catalog/
            ├── merchants/
            ├── favorites/
            ├── shopping-list/
            ├── comparison/
            ├── economy/
            ├── budget/
            └── sync/
```

Cada módulo tiene o está previsto que tenga sus propios archivos HTML, JS y CSS. La existencia de una carpeta/pantalla no significa que el módulo esté funcional.

## 11. Estado técnico comprobado

### Implementado en el repositorio
- Shell PWA aislado.
- Navegación modular y router.
- Estilos base y hojas separadas por módulo.
- IndexedDB `comprapp-local`, versión 1.
- Almacenes: `preferences`, `shoppingLists`, `favorites`, `catalogCache`, `syncQueue`.
- API local: `getRecord`, `getAllRecords`, `saveRecord`, `deleteRecord`, `clearStore`, `checkLocalStorage`.
- Lista local provisional.
- Resumen de lista en Inicio.
- Service Worker con caché del shell y recursos de ComprAPP.
- Documentación de arquitectura, decisiones, almacenamiento y modelo de datos.

### Verificaciones realizadas anteriormente
- Se verificó sintaxis JavaScript de archivos principales de lista, inicio, almacenamiento y Service Worker en una etapa anterior.
- Se compararon cambios GitHub para confirmar que los trabajos documentados se limitaron a archivos dentro de `apps/comprapp/`.
- No se realizó una prueba integral real de todas las operaciones en navegador y móvil.
- No se confirmó de forma concluyente el despliegue público de GitHub Pages.

### No implementado
- No existe proyecto Firebase exclusivo de ComprAPP.
- No hay Firebase Authentication configurado.
- No hay colecciones Firestore creadas.
- No hay reglas de seguridad Firebase implementadas ni probadas.
- No hay catálogo maestro real ni proceso de moderación operativo.
- No hay comercios, sucursales, ofertas ni precios reales conectados.
- Favoritos no están integrados funcionalmente al catálogo.
- La cola `syncQueue` es solo una estructura: no procesa, envía ni reintenta operaciones.
- No existe sincronización con la nube.
- No hay pagos, QR/NFC, pedidos ni motor de búsqueda integrados.

## 12. Modelo de datos propuesto

El borrador técnico está en `docs/MODELO_DATOS.md`. Propone, entre otras, estas entidades:

- `users/{uid}`: identidad/perfil de persona.
- `comprappAccounts/{accountId}`: cuenta propietaria de los datos.
- `comprappAccounts/{accountId}/members/{uid}`: miembros y roles PRO.
- `catalogCategories`, `catalogProducts`, `catalogVariants`: catálogo maestro.
- `catalogSubmissions`: solicitudes de alta/corrección.
- `merchants`, `branches`, `offers`, `priceHistory`: comercios, sucursales, precios e historial.
- `merchantLinks`: vínculos de cuenta con comercios por rubro.
- `shoppingLists` e `items`: listas y artículos.
- `favorites`: referencias a producto general o variante.
- `billingAccounts`: plan y período, solo backend.
- `priceSourceConfigs`: configuración de fuentes, solo backend/administración.

Es un borrador, no una base creada. Debe revisarse para asegurar que refleja todos los flujos funcionales antes de provisionar Firebase.

## 13. Seguridad y privacidad

- Reglas Firestore deny-by-default.
- Separación entre datos privados de cuentas y datos públicos de comercios.
- Un usuario solo accede a cuentas donde sea miembro activo.
- FREE: una persona por cuenta; PRO: varios usuarios autorizados.
- Los permisos y límites se verifican en backend.
- Solo personal/procesos autorizados pueden aprobar productos maestros.
- Solo miembros autorizados del comercio pueden modificar ofertas.
- Historial de precios escrito por backend y no editable por consumidor.
- Suscripciones, fuentes y secretos de integración no deben quedar expuestos al cliente.
- Reemplazos de comercios por rubro deben ser atómicos.
- Probar reglas con Firebase Emulator antes de guardar información real.

## 14. Pendientes consolidados

### Prioridad 1 — Verificar lo que ya existe
1. Probar IndexedDB en escritorio y móvil: abrir, leer, escribir, editar, borrar y recargar.
2. Probar la lista local completa, incluyendo persistencia después de cerrar y volver a abrir el navegador.
3. Probar el shell PWA y el Service Worker offline después de una primera carga online.
4. Verificar publicación y URL de GitHub Pages.
5. No dar por finalizada la lista provisional ni avanzar suponiendo que todas sus interacciones están verificadas.

### Prioridad 2 — Cerrar el diseño antes del backend
6. Revisar el modelo de datos contra las decisiones y flujos completos ya definidos.
7. Definir matriz de roles/permisos de miembros PRO.
8. Definir política de conflictos offline por entidad, reintentos, idempotencia y resolución de cambios simultáneos.
9. Cerrar taxonomía inicial de rubros y categorías por país.
10. Definir alcance de sucursales, zonas y proximidad.
11. Definir moderación y procedencia del catálogo maestro.
12. Definir retención y granularidad del historial de precios.
13. Definir motor de búsqueda/indexación para el catálogo; Firestore no debe asumirse como búsqueda de texto completo.

### Prioridad 3 — Firebase propio
14. Crear un proyecto Firebase exclusivo de ComprAPP (todavía no existe).
15. Registrar aplicación web y configurar Authentication.
16. Crear estructura Firestore a partir del modelo aprobado.
17. Implementar reglas de seguridad y pruebas con Firebase Emulator.
18. Configurar Cloud Functions y secretos seguros para operaciones privilegiadas e integraciones.
19. Definir estrategia de índices, backups y entornos de prueba/producción.

### Prioridad 4 — Construcción funcional
20. Implementar catálogo maestro, variantes e identificadores estables.
21. Implementar favoritos y listas habituales conectados al catálogo.
22. Implementar cuentas ComprAPP y membresías PRO.
23. Implementar comercios, sucursales, catálogos por rubro y vínculos del consumidor.
24. Implementar ofertas, publicación de precios e historial.
25. Implementar comparación exacta/equivalente y precio por unidad.
26. Reconstruir la lista de compras con la experiencia de planilla compacta y comparación de comercios definida, basada en datos reales.
27. Implementar economía, ingresos, gastos y presupuestos según el alcance acordado.
28. Implementar sincronización offline real.
29. Implementar QR/NFC y enlaces de comercio.
30. Evaluar pedidos y flujo de compra/envío.

### Prioridad 5 — Fuentes, monetización y lanzamiento
31. Verificar fuentes de precios y cobertura local; especialmente SEPA/Precios Claros en Panambí/Misiones.
32. Evaluar importación Open Food Facts y cumplimiento de licencias/atribución.
33. Definir duración del período PRO gratuito.
34. Definir pagos: Mercado Pago para Argentina y alternativas para otros mercados.
35. Definir alta de comercios autogestionada o asistida.
36. Definir alcance de pedidos, estados y canales de entrega.
37. Ejecutar pruebas funcionales, de seguridad, rendimiento y dispositivos.
38. Confirmar publicación final y proceso de actualización.

## 15. Decisiones que no deben volver a preguntarse como si fueran nuevas

- ComprAPP pertenece a TusAPP y vive aislada en `apps/comprapp/`.
- FREE es una cuenta de un usuario con múltiples ingresos.
- PRO admite múltiples usuarios autorizados en una cuenta.
- FREE vincula un comercio por rubro; PRO hasta tres.
- El catálogo maestro es compartido y los IDs son propios e inmutables.
- El comercio publica precios vinculados a variantes del catálogo, no duplica productos.
- Se comparan coincidencias exactas y equivalentes con precio por unidad.
- Las listas y preferencias deben persistir en la cuenta en la nube; IndexedDB es soporte local/offline, no la única persistencia.
- Los datos offline pueden estar desactualizados y deben identificarse como últimos conocidos.
- Las sugerencias inteligentes son PRO y siempre requieren confirmación.
- La app se diseña internacional, mobile-first y PWA.
- No usar proyectos Firebase ni credenciales de otras aplicaciones TusAPP.

## 16. Reglas de trabajo para el desarrollo

1. Cambios quirúrgicos: modificar solo lo solicitado y lo estrictamente necesario.
2. No rediseñar, reorganizar ni mejorar por iniciativa propia otras partes.
3. No tocar archivos raíz ni otras aplicaciones del repositorio.
4. Usar la versión base y rama indicadas; revisar archivos reales antes de editar.
5. Si una modificación requiere tocar otro archivo o afecta otra función, explicarlo antes.
6. Si existe riesgo de romper algo, detenerse e informar.
7. Comparar antes/después y enumerar exactamente los archivos cambiados.
8. No declarar una función terminada sin pruebas y resultados verificables.
9. Diferenciar claramente: implementado en repositorio, probado en navegador, publicado y funcionando.
10. Mantener documentación actualizada con decisiones y estado real.

---

## 17. Punto exacto para retomar

**No crear todavía funcionalidades nuevas sobre la lista provisional.**

El siguiente paso recomendado es hacer una revisión técnica y funcional del borrador `MODELO_DATOS.md` contra este resumen y las decisiones históricas del proyecto. Corregir inconsistencias y campos faltantes. Luego preparar el proyecto Firebase exclusivo de ComprAPP, sin tocar otras aplicaciones, y comenzar con Authentication, Firestore y reglas seguras probadas en Emulator.

El diseño visual definitivo de la lista debe retomarse cuando ya existan catálogo, favoritos, comercios y precios, porque la experiencia prevista depende de esos datos y relaciones.
