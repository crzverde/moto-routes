## MODIFIED Requirements

### Requirement: Ver el detalle completo de una ruta que solo existe en la nube
La app SHALL permitir abrir el detalle completo (mapa, timeline y fotos) de una ruta que solo existe en el servidor, descargando sus datos bajo demanda. Las fotos de una ruta exclusiva de la nube SHALL mostrarse de solo lectura — sin acción de añadir ni de borrar, porque esta ruta no tiene repositorio local que respalde esas acciones.

#### Scenario: Abrir el detalle de una ruta que solo existe en la nube
- **WHEN** un usuario con sesión activa entra en una ruta del listado marcada como "en la nube"
- **THEN** la app descarga sus puntos y paradas del servidor y muestra el mismo detalle (mapa, timeline) que una ruta local

#### Scenario: Abrir una ruta exclusiva de la nube sin conexión
- **WHEN** un usuario intenta abrir el detalle de una ruta exclusiva de la nube sin conexión de red
- **THEN** la app muestra un error explicándolo, sin fallar de forma silenciosa

#### Scenario: Las fotos de una ruta exclusiva de la nube se muestran igual que en una ruta local
- **WHEN** un usuario abre el detalle de una ruta exclusiva de la nube que tiene fotos
- **THEN** la app descarga la lista de fotos y las muestra en la misma galería/timeline que usa una ruta local, sin necesitar guardarlas en el dispositivo

#### Scenario: Una ruta exclusiva de la nube sin fotos no muestra ningún hueco ni error
- **WHEN** un usuario abre el detalle de una ruta exclusiva de la nube que no tiene ninguna foto
- **THEN** la app muestra el resto del detalle con normalidad, sin ninguna sección de fotos vacía visible ni mensaje de error

#### Scenario: Un fallo al descargar las fotos no bloquea el resto del detalle
- **WHEN** los puntos y paradas de una ruta exclusiva de la nube se descargan con éxito pero la descarga de sus fotos falla (por ejemplo, se pierde la conexión a mitad de carga)
- **THEN** la app muestra igualmente el mapa y el timeline con normalidad, con un aviso discreto sobre las fotos en vez de bloquear o vaciar el resto del detalle

#### Scenario: Sin acciones de añadir ni borrar fotos en una ruta exclusiva de la nube
- **WHEN** un usuario ve las fotos del detalle de una ruta exclusiva de la nube
- **THEN** la app no muestra ningún botón para añadir una foto nueva ni para borrar una existente
