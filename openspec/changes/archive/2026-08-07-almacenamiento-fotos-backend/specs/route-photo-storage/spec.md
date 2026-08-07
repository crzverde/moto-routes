## Purpose

Permite subir, listar, descargar y borrar las fotos asociadas a una ruta del usuario autenticado, almacenadas cifradas en reposo y servidas únicamente a través de la propia API — nunca mediante una URL directa al almacenamiento subyacente.

## ADDED Requirements

### Requirement: Subir una foto a una ruta propia
La API SHALL permitir subir una foto a una ruta que pertenece al usuario autenticado, guardando sus bytes cifrados y sus metadatos (coordenadas, momento de captura).

#### Scenario: Subida correcta
- **WHEN** un usuario autenticado sube una foto a una de sus propias rutas
- **THEN** la foto queda almacenada cifrada y sus metadatos se pueden consultar en el listado de fotos de esa ruta

#### Scenario: No se puede subir una foto a una ruta de otra cuenta
- **WHEN** un usuario autenticado intenta subir una foto a una ruta que pertenece a otra cuenta
- **THEN** la API rechaza la subida sin revelar si esa ruta existe, y no se almacena ningún dato

#### Scenario: No se puede subir una foto a una ruta inexistente
- **WHEN** un usuario autenticado intenta subir una foto a un identificador de ruta que no existe
- **THEN** la API rechaza la subida con un error claro, sin crear ningún dato huérfano

#### Scenario: Una foto que supera el tamaño máximo se rechaza
- **WHEN** un usuario intenta subir una foto que supera el tamaño máximo soportado
- **THEN** la API rechaza la subida con un error explicando el motivo, sin almacenar una copia parcial

#### Scenario: Una ruta que ya tiene el número máximo de fotos rechaza subidas nuevas
- **WHEN** un usuario intenta subir una foto a una ruta que ya tiene el número máximo de fotos soportado
- **THEN** la API rechaza la subida con un error explicando el motivo

### Requirement: Listar las fotos de una ruta propia
La API SHALL permitir consultar los metadatos (sin los bytes de imagen) de las fotos de una ruta que pertenece al usuario autenticado.

#### Scenario: Listado correcto
- **WHEN** un usuario autenticado consulta las fotos de una de sus propias rutas
- **THEN** la API devuelve los metadatos de todas las fotos de esa ruta, sin los bytes de imagen

#### Scenario: Una ruta sin fotos devuelve una lista vacía
- **WHEN** un usuario autenticado consulta las fotos de una ruta propia que no tiene ninguna foto todavía
- **THEN** la API devuelve una lista vacía, no un error

#### Scenario: No se puede listar las fotos de una ruta de otra cuenta
- **WHEN** un usuario autenticado intenta listar las fotos de una ruta que pertenece a otra cuenta
- **THEN** la API rechaza la petición sin revelar si esa ruta existe

### Requirement: Descargar una foto de una ruta propia
La API SHALL permitir descargar los bytes de una foto de una ruta que pertenece al usuario autenticado, descifrándola al vuelo — nunca mediante una URL que apunte directamente al almacenamiento subyacente.

#### Scenario: Descarga correcta
- **WHEN** un usuario autenticado descarga una foto de una de sus propias rutas
- **THEN** la API devuelve los bytes originales de la imagen (ya descifrados), con el tipo de contenido correcto

#### Scenario: No se puede descargar una foto de una ruta de otra cuenta
- **WHEN** un usuario autenticado intenta descargar una foto de una ruta que pertenece a otra cuenta
- **THEN** la API rechaza la petición sin revelar si esa foto o esa ruta existen

#### Scenario: Descargar un identificador de foto inexistente
- **WHEN** un usuario autenticado intenta descargar una foto con un identificador que no existe
- **THEN** la API responde con un error claro de "no encontrado"

### Requirement: Borrar una foto de una ruta propia
La API SHALL permitir borrar una foto (bytes y metadatos) de una ruta que pertenece al usuario autenticado.

#### Scenario: Borrado correcto
- **WHEN** un usuario autenticado borra una foto de una de sus propias rutas
- **THEN** la foto deja de aparecer en el listado de esa ruta y ya no se puede descargar

#### Scenario: No se puede borrar una foto de una ruta de otra cuenta
- **WHEN** un usuario autenticado intenta borrar una foto de una ruta que pertenece a otra cuenta
- **THEN** la API rechaza el borrado sin revelar si esa foto o esa ruta existen, y la foto original permanece intacta

### Requirement: Las fotos se almacenan cifradas en reposo
Toda foto SHALL almacenarse cifrada en el almacenamiento subyacente, de forma que un acceso directo a ese almacenamiento (sin pasar por la API) no permita reconstruir la imagen original.

#### Scenario: Los bytes almacenados no son la imagen original
- **WHEN** se inspeccionan directamente los bytes guardados en el almacenamiento subyacente para una foto ya subida
- **THEN** esos bytes no se pueden interpretar como una imagen válida sin la clave de cifrado, que nunca se almacena junto a ellos

### Requirement: Ninguna foto es accesible sin autenticación ni sin ser el propietario de la ruta
Ningún endpoint de fotos SHALL exponer una URL o mecanismo que permita acceder a los bytes de una foto sin un token de sesión válido y sin que la ruta pertenezca a ese usuario.

#### Scenario: Sin token de sesión no hay acceso a ninguna foto
- **WHEN** se intenta subir, listar, descargar o borrar una foto sin un token de sesión válido
- **THEN** la API rechaza la petición en los cuatro casos
