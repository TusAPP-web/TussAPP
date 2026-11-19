# ComprAPP — Arquitectura propuesta

## Cliente
PWA mobile-first con HTML/CSS/JavaScript modular. Service Worker para shell y recursos estáticos. IndexedDB para listas, preferencias, catálogo parcial y cola de sincronización. No descargar el catálogo global completo.

## Backend previsto
Firebase Authentication, Firestore, Storage, Cloud Functions y Scheduler. El proyecto Firebase debe confirmarse antes de configurarlo. Las claves de fuentes externas permanecen exclusivamente en backend.

## Dominios
Usuarios/espacios; planes y entitlements; catálogo maestro; taxonomía; comercios, sucursales y rubros; catálogo comercial; ofertas/precios; fuentes; vínculos por rubro; listas; movimientos/presupuestos; operaciones offline; auditoría.

## Seguridad
Reglas de acceso denegar-por-defecto. Separación estricta entre datos privados del consumidor y datos del comercio. Validar límites FREE/PRO y reemplazos de vínculos en backend. Las operaciones de reemplazo deben ser atómicas.

## Publicación
La aplicación vive en apps/comprapp/. No modificar archivos raíz de TusAPP ni las carpetas de otras aplicaciones.