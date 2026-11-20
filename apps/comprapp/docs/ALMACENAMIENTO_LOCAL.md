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

## Lista de compras local

El módulo `src/js/modules/shopping-list/` usa el almacén `shoppingLists` con una lista local identificada como `comprapp-default-shopping-list`.

Cada artículo guarda un identificador local, nombre, cantidad numérica, estado comprado/pendiente y fechas de creación o modificación. La pantalla permite agregar, editar nombre y cantidad, marcar como comprado y eliminar artículos. La pantalla de inicio muestra un resumen de la misma lista.

### Alcance actual y límites

- Los artículos se cargan manualmente; todavía no son productos del catálogo maestro.
- No hay precios, comercios, rubros ni comparación asociados a estos artículos.
- Se guarda una única lista por navegador/dispositivo, sin identidad de cuenta ni espacio familiar.
- No se envían datos a Firebase ni se utiliza la cola `syncQueue`.
- Borrar los datos del navegador puede eliminar la lista.
- No guardar contraseñas, credenciales de pago ni secretos en IndexedDB.

## API disponible

- `getRecord(storeName, key)`
- `getAllRecords(storeName)`
- `saveRecord(storeName, record)`
- `deleteRecord(storeName, key)`
- `clearStore(storeName)`
- `checkLocalStorage()`

Las operaciones aceptan únicamente los almacenes declarados. Los registros deben respetar la clave primaria de cada almacén.

## Validación pendiente

El código está incorporado al repositorio, pero falta probar en navegador real la apertura de IndexedDB y el ciclo completo de agregar, leer, editar, marcar, eliminar y recargar. También falta verificar persistencia tras cerrar y volver a abrir el navegador y el comportamiento offline en dispositivos móviles.