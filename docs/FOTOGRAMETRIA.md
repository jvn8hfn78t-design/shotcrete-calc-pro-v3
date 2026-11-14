# Reconstrucción local con fotografías

Esta página documenta el motor disperso que sigue disponible como **Puntos iniciales · Motor anterior**. La rama experimental añade [reconstrucción densa local](RECONSTRUCCION-DENSA.md), seleccionada por defecto, con estimación de profundidad y fusión. Consulta ese documento para sus límites y pruebas.

En Fotogrametría, añade entre 3 y 12 fotos de una misma zona, ordenadas según el recorrido. Desplázate entre tomas, conserva aproximadamente un 70 % de superposición y mantén el zoom. Usa luz estable y superficies con detalle. Pulsa **Reconstruir en 3D**; puedes cancelar sin perder las fotos.

El motor OpenCV.js busca correspondencias ORB y estima cámaras con geometría epipolar robusta, triangulación y registro PnP de vistas adicionales. Se ejecuta en un Web Worker local. Las imágenes se reducen a 1280 píxeles de lado mayor, se conservan en IndexedDB y no se envían a servidores. Los originales del dispositivo permanecen intactos. Los datos de la calculadora se conservan al cambiar de pestaña.

El resultado es una **nube de puntos dispersa**, no una malla, un levantamiento topográfico certificado ni una fuente de volúmenes de shotcrete. La distancia focal se aproxima y no hay calibración de lente ni ajuste global de cámaras. El error de reproyección está en píxeles y no expresa precisión métrica. Si faltan vistas, la aplicación informa de la cobertura parcial. Las escenas sin textura, repetidas, planas o sin paralaje pueden rechazarse.

Para exportar en metros, abre **Dar escala con una medida conocida**, elige dos puntos visibles y escribe su distancia real. La escala manual se incorpora al PLY exportado; no corrige deformaciones de cámara ni acredita precisión. La sesión guarda las fotos y la nube original sin escala; la escala manual debe volver a indicarse tras recargar. El informe JSON describe la nube original. El archivo PLY se puede abrir en CloudCompare o MeshLab.

El motor se descarga desde los recursos de la propia aplicación en el primer uso (aproximadamente 11 MB). Para campo, realiza una primera reconstrucción con conexión. La calculadora sigue siendo independiente del motor. El funcionamiento posterior sin red depende de que el navegador conserve los recursos y el almacenamiento local; no se garantiza tras borrar cachés.

## Verificación de desarrollo

Node.js 22.18+ y dependencias instaladas. `npm test` comprueba la geometría con cámaras conocidas, ruido, valores atípicos y capturas degeneradas, además del envío del PDF. `npm run build` genera la aplicación y el worker.

Verificación adicional: cinco imágenes públicas de [SceauxCastle de OpenMVG](https://github.com/openMVG/ImageDataset_SceauxCastle), reconstrucción de 1.527 puntos y registro de 5/5 vistas en el motor con imágenes sin recomprimir. La interfaz reduce y comprime las fotos y puede producir un número distinto de puntos. Estas pruebas no certifican precisión sobre labores mineras. Se comprobaron también rechazo de imágenes sin textura y duplicadas, PLY, escala manual, persistencia y diseño adaptable.
