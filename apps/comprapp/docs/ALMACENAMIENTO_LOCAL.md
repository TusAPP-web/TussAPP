# ComprAPP — Almacenamiento local

## Implementación inicial

El módulo `src/js/core/storage.js` crea y administra la base IndexedDB `comprapp-local`, versión 1. La base es exclusiva de ComprAPP y no comparte datos con otras aplicaciones TusAPP.

### Almacenes creados

| Almacén | Clave | Uso previsto |
| --- | --- | --- |
| preferences | key | Preferencias del dispositivo, por ejemplo país y moneda seleccionados |
| shoppingLists | id | Listas de compras del usuario |
| favorites | productId | Productos habituales/favoritos |
| catalogCache | id | Fragmentos de catálogo descargados para uso offline |
| syncQueue | id | Operaciones locales que eventualmente deberán sincronizarse |

La cola se crea como estructura de almacenamiento, pero todavía no se procesan ni envían operaciones. La política de conflictos y la identidad de usuario siguen pendientes.

## API disponible

- `getRecord(storeName, key)`
- `getAllRecords(storeName)`
- `saveRecord(storeName, record)`
- `deleteRecord(storeName, key)`
- `clearStore(storeName)`
- `checkLocalStorage()`

Las operaciones aceptan únicamente los almacenes declarados. Los registros deben respetar la clave primaria de cada almacén.

## Límites importantes

- Estos datos permanecen en el dispositivo y no se respaldan en la nube.
- Borrar datos del navegador puede eliminarlos.
- No guardar contraseñas, credenciales de pago ni secretos en IndexedDB.
- Todavía no se debe asumir que una escritura local quedó sincronizada con Firebase.
- Antes de asociar listas y datos a cuentas, se debe definir el modelo individual/familiar y el aislamiento por usuario.
- No implementar todavía reintentos automáticos ni resolución de conflictos: esas reglas requieren una decisión funcional explícita.

## Validación pendiente

El código está incorporado al repositorio. Falta probar apertura, lectura, escritura, borrado, migración y comportamiento offline en navegadores reales y dispositivos móviles.
