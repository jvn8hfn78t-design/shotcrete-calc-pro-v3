# SHOTCRETE CALC PRO

Calculadora para estimar volúmenes de shotcrete y cantidad de calibradores en labores subterráneas (UM CHUNGAR). Funciona como aplicación web/PWA y como aplicación Android (APK), 100 % offline después de la primera carga y sin inicio de sesión.

**Autoría:** Elmer Palomino Loayza y Brayan Alexander Toscano Chavez · created by Batch

---

## Funcionalidades

La aplicación tiene tres modos de trabajo: **Avance**, **Resane** y **Malla**.

### Datos de la labor

Todos los modos permiten registrar, para el reporte:

* Nivel
* Labor
* Operador
* Observaciones

### Mediciones

* Se pueden agregar varias mediciones de H (altura), A (ancho) y L (avance). Cuando hay varias, se usa el **promedio** de los valores positivos; las filas vacías se ignoran.
* Resane solo usa H y L. Avance y Malla usan H, A y L.
* Los valores se validan antes de calcular. Rangos permitidos:

| Variable | Mínimo | Máximo |
| --- | --- | --- |
| H – Altura | 0.5 m | 15 m |
| A – Ancho | 0.5 m | 20 m |
| L – Avance | 0.1 m | 50 m |

### Espesor y rendimientos

En Avance y Malla se selecciona el espesor (1", 1.5", 2", 3" o 4"). Cada espesor tiene un **rendimiento** en m² por m³ de shotcrete:

| Espesor | Rendimiento por defecto |
| --- | --- |
| 1" | 17 m²/m³ |
| 1.5" | 14 m²/m³ |
| 2" | 11.5 m²/m³ |
| 3" | 7.6 m²/m³ |
| 4" | 5.7 m²/m³ |

Los rendimientos se pueden modificar desde el menú **⋮ → Rendimientos**. Los cambios se guardan en el dispositivo (`localStorage`, clave `shotcrete-calc-pro-v2-rendimientos`) y se pueden **restablecer** a los valores por defecto. Los valores por defecto están definidos en `DEFAULT_RENDIMIENTOS_SHOTCRETE` dentro de `src/components/ShotcreteCalculator.tsx`.

---

## Fórmulas vigentes

Todas las fórmulas están en `calculateResults()` (`src/components/ShotcreteCalculator.tsx`).

Constante fija: **FARC = 0.90**. Se denota `r(e)` al rendimiento del espesor seleccionado, y `r(1)` y `r(2)` a los rendimientos de 1" y 2".

### Avance

```
P            = (2H + A) × FARC
Área         = P × L
V_base       = Área / r(e)
SH 1"        = max(H − 1.5, 0) × A × FARC / r(1)
SH 2"        = max(H − 1.5, 0) × A × FARC / r(2)
M³ Labor 1"  = V_base + SH 1"
M³ Labor 2"  = V_base + SH 2"
```

Calibradores:

```
H ≤ 0        → 0
H > 4.2      → round((H − 1) × 2 × 2)
en otro caso → ceil(P − 1) × 2
```

### Resane

```
Área          = H × L
Volumen       = Área / r(2)          (rendimiento de 2")
Filas         = 1 si H < 1.9, de lo contrario floor(H)
Calibradores  = Filas × ceil(max(L − 1, 0))     (0 si H ≤ 0 o L ≤ 0)
```

### Malla

```
P       = (2H + A) × FARC
Área    = P × L
Volumen = Área / r(e)
```

> Las fórmulas y parámetros deben mantenerse de acuerdo con los criterios y condiciones establecidos para el cálculo utilizado en operación. Si se modifican, actualizar también este README.

---

## Flujo de uso

1. Seleccionar el modo (Avance, Resane o Malla).
2. Ingresar nivel, labor y operador.
3. Ingresar las mediciones y, en Avance/Malla, seleccionar el espesor.
4. Presionar **CALCULAR**.
5. Revisar los resultados.
6. Opcionalmente adjuntar fotografías, copiar el reporte, generar el PDF o compartirlo.
7. Usar **LIMPIAR** para borrar los datos manteniendo el modo seleccionado.

Los resultados se invalidan al modificar cualquier dato de cálculo y deben recalcularse con **CALCULAR**.

---

## Reportes

* **Copiar reporte:** copia un resumen en texto al portapapeles.
* **Generar PDF:** el archivo se llama `Reporte_Shotcrete_<Labor>_<fecha>.pdf`.
  * En Android (APK) se guarda en `Documentos/PDR Shotcrete/`.
  * En navegador/PWA se descarga.
* **Compartir PDF:**
  * En Android se usa el diálogo nativo de compartir (Capacitor Share).
  * En navegador se usa la Web Share API cuando permite archivos; si no, se descarga el PDF.
* **Evidencia fotográfica:** hasta **10 fotografías** por reporte, de máximo 10 MB cada una. Se redimensionan a 1600 px de ancho y se comprimen como JPEG (calidad 0.75) antes de incluirlas en el PDF. Son temporales: solo existen mientras se prepara el reporte.

---

## Funcionamiento offline (PWA)

* `public/sw.js` implementa un Service Worker (caché `pdr-shotcrete-v1`): red primero para navegación y *stale-while-revalidate* para recursos estáticos.
* Solo se registra en producción; **no** se registra en `localhost` ni en las vistas previas de Lovable (`id-preview--*`).
* `public/manifest.webmanifest` y los iconos de `public/icons/` permiten instalar la app desde el navegador.
* Al cambiar recursos cacheados, subir la versión de `CACHE` en `sw.js` para forzar la actualización.

---

## Tecnologías

* [TanStack Start](https://tanstack.com/start) + TanStack Router (enrutamiento por archivos) y React 19
* TypeScript
* Vite, Nitro y `@lovable.dev/vite-tanstack-config`
* Tailwind CSS 4 y componentes Radix/shadcn (`src/components/ui`)
* jsPDF (generación de PDF)
* Capacitor 8 (`core`, `android`, `filesystem`, `share`) para la app Android
* Sonner (notificaciones) y Lucide React (iconos)
* Bun como gestor de paquetes

---

## Estructura del proyecto

```
src/
  components/
    ShotcreteCalculator.tsx   Calculadora, fórmulas, PDF, fotos y rendimientos
    Pwa.tsx                   Registro del Service Worker y botón "Instalar app"
    ui/                       Componentes UI base (shadcn)
  routes/
    __root.tsx                Layout raíz
    index.tsx                 Carátula + calculadora
  lib/                        Utilidades y manejo de errores
  routeTree.gen.ts            Generado automáticamente (no editar)
public/                       sw.js, manifest, iconos
capacitor.config.ts           Configuración de la app Android
.github/workflows/            CI y generación del APK
roadmap.md                    Estado y próximas etapas
```

---

## Desarrollo local

Se usa **Bun** (el repositorio incluye `bun.lock`).

```bash
bun install          # instalar dependencias
bun run dev          # servidor de desarrollo
bun run build        # build de producción
bun run build:dev    # build en modo desarrollo
bun run preview      # previsualizar el build
bun run lint         # ESLint
bun run format       # Prettier
```

`bunfig.toml` aplica una protección de 24 h: no instala versiones de paquetes publicadas hace menos de un día.

---

## Flujo de trabajo, despliegue y versiones

### Rama y Lovable

* Rama principal: `main`.
* El proyecto está conectado a [Lovable](https://lovable.dev): los commits que se suben a `main` se sincronizan con el editor de Lovable.
* **No reescribir el historial publicado** (sin `push --force`, ni `rebase`, `amend` o `squash` de commits ya subidos) para no perder el historial en Lovable.
* Mantener `main` siempre en estado funcional.

### Integración continua

| Workflow | Disparador | Qué hace |
| --- | --- | --- |
| `node.js.yml` (Node.js CI) | push y pull request a `main` | `bun install` y `bun run build` para verificar que compila |
| `android.yml` (Android APK) | manual (`workflow_dispatch`) | Genera y firma el APK de release |
| `generate-keystore.yml` | manual (`workflow_dispatch`) | Genera la keystore de firma (solo cuando hace falta una nueva) |

### Web (Vercel)

La versión web se despliega en Vercel. Con la variable `VERCEL` presente, Nitro usa el preset `vercel` (ver `vite.config.ts`).

### Android (APK)

La app Android se empaqueta con Capacitor (`appId`: `com.pdr.shotcrete`, nombre: *Shotcrete Calc Batch*).

1. En GitHub: **Actions → Android APK → Run workflow**.
2. El workflow compila la web con `CAPACITOR_BUILD=true` (modo SPA, salida en `.output/public`), crea el proyecto Android, genera los iconos a partir de `public/icons/IMG_9962.jpeg`, sincroniza Capacitor y compila con Gradle.
3. El APK se alinea y se firma con la keystore guardada en los *secrets* del repositorio:
   * `ANDROID_KEYSTORE_BASE64`
   * `ANDROID_KEYSTORE_PASSWORD`
4. El resultado se descarga desde los *artifacts* del workflow, con el nombre `shotcrete-calc-batch-release` (`app-release.apk`).

La carpeta `android/` se genera en cada ejecución y no forma parte del repositorio.

> Importante: usar siempre la misma keystore para firmar. Si se genera una nueva, Android la tratará como otra app y no permitirá actualizar sobre la instalada.

---

## Estado del proyecto

La calculadora (Avance, Resane y Malla), los reportes PDF con evidencia fotográfica, la PWA offline, el despliegue web y la generación de APK firmado están implementados. Las próximas etapas (pruebas en dispositivo Android sin conexión, evaluación de iOS, pruebas automáticas de las fórmulas y refactorización de componentes grandes) se detallan en [`roadmap.md`](./roadmap.md).
