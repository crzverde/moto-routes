# route-cloud-sync Specification

## Purpose

Permite subir una ruta grabada localmente a la cuenta del usuario autenticado, y ver en un único listado combinado las rutas que existen en este dispositivo y las que además (o solo) existen en el servidor — sin exigir sesión para las rutas ya locales. Una ruta sincronizada se re-sube sola al modificar sus metadatos o sus fotos.

## Requirements

### Requirement: Subir una ruta local a la cuenta del usuario
La app SHALL permitir subir una ruta local completa (metadatos, puntos GPS y paradas — sin fotos) a la cuenta del usuario con sesión activa, y SHALL reflejar en el mapa del detalle, inmediatamente tras una subida con éxito, los puntos que el servidor haya devuelto para esa ruta (normalizados o, si no hubo ajuste, los mismos originales) — sin esperar a una recarga de la pantalla.

#### Scenario: Subida correcta
- **WHEN** un usuario con sesión activa pulsa "Subir a la nube" en el detalle de una ruta local
- **THEN** la ruta pasa a existir también en el servidor, y el listado la muestra como sincronizada

#### Scenario: La subida actualiza el mapa con los puntos devueltos por el servidor
- **WHEN** la subida de una ruta local se completa con éxito y el servidor devuelve puntos ajustados a la carretera para alguno de ellos
- **THEN** el mapa del detalle de esa ruta se repinta de inmediato con los puntos devueltos, sin que el usuario tenga que salir y volver a entrar en la pantalla

#### Scenario: La acción de subir no está disponible sin sesión activa
- **WHEN** un usuario sin sesión activa abre el detalle de una ruta local
- **THEN** la app no muestra ninguna acción para subirla a la nube

#### Scenario: Subir sin conexión
- **WHEN** un usuario con sesión activa pulsa "Subir a la nube" sin conexión de red
- **THEN** la app muestra un error y la ruta sigue marcada como no sincronizada, sin bloquear el resto de la app

#### Scenario: Re-subir una ruta ya sincronizada actualiza la copia existente
- **WHEN** un usuario pulsa "Subir a la nube" en una ruta que ya tenía una copia en el servidor (por ejemplo, tras editar sus notas localmente)
- **THEN** el servidor sustituye los datos existentes por los actuales de esa misma ruta, sin crear una segunda copia

#### Scenario: Una ruta con un número de puntos excesivo se rechaza con un error claro
- **WHEN** un usuario intenta subir una ruta cuyo número de puntos GPS supera el límite soportado
- **THEN** la app muestra un error explicando el motivo, sin subir una copia parcial ni colgar la interfaz

### Requirement: El listado combina rutas locales y de la nube sin duplicar
La pantalla de listado de rutas SHALL mostrar, en una sola lista, las rutas de este dispositivo y las de la cuenta del usuario con sesión activa, sin mostrar la misma ruta dos veces, distinguiendo su estado con un indicador visual. La miniatura de una ruta exclusiva de la nube con puntos GPS SHALL mostrar su trazado real, descargado bajo demanda, en vez de quedarse indefinidamente en el placeholder de "sin datos".

#### Scenario: Ruta solo local
- **WHEN** una ruta existe únicamente en este dispositivo (no se ha subido)
- **THEN** el listado la muestra con el indicador de "solo local"

#### Scenario: Ruta local ya sincronizada
- **WHEN** una ruta existe tanto en este dispositivo como en la cuenta del usuario
- **THEN** el listado la muestra una sola vez, con el indicador de "sincronizada"

#### Scenario: Ruta que solo existe en la nube
- **WHEN** una ruta existe en la cuenta del usuario pero no en este dispositivo
- **THEN** el listado la muestra con el indicador de "en la nube", junto a las locales

#### Scenario: Sin sesión activa, el listado se comporta igual que hoy
- **WHEN** un usuario sin sesión activa abre el listado de rutas
- **THEN** la app muestra únicamente las rutas locales de este dispositivo, sin ningún indicador de nube

#### Scenario: Con sesión activa pero sin conexión al abrir el listado
- **WHEN** un usuario con sesión activa abre el listado de rutas sin conexión de red
- **THEN** la app muestra igualmente las rutas locales sin bloquearse, y no muestra ninguna ruta exclusiva de la nube hasta poder consultarlas

#### Scenario: La miniatura de una ruta exclusiva de la nube muestra su trazado real
- **WHEN** el listado muestra la tarjeta de una ruta exclusiva de la nube que tiene puntos GPS
- **THEN** la app descarga esos puntos bajo demanda y sustituye el placeholder de la tarjeta por la silueta del trazado real, sin bloquear el resto del listado mientras se calcula

#### Scenario: Una ruta exclusiva de la nube sin puntos GPS se queda con el placeholder
- **WHEN** el listado muestra la tarjeta de una ruta exclusiva de la nube que no tiene ningún punto GPS
- **THEN** la tarjeta se queda con el placeholder existente, sin ningún error visible

#### Scenario: Un fallo al descargar los puntos de una ruta cloud-only deja la tarjeta en el placeholder
- **WHEN** la descarga bajo demanda de los puntos de una tarjeta cloud-only falla (por ejemplo, se pierde la conexión, o la ruta se borró entretanto)
- **THEN** esa tarjeta se queda con el placeholder, sin ningún error visible ni bloquear el resto del listado

### Requirement: Ver el detalle completo de una ruta que solo existe en la nube
La app SHALL permitir abrir el detalle completo (mapa y timeline) de una ruta que solo existe en el servidor, descargando sus datos bajo demanda.

#### Scenario: Abrir el detalle de una ruta que solo existe en la nube
- **WHEN** un usuario con sesión activa entra en una ruta del listado marcada como "en la nube"
- **THEN** la app descarga sus puntos y paradas del servidor y muestra el mismo detalle (mapa, timeline) que una ruta local

#### Scenario: Abrir una ruta exclusiva de la nube sin conexión
- **WHEN** un usuario intenta abrir el detalle de una ruta exclusiva de la nube sin conexión de red
- **THEN** la app muestra un error explicándolo, sin fallar de forma silenciosa

### Requirement: Cada usuario solo ve y sube a sus propias rutas de la nube
El listado y el detalle de rutas de la nube SHALL mostrar únicamente las rutas asociadas a la cuenta del usuario con sesión activa, determinada por su token — nunca por un identificador que el cliente pueda elegir.

#### Scenario: El listado de rutas de la nube solo muestra las de la cuenta activa
- **WHEN** un usuario con sesión activa abre el listado de rutas
- **THEN** las rutas "en la nube"/"sincronizada" mostradas pertenecen únicamente a su propia cuenta

#### Scenario: No se puede acceder al detalle de una ruta de la nube de otra cuenta
- **WHEN** un usuario con sesión activa intenta abrir el detalle de una ruta de la nube que pertenece a otra cuenta (por ejemplo, adivinando o reutilizando un identificador)
- **THEN** la petición se rechaza sin revelar si esa ruta existe

### Requirement: Una ruta ya sincronizada se actualiza sola en la nube al modificarla localmente
La app SHALL volver a subir automáticamente (sin acción explícita del usuario) los metadatos de una ruta que ya está sincronizada, cada vez que esos datos cambian localmente — una ruta que nunca se ha subido no se ve afectada, sigue siendo puramente local hasta que el usuario decida subirla la primera vez. Añadir o borrar una foto en una ruta sincronizada, además, sube o borra la foto en sí contra el servidor, no solo los metadatos de la ruta.

#### Scenario: Guardar una nota en una ruta sincronizada la re-sube sola
- **WHEN** un usuario guarda una nota en el detalle de una ruta que ya está marcada como sincronizada
- **THEN** la app vuelve a subir la ruta a la nube en segundo plano, sin ninguna acción adicional del usuario y sin bloquear el guardado local (que ya ha tenido éxito)

#### Scenario: Marcar o desmarcar favorita una ruta sincronizada la re-sube sola
- **WHEN** un usuario marca o desmarca como favorita una ruta que ya está marcada como sincronizada
- **THEN** la app vuelve a subir la ruta a la nube en segundo plano, sin ninguna acción adicional del usuario y sin bloquear el cambio local (que ya ha tenido éxito)

#### Scenario: Añadir una foto en una ruta sincronizada la sube también a la nube
- **WHEN** un usuario añade una foto (cámara o galería) en el detalle de una ruta que ya está marcada como sincronizada
- **THEN** la app sube la foto al servidor y vuelve a subir los metadatos y puntos/paradas de la ruta en segundo plano, sin ninguna acción adicional del usuario y sin bloquear el guardado local de la foto (que ya ha tenido éxito)

#### Scenario: Borrar una foto en una ruta sincronizada la borra también de la nube
- **WHEN** un usuario borra una foto en el detalle de una ruta que ya está marcada como sincronizada, y esa foto ya tenía copia en el servidor
- **THEN** la app borra la copia remota de la foto y vuelve a subir los metadatos de la ruta en segundo plano, sin ninguna acción adicional del usuario y sin bloquear el borrado local (que ya ha tenido éxito)

#### Scenario: Modificar una ruta puramente local no la sube
- **WHEN** un usuario guarda una nota, marca/desmarca favorita, o añade/borra una foto, en una ruta que nunca se ha subido a la nube
- **THEN** la ruta sigue siendo puramente local — no se dispara ninguna subida ni borrado remoto

#### Scenario: La re-subida o el sincronizado de una foto falla sin bloquear ni deshacer el cambio local
- **WHEN** la re-subida automática de metadatos, la subida de una foto nueva, o el borrado remoto de una foto fallan (p. ej. sin conexión)
- **THEN** el cambio local (nota, favorito, foto añadida o foto borrada) permanece guardado, y la app no revierte nada ni interrumpe al usuario con un error bloqueante — solo muestra un aviso discreto

### Requirement: Los límites del backend de fotos se respetan al subir
La app SHALL tratar el rechazo del servidor por exceso de tamaño de una foto o por haber alcanzado el número máximo de fotos de una ruta como un fallo no bloqueante de la subida en segundo plano — nunca como una pérdida de la foto guardada localmente.

#### Scenario: El servidor rechaza una foto por tamaño excesivo
- **WHEN** la subida en segundo plano de una foto recién añadida es rechazada por el servidor por superar el tamaño máximo permitido
- **THEN** la foto permanece guardada localmente y visible en la ruta, marcada como no sincronizada, con un aviso discreto — la app no la borra ni bloquea la interfaz

#### Scenario: El servidor rechaza una foto porque la ruta ya alcanzó el máximo permitido
- **WHEN** la subida en segundo plano de una foto recién añadida es rechazada por el servidor por haber alcanzado ya el número máximo de fotos de esa ruta
- **THEN** la foto permanece guardada localmente y visible en la ruta, marcada como no sincronizada, con un aviso discreto — la app no la borra ni bloquea la interfaz

### Requirement: Borrar una foto que nunca llegó a subirse no produce ningún error visible
La app SHALL borrar una foto local con normalidad aunque esa foto nunca haya tenido copia en el servidor (por ejemplo, porque su subida anterior falló) — sin intentar un borrado remoto que fallaría, y sin mostrar ningún error al usuario por ello.

#### Scenario: Borrar una foto que se guardó sin conexión y nunca se subió
- **WHEN** un usuario borra en una ruta sincronizada una foto que se añadió previamente pero cuya subida a la nube nunca llegó a completarse
- **THEN** la app borra la foto localmente sin mostrar ningún error relacionado con la nube, y no intenta ningún borrado remoto para esa foto
