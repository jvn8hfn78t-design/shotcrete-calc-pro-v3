# DESIGN.md — Shotcrete Calc Pro V3

## Propósito
Aplicación técnica para supervisión de shotcrete en labores subterráneas. Prioridad: lectura clara en campo, operación táctil, fiabilidad offline y relación directa entre datos, cálculo y geometría. **No** diseñar como landing page de marketing ni como dashboard genérico.

Este diseño específico del proyecto se inspira en la metodología de `VoltAgent/awesome-design-md` (documentar decisiones y tokens) y en principios de `Leonxlnx/taste-skill` (diseño intencional, contraste y revisión visual). No copiar identidades visuales de marcas de referencia.

## Diseño actual que debe preservarse
Fuente de verdad de los tokens: `src/styles.css`. No reemplazar valores existentes indiscriminadamente.
- Paleta industrial oscura: `--background: oklch(0.145 0.012 264)`, `--card: oklch(0.19 0.014 264)`, `--secondary: oklch(0.24 0.016 264)`.
- Acción primaria: ámbar de seguridad `--primary: oklch(0.79 0.16 82)` con texto oscuro.
- Texto: `--foreground: oklch(0.95 0.008 250)`, `--muted-foreground: oklch(0.68 0.02 255)`.
- Tipografía: Barlow para interfaz y Barlow Condensed para encabezados técnicos.
- Radios: `--radius: 0.625rem`; bordes de bajo contraste y superficies sobrias.
- Evitar degradados decorativos, tarjetas duplicadas sin propósito y animaciones distractoras.

## Jerarquía y navegación
1. **Calculadora**: datos de labor, controles de avance/resane/malla, resultados numéricos y **modelo 3D referencial por medidas**. Valores de cálculo siempre más destacados que la decoración.
2. **Fotogrametría**: captura continua por video, estado del archivo guardado, procesamiento y (cuando exista) **levantamiento 3D real**. El visor real nunca debe confundirse con el referencial.
3. Mantener accesibles los botones principales y las acciones Descargar / Compartir PDF. Evitar quitar u ocultar funciones sin validación previa.

## Interfaces y componentes
- Móvil primero: diseño para iPhone 15 y Galaxy A55, con ancho útil desde 360–390 px.
- Botones primarios táctiles: altura mínima 48–56 px, texto breve, contraste AA cuando sea viable.
- Inputs numéricos: teclado decimal, unidades explícitas junto al campo, valores claramente legibles, errores cerca del dato.
- Mostrar progreso visible en operaciones lentas, errores recuperables y estados vacíos específicos.
- En visores 3D: gestos táctiles para rotar, controles mínimos de zoom y opción de restablecer vista. Distinguir etiquetas **MODELO REFERENCIAL** y **LEVANTAMIENTO ESCANEADO**.
- No mostrar controles de nube de puntos en Calculadora; mostrar superficie sólida, corona, hastiales, piso y tope.
- Reservar semántica ámbar para acciones principales y advertencias contextuales; rojo solo para errores.
- No inventar precisión, medidas, calidad de reconstrucción ni métricas que no procedan de datos reales.

## Offline y seguridad funcional
- La aplicación es PWA utilizable sin conexión; no introducir dependencias de red en el flujo crítico.
- Las capturas y datos de guardia/levantamiento deben permanecer locales salvo exportación voluntaria.
- Las animaciones y efectos nunca deben degradar cálculo, captura o 3D en teléfonos.
- No modificar las fórmulas de cubicación ni la generación de PDF al hacer mejoras visuales.
- Mantener compatibilidad con React, TanStack Start, Vite y Tailwind ya existentes.

## Criterios visuales de aceptación
- Comprobar a 390, 768, 1024 y 1440 px, con atención prioritaria a 390 px.
- Contraste, texto recortado, botones de una/dos líneas, legibilidad numérica, scroll horizontal, foco de teclado y estados disabled/loading.
- Probar con resultados reales y vacíos; móvil táctil y escritorio con mouse.
- Verificar uso offline y que el cambio de pestaña no interrumpa una captura sin advertencia.
- Revisar capturas reales de navegador antes de aprobar un rediseño, siguiendo Taste Skill y Playwright CLI.

## Fuentes y referencias
- https://github.com/Leonxlnx/taste-skill
- https://github.com/VoltAgent/awesome-design-md
- https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/linear.app
- https://playwright.dev/docs/getting-started-cli

Este documento adapta referencias al contexto minero. No se copian logotipos, productos, tipografías propietarias ni materiales visuales protegidos.
