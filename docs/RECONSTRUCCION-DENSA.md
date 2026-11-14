# Reconstrucción densa local — rama experimental

Esta evolución vive en `codex/reconstruccion-densa-local`, creada desde `f4abcc5` de `codex/mejora-visual-visor-3d`. No reemplaza la versión anterior ni cambia la calculadora, sus fórmulas o el PDF. La interfaz conserva **Puntos iniciales · Motor anterior** para comparar y volver al procesamiento disperso.

## Uso

En Fotogrametría selecciona **Profundidad densa · Experimental**, añade entre 3 y 12 fotografías y pulsa **Reconstruir en 3D**. Recorre un tramo corto con desplazamiento lateral, aproximadamente 70 % de solapamiento, zoom fijo, buena luz y fotografías nítidas. Incluye tomas de ambos hastiales, bóveda y frente con solapamiento entre zonas. Girar la cámara desde un punto fijo no proporciona el paralaje necesario.

El procesamiento corre en un Web Worker del dispositivo. No requiere servicio, cuenta ni envío de fotos. Puede cancelarse; una reconstrucción anterior se conserva si el nuevo intento falla o se cancela. Cambiar las fotografías invalida el resultado anterior para no asociarlo a otras tomas. Fotos y resultado se guardan en IndexedDB. El PLY incluye todos los puntos; se puede añadir una distancia conocida para exportarlo con escala manual. El informe JSON registra los pares y los píxeles candidatos/aceptados, sin convertirlos en un porcentaje de superficie levantada.

## Qué calcula realmente

1. El SfM existente estima las cámaras y la nube inicial con ORB, geometría epipolar y PnP. No se altera ese algoritmo.
2. Para pares cercanos de cámaras registradas, rectifica las fotografías usando sus poses y focal estimada. Procesa imágenes rectificadas de 640 píxeles de ancho y hasta 960 de alto. La nube inicial acota la búsqueda de disparidad.
3. Estima disparidad en regiones de imagen con Census 5×5 y agregación 3×3. Rechaza regiones sin textura, costes altos, coincidencias ambiguas, incoherencia izquierda/derecha y correlación normalizada inferior a 0,8. La disparidad es entera, sin precisión subpíxel.
4. Convierte las profundidades aceptadas a coordenadas 3D comunes; rechaza profundidades aisladas y fusiona muestras mediante vóxeles. No interpola huecos ni añade una geometría de galería prefabricada.

Esto es **estéreo denso por pares con fusión**, no solo un aumento del límite de características ORB. Tampoco es un sistema MVS completo con optimización global: todavía no incorpora bundle adjustment, calibración de lente, consistencia de profundidad entre tres o más cámaras, ni malla triangular. Sigue dependiendo de la calidad de las cámaras del motor inicial. El error de reproyección mostrado corresponde a esas cámaras y puntos iniciales, no es un error de superficie densa.

## Límites que se muestran al usuario

- La nube densa representa únicamente zonas con coincidencias aceptadas. Las superficies ocultas, lisas, mojadas, repetitivas o mal fotografiadas pueden seguir vacías o contener errores. No garantiza levantar toda una labor.
- La focal es aproximada; la escala manual no corrige deformaciones ni acredita precisión topográfica. No se utiliza esta nube para cambiar los volúmenes de shotcrete.
- Se mantienen 12 fotos y 1280 píxeles de lado mayor en la entrada. Los pares con movimiento casi frontal, escaso rango de disparidad o poco apoyo se omiten. Es un motor experimental para tramos cortos.
- La fusión se limita a 350 000 puntos y avisa cuando se alcanza ese límite. El visor encuadra el 95 % central y aligera nubes grandes a 75 000 puntos visibles para facilitar el giro; alejar permite ver extremos. La exportación conserva la nube completa.
- El worker y OpenCV se sirven con la aplicación. El primer uso requiere tener esos recursos descargados; su disponibilidad offline posterior depende de la caché del navegador. No se ha validado aún el rendimiento en un APK Android o una aplicación iOS nativa.

## Verificación

`npm test` incluye correspondencia con disparidad conocida, profundidad de un plano a distancia conocida, rechazo de escenas sin textura y sin cámaras, máscaras inválidas y fotografías independientes sin correspondencias. Las pruebas existentes de geometría y PDF permanecen.

Prueba adicional con las cinco primeras fotografías públicas de [SceauxCastle / OpenMVG](https://github.com/openMVG/ImageDataset_SceauxCastle): 1 527 puntos dispersos frente a 66 238 puntos densos, con siete pares procesados y 5/5 cámaras registradas, usando las imágenes originales reducidas sin recomprimir. En el flujo completo del navegador, que guarda copias JPEG reducidas, el resultado fue de 61 723 puntos densos. Estos números son evidencia de densificación de ese conjunto, no de exactitud ni cobertura minera. Los resultados pueden variar por decodificación y compresión.

Verificación de esta rama en Chromium: compilación de producción, carga de fotos → worker → resultado → PLY, recarga desde IndexedDB, cancelación conservando la nube anterior y nueva reconstrucción sin conexión tras descargar el worker. Sin errores de página ni desbordamiento horizontal a 390, 768, 1024 y 1440 píxeles. Se comprobó también que la calculadora mantiene sus datos al cambiar de pestaña y muestra su visor después de calcular, al final de los resultados. `npm test`: 14 pruebas correctas. ESLint de los módulos editados: sin errores; permanece la advertencia existente de Fast Refresh en el exportador PLY. El chequeo TypeScript global conserva errores previos en otros módulos; no hay diagnósticos en los módulos modificados de fotogrametría.

Antes de considerar este motor apto para mediciones de una labor real, hace falta contrastarlo con capturas de mina y distancias de control independientes. La siguiente mejora de precisión debe centrarse en calibración/ajuste de cámaras y validación multivista de profundidades, antes de cerrar superficies con una malla.
