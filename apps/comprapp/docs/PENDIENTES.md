# ComprAPP — Pendientes

1. Probar IndexedDB en navegador de escritorio y móvil; lectura, escritura, borrado y migración.
2. Probar la lista de compras local: agregar, editar nombre y cantidad, marcar como comprado, eliminar, recargar y volver a abrir el navegador.
3. Integrar favoritos con almacenamiento local y referencias al catálogo; la cuenta en nube será la persistencia principal cuando Firebase esté configurado.
4. [REVISIÓN DOCUMENTADA — PENDIENTE DE APROBACIÓN] Se documentaron propuestas de relaciones, permisos, integridad, operaciones atómicas y consultas en docs/MODELO_DATOS.md. Falta resolver las decisiones técnicas abiertas de su sección 20 y validar el diseño antes de aprobarlo.
5. Crear un proyecto Firebase exclusivo de ComprAPP; todavía no existe.
6. Definir autenticación, identidad y permisos a partir del modelo aprobado, respetando FREE de un usuario y PRO multiusuario.
8. Definir política de conflictos offline por entidad antes de implementar la cola de sincronización.
9. Cerrar taxonomía inicial de rubros por país.
10. Verificar fuentes de precios, cobertura local y condiciones de uso.
11. Definir importación Open Food Facts respetando ODbL/CC BY-SA y atribución de imágenes.
12. Definir motor de búsqueda e indexación del catálogo internacional.
13. Confirmar incorporación de cuentas/saldos y transferencias internas.
14. Definir duración del período PRO gratuito.
15. Definir proveedores de pagos por mercado.
16. Definir pedidos, estados y canales de envío.
17. Confirmar si el alta de comercios será autogestionada o asistida.
18. Definir alcance inicial de presupuestos.
19. Ejecutar pruebas funcionales en navegador y móvil.
20. Verificar GitHub Pages y su URL pública.
21. Definir y probar reglas de seguridad Firebase con Emulator antes de almacenar datos reales.

## Revisión de modelo — tareas que siguen pendientes

- Aprobar o modificar la regla propuesta de que el propietario también tenga una membresía activa con rol owner.
- Definir la matriz efectiva de roles/permisos PRO y del personal de comercios.
- Definir invitaciones, aceptación, revocación y transferencia de propiedad.
- Definir unicidad/identificadores de vínculos cuenta-comercio-rubro y probar concurrencia del reemplazo.
- Definir zona/proximidad y proveedor geográfico.
- Definir precisión monetaria, conversión y reglas de comparación entre monedas.
- Definir auditoría, eliminación lógica, retención e integridad de referencias.
- Definir idempotencia y conflictos de sincronización offline.
- Validar consultas de uso y crear índices solo a partir de consultas aprobadas.
- Mantener Firebase sin crear hasta cerrar y aprobar estas decisiones.


### Roles y permisos PRO — propuesta elaborada, pendiente de decisión

Se agregó a `MODELO_DATOS.md` una matriz preliminar para owner, admin, member y viewer; permisos económicos independientes; separación entre cuenta consumidora y comercio; y reglas de seguridad mínimas. No está aprobada ni implementada.

Pendiente de resolver:
- Confirmar los cuatro roles y sus límites.
- Definir si las listas son compartidas o pueden ser personales.
- Confirmar autorización económica individual.
- Cerrar facultades de invitación/deshabilitación del admin.
- Definir cierre de cuenta y recuperación.
- Definir por separado los roles de personal comercial.


## Vista previa Firebase Hosting

- [CONFIGURACIÓN AGREGADA, NO DESPLEGADA] Existe `apps/comprapp/firebase.json` con Hosting estático aislado en la carpeta de ComprAPP y exclusión de `docs/` y archivos internos.
- [PENDIENTE] Crear o identificar el proyecto Firebase exclusivo de ComprAPP.
- [PENDIENTE] Vincular el proyecto mediante Firebase CLI, desplegar Hosting y comprobar la URL pública.
- La vista previa no requiere ni configura Authentication, Firestore, Storage o Cloud Functions.
- No modificar configuración raíz de TusAPP ni otras aplicaciones.
