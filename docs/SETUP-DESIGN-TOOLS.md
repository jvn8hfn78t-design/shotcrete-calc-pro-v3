# Preparación local de skills de diseño y validación

Estos comandos se ejecutan en una **terminal Windows dentro de la carpeta clonada** de `shotcrete-calc-pro-v3`. No se ejecutan en Safari ni en GitHub.com. No son dependencias del APK/PWA y no deben agregarse al bundle de producción.

## Requisitos
- Git, Node.js 22+ y npm disponibles: `node --version`, `npm --version`.
- Chrome o Edge instalados.
- Proyecto clonado y abierto en una terminal: `cd ruta\\a\\shotcrete-calc-pro-v3`.
- Revisar la procedencia y permisos de herramientas de terceros antes de ejecutarlas.

## 1. Taste Skill
```powershell
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```
Elegir el agente/editor utilizado, preferiblemente el alcance **proyecto**. La instalación se produce en el entorno del agente de programación; no agrega componentes React automáticamente. Para que los scripts de la skill funcionen necesitan los demás archivos que instala el CLI y un navegador compatible.

## 2. Sistema de diseño
Este repositorio incluye `DESIGN.md` en la raíz, adaptado a la calculadora minera y su PWA. Está inspirado en la metodología publicada en:
https://github.com/VoltAgent/awesome-design-md

La colección es una biblioteca de documentos de diseño, **no una skill ejecutable**. Un agente debe leer `DESIGN.md` antes de modificar `src/components/` o `src/styles.css`.

## 3. Playwright CLI y skill para agentes
```powershell
npm install -g @playwright/cli@latest
playwright-cli install --skills=agents
playwright-cli install-browser chromium
```
El instalador de skill coloca referencias de Playwright en `.agents/skills/playwright-cli` del proyecto. Si tu agente usa la estructura de Claude, utiliza en su lugar `playwright-cli install --skills`, que instala en `.claude/skills/playwright-cli`.

Para una revisión manual del sitio desplegado:
```powershell
playwright-cli open https://shotcrete-calc-pro-v3.vercel.app --headed
playwright-cli screenshot
```
Consultar `playwright-cli --help` para interacciones y opciones vigentes.

## 4. Lista de comprobación antes de aprobar el rediseño
1. Vista móvil a 390 px, tablet a 768 px y escritorio a 1440 px.
2. Ningún control principal recortado, filas desplazadas ni scroll horizontal involuntario.
3. Calculadora sin cambios en fórmulas o PDF; 3D referencial con tope, corona y hastiales.
4. Fotogrametría con captura de video y persistencia local.
5. Comprobar red desconectada tras la primera carga; revisar errores y accesibilidad táctil.

## Importante
Copiar solo `SKILL.md` sin sus referencias y scripts **no constituye una instalación completa**. Los comandos anteriores deben ejecutarse en el workspace del agente; añadir las instrucciones a GitHub no instala herramientas en tu PC.
