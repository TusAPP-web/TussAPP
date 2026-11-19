# ComprAPP

Aplicación de compras y economía familiar de la familia TusAPP.

La base de navegación modular está creada. Las pantallas de catálogo, comercios, favoritos, lista, comparación, economía, presupuestos y sincronización son estructuras iniciales; no están conectadas a datos reales.

- index.html: shell de la PWA.
- src/css/core/: estilos base.
- src/js/core/: router y coordinación.
- src/js/modules/: módulos aislados con vista HTML, lógica JS y CSS propios.
- docs/: decisiones, arquitectura y pendientes.
- service-worker.js: caché de recursos estáticos de ComprAPP.

No hay Firebase configurado. No se comparten archivos internos con otras aplicaciones. app.js coordina; no debe contener lógica de negocio de los módulos. styles.css agrega imports y no debe acumular estilos.