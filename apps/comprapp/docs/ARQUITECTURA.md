# ComprAPP — Arquitectura

## Estado
- [HECHO Y VERIFICADO EN REPOSITORIO] Shell PWA aislado en apps/comprapp/.
- [HECHO Y VERIFICADO EN REPOSITORIO] Navegación por módulos con vistas HTML independientes.
- [HECHO Y VERIFICADO EN REPOSITORIO] CSS separado por módulo; styles.css solo importa hojas.
- [PENDIENTE] IndexedDB, cola de sincronización, autenticación, backend y pruebas de navegador.
- [PENDIENTE] Verificar publicación GitHub Pages.

## Cliente
index.html contiene el shell. app.js registra módulos. core/router.js carga vistas e inicializa el módulo activo. Cada módulo tiene HTML, JS y CSS propios. No colocar lógica de negocio en app.js ni reglas de todas las pantallas en styles.css.

## Módulos
home, catalog, merchants, favorites, shopping-list, comparison, economy, budget y sync.

## Backend previsto
Firebase Authentication, Firestore, Storage, Cloud Functions y Scheduler. El proyecto Firebase debe confirmarse antes de configurarlo. No reutilizar credenciales de otras apps.

## Offline
IndexedDB para listas, preferencias, catálogo parcial y cola de sincronización. Service Worker para shell y recursos estáticos. No descargar el catálogo global completo. La política de conflictos se definirá antes de implementar sincronización.

## Seguridad
Reglas de acceso denegar-por-defecto. Separación estricta entre datos privados del consumidor y datos del comercio. Validar límites FREE/PRO y reemplazos de vínculos en backend. Las operaciones de reemplazo deben ser atómicas.

## Publicación
La aplicación vive en apps/comprapp/. No modificar archivos raíz de TusAPP ni carpetas de otras aplicaciones.