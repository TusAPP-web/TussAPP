# ComprAPP — Decisiones funcionales confirmadas

- Nombre: ComprAPP. Forma parte de TusAPP.
- Experiencia mobile-first, adaptable y PWA instalable.
- El usuario configura el país al iniciar.
- Vistas de productos: todos los productos de la zona; productos de mis comercios; mis productos favoritos.
- Los filtros jerárquicos zona/categoría/producto/variante se destinan principalmente a la carga e importación del comerciante.
- Cada comercio mantiene catálogo separado por rubros. El consumidor vincula el comercio y elige un rubro específico.
- FREE: un comercio por rubro. PRO: hasta tres comercios por rubro.
- Al reemplazar un vínculo se informa qué comercio/rubro será reemplazado. Confirmar afecta solo ese rubro; cancelar no modifica nada.
- Las listas y datos necesarios se guardan localmente para uso offline y se sincronizan al recuperar conexión.
- Precios offline son los últimos conocidos; no garantizan vigencia. Promociones nuevas y envío de pedidos requieren conexión.
- Sugerencias inteligentes basadas en historial e indicador de conexión/sincronización son PRO. Las sugerencias requieren confirmación antes de agregar.
- Catálogo maestro compartido internacional, IDs TusAPP inmutables, revisión de productos nuevos y control de procedencia/licencias de imágenes.
- Integraciones de precios mediante adaptadores; secretos solo en backend.
- Planes FREE/PRO y período inicial PRO gratuito; duración todavía no definida.
- FREE: una cuenta con un solo usuario y posibilidad de registrar múltiples ingresos.
- PRO: admite múltiples usuarios autorizados dentro de una misma cuenta ComprAPP.
- Las listas y preferencias pertenecen a la cuenta del usuario en la nube para conservarse entre dispositivos; IndexedDB funciona como almacenamiento local/offline y no como único lugar de persistencia.
- La app mantiene listas habituales/productos favoritos como parte de la experiencia; las sugerencias inteligentes basadas en historial son una función PRO y requieren confirmación antes de agregarse.
