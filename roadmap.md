Roadmap — PDR Shotcrete

Estado actual

La calculadora web se encuentra funcional y lista para pasar a la etapa de empaquetado móvil.

Funcionalidades implementadas

* [x]	Calculadora de Avance
* [x]	Calculadora de Resane
* [x]	Calculadora de Malla
* [x]	Ingreso de múltiples mediciones de H, A y L
* [x]	Promedio automático de las mediciones ingresadas
* [x]	Ignorar filas adicionales que permanezcan vacías
* [x]	Validación de rangos de entrada
* [x]	Botón CALCULAR
* [x]	Botón LIMPIAR
* [x]	Invalidación de resultados cuando cambian los datos de cálculo
* [x]	Espesor configurable para Avance
* [x]	Conversión automática de pulgadas a metros
* [x]	FARC fijo en 0.90
* [x]	Cálculo por rendimientos (m²/m³) según espesor
* [x]	Rendimientos editables y guardados en el dispositivo
* [x]	Restablecer rendimientos por defecto
* [x]	Cálculo de SH 1”
* [x]	Cálculo de SH 2”
* [x]	Cálculo de M³ Labor 1”
* [x]	Cálculo de M³ Labor 2”
* [x]	Cálculo de calibradores
* [x]	Generación de reportes PDF
* [x]	Copiar reporte
* [x]	Compartir PDF
* [x]	Evidencia fotográfica
* [x]	Máximo de 10 fotografías por reporte
* [x]	Compresión de fotografías para el PDF
* [x]	Fotografías distribuidas en el PDF
* [x]	Manifest de aplicación
* [x]	Service Worker para funcionamiento offline después de la primera carga
* [x]	Iconos de aplicación
* [x]	Manejo de errores de la aplicación
* [x]	CI de GitHub para verificar la compilación
* [x]	Aplicación desplegada en Vercel

Fórmulas vigentes

Método: Volumen = Área / Rendimiento (m²/m³)

Rendimientos por defecto (editables en la app), definidos a partir de los parámetros de contrato:
Sobreespesor 10 %, Rugosidad 32 %, Rebote 7 %, Pérdidas operativas 10 %
(factor acumulado 1.10 × 1.32 × 1.07 × 1.10 ≈ 1.709).

* 1" → 17
* 1.5" → 14
* 2" → 11.5
* 3" → 7.6
* 4" → 5.7

FARC = 0.90

Avance

P = (2H + A) × FARC
Área = P × L
V_base = Área / Rendimiento(espesor)
SH_1 = max(H − 1.5, 0) × A × FARC / Rendimiento(1")
SH_2 = max(H − 1.5, 0) × A × FARC / Rendimiento(2")
M³ Labor 1" = V_base + SH_1
M³ Labor 2" = V_base + SH_2
Calibradores = round((H − 1) × 4) si H > 4.2; ceil(P − 1) × 2 en otro caso

Resane

P = 2H
Área = H × L
Volumen resane = Área / Rendimiento(2")
Calibradores = Filas × ceil(max(L − 1, 0)), con Filas = 1 si H < 1.9; floor(H) en otro caso

Malla

P = (2H + A) × FARC
Área = P × L
Volumen malla = Área / Rendimiento(espesor)

Próxima etapa — Android

* [ ]	Preparar empaquetado Android
* [ ]	Verificar que todos los recursos necesarios queden incluidos localmente
* [ ]	Generar APK de prueba
* [ ]	Instalar APK en Android
* [ ]	Probar calculadora sin conexión a Internet
* [ ]	Probar generación de PDF sin conexión
* [ ]	Probar fotografías sin conexión
* [ ]	Probar compartir PDF sin conexión
* [ ]	Corregir cualquier problema encontrado
* [ ]	Generar APK final

Compatibilidad futura

* [ ]	Evaluar versión para iPhone/iOS
* [ ]	Evaluar distribución mediante App Store o instalación alternativa según la estrategia elegida

Mantenimiento futuro

* [ ]	Agregar pruebas automáticas de las fórmulas
* [ ]	Revisar los rendimientos de 1" y 1.5" frente al factor de contrato (1.709)
* [ ]	Mostrar en el PDF los rendimientos usados en el cálculo
* [ ]	Refactorizar componentes grandes cuando la aplicación esté estable
* [ ]	Mejorar textos de las páginas de error
