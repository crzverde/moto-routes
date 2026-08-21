## MODIFIED Requirements

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
