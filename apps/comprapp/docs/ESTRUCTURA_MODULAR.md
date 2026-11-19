# Estructura modular de ComprAPP

El shell está en index.html. app.js registra los módulos y core/router.js coordina la carga de vistas. Cada módulo conserva sus propios archivos HTML, JS y CSS.

Módulos previstos: home, catalog, merchants, favorites, shopping-list, comparison, economy, budget y sync.

styles.css es únicamente un agregador de imports. No debe convertirse en una hoja monolítica. Los módulos no deben modificar directamente otros módulos; la comunicación futura se hará mediante contratos explícitos.

La lógica de negocio, persistencia y backend no se considera implementada por la existencia de estas pantallas.