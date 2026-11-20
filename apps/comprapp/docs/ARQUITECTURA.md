# ComprAPP — Arquitectura

## Estado
- [HECHO Y VERIFICADO EN REPOSITORIO] Shell PWA aislado en apps/comprapp/.
- [HECHO Y VERIFICADO EN REPOSITORIO] Navegación por módulos con vistas HTML independientes.
- [HECHO Y VERIFICADO EN REPOSITORIO] CSS separado por módulo; styles.css solo importa hojas.
- [HECHO Y VERIFICADO EN REPOSITORIO] Módulo inicial IndexedDB con almacenes versionados y API básica de lectura/escritura.
- [HECHO EN REPOSITORIO, PENDIENTE DE PRUEBA EN NAVEGADOR] Lista local con alta, edición, marcado como comprado, eliminación y resumen en inicio.
- [PENDIENTE] Pruebas funcionales en navegador y verificación de publicación GitHub Pages.
- [PENDIENTE] Favoritos conectados al almacenamiento, cola de sincronización real, autenticación y backend.

## Cliente
index.html contiene el shell. app.js registra módulos. core/router.js carga vistas e inicializa el módulo activo. Cada módulo tiene HTML, JS y CSS propios. No colocar lógica de negocio en app.js ni reglas de todas las pantallas en styles.css.

## Módulos
home, catalog, merchants, favorites, shopping-list, comparison, economy, budget y sync.

## Persistencia local
core/storage.js gestiona IndexedDB `comprapp-local`, versión 1. Los almacenes iniciales son preferences, shoppingLists, favorites, catalogCache y syncQueue. La lista de compras usa una única clave local de lista y no requiere cambios de esquema. La cola existe solo como estructura; aún no tiene proceso de envío ni política de conflictos.

## Backend previsto
Firebase Authentication, Firestore, Storage, Cloud Functions y Scheduler. El proyecto Firebase debe confirmarse antes de configurarlo. No reutilizar credenciales de otras apps.

## Offline
IndexedDB para listas, preferencias, catálogo parcial y cola de sincronización. Service Worker para shell y recursos estáticos. No descargar el catálogo global completo. La política de conflictos se definirá antes de implementar sincronización.

## Seguridad
Reglas de acceso denegar-por-defecto. Separación estricta entre datos privados del consumidor y datos del comercio. Validar límites FREE/PRO y reemplazos de vínculos en backend. Las operaciones de reemplazo deben ser atómicas.

## Publicación
La aplicación vive en apps/comprapp/. No modificar archivos raíz de TusAPP ni carpetas de otras aplicaciones.