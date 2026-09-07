# Teutón GUI

Aplicación de escritorio (Linux) para usar **[Teutón](https://github.com/teuton-software/teuton)** de
forma visual: gestión de proyectos, edición de tests, ejecución y un **dashboard de evaluación** pensado
para el aula.

Es un **envoltorio visual sobre el CLI `teuton`**: toda la ejecución y la puntuación las realiza Teutón;
esta GUI se limita a lanzar el comando, editar los ficheros y mostrar los resultados que Teutón exporta
en JSON. No reimplementa nada de la lógica de evaluación.

> ⚠️ Este proyecto **no es** el software Teutón. Es una interfaz gráfica independiente construida sobre él.
> Todo el mérito del motor de evaluación es de **[teuton-software/teuton](https://github.com/teuton-software/teuton)**.

## Créditos

- **Teutón** (motor de evaluación) — David Vargas Ruiz y colaboradores.
  <https://github.com/teuton-software/teuton> · Licencia MPL-2.0.
- **Teutón GUI** (esta interfaz) — Adrià Muñoz · `amuno123@xtec.cat`.

Esta GUI se publica bajo la misma licencia que Teutón (**MPL-2.0**) en señal de respeto y continuidad.

## Requisitos

- **Node.js 20+** y npm (solo para desarrollo/compilación).
- **Ruby 3.2+** con la gema Teutón:
  ```bash
  gem install teuton
  ```
  La app detecta `teuton` automáticamente (incluso si el directorio de binarios de gemas de usuario no está
  en el `PATH`). Si no lo encuentra, muestra instrucciones en **Ajustes**.

## Instalación

Descarga el paquete de la [última release](https://github.com/adr1mt/teuton-gui/releases/latest):

- **`.deb`** — instálalo con doble clic (o `sudo dpkg -i teuton-gui_*.deb`). Deja **Teutón GUI** en
  el menú de aplicaciones, con su icono.
- **`.AppImage`** — dale permiso de ejecución y ábrelo, sin instalar nada:
  ```bash
  chmod +x Teuton-GUI-*.AppImage && ./Teuton-GUI-*.AppImage
  ```

## Ejecución desde el código

```bash
./launch.sh        # compila si hace falta y abre la app (recomendado)
```

Para dejarla en el **menú de aplicaciones** — compila el AppImage, lo instala en `/mnt/datos` y crea la
entrada con su icono:

```bash
./scripts/instalar.sh
```

`--forzar` recompila aunque no detecte cambios; `--desinstalar` la quita del menú y borra el ejecutable.

o en modo desarrollo con recarga en caliente:

```bash
npm install
npm run dev
```

## Empaquetado

```bash
npm run dist:linux   # genera AppImage y .deb en dist/
```

El icono se genera con `npm run icon` (script sin dependencias) y queda en `build/icon.png`.

## Estructura del repositorio

```
src/          código de la app (main · preload · renderer · shared)
tests/        tests unitarios (vitest)
scripts/      utilidades: icono, lanzador de escritorio, verificación, demo
build/        recursos de empaquetado (icono)
docs/         diseño, producto y notas de traspaso
sandbox/      proyectos de prueba locales (fuera de git)
```

## Funcionalidades

- **Inicio** — abrir/crear proyectos y lista de recientes.
- **Editor** — `start.rb` con editor de código (Monaco, resaltado Ruby) y `config.yaml` en **tabla visual**
  (una fila por alumno; añade IP/usuario/contraseña con un clic, contraseñas enmascaradas) o YAML crudo.
  Botón **Validar** (`teuton check`). Importar una **clase** guardada con un clic.
- **Ejecutar** — selección de casos, consola en vivo, cancelar y re-ejecutar. La ejecución **continúa en
  segundo plano** aunque cambies de pestaña.
- **Modo examen** — re-evalúa a todos los alumnos automáticamente cada N minutos, con cuenta atrás y
  dashboard que se refresca solo. Ideal para **proyectar el progreso al alumnado en tiempo real**.
- **Resultados** — tabla de alumnos con nota, superados, errores de conexión, **récord histórico** y nota
  convertida; vista **matriz** (objetivos × alumnos); detalle por alumno; export a **Moodle (CSV)**.
- **Analíticas** — objetivos fallados con más frecuencia, distribución de notas y tasa de éxito por grupo.
- **Clases** — guarda tus grupos de alumnos y reutilízalos en cada examen. Crea una clase en segundos
  **pegando desde Excel** tres columnas: Nombre · Email (ID de Moodle) · IP.
- **Ajustes** — **nota configurable** (p.ej. 70 pts = 5, 100 pts = 10), **credenciales por defecto**
  (usuario/contraseña de las máquinas, aplicadas a todos los proyectos al importar una clase) y tema
  claro/oscuro.
- **Ayuda** — manual completo dentro de la app que explica todo el flujo, con índice navegable.

### Nota configurable y récord (pensado para exámenes)

La nota de Teutón (0-100) se convierte a tu escala mediante una recta a trozos que pasa por
`(0, 0)`, `(puntos_de_aprobado, mitad_de_la_escala)` y `(100, nota_máxima)`.

Se guarda **siempre la mejor nota** de cada alumno entre ejecuciones. Así, si un alumno termina el examen,
saca un 10 y apaga su máquina, la exportación a Moodle usa ese 10 y no el 0 de una pasada posterior.
El historial queda separado por clase, incluso si dos grupos comparten alumnos con el mismo nombre. Cada
clase genera además su propio CSV en `informes/`, identificado de forma estable para que dos clases con
el mismo título tampoco se sobrescriban.

«Cargar últimos resultados» atribuye las notas a la clase con la que se hizo esa ejecución, aunque hayas
cambiado de grupo después. Y si haces una pasada de prueba antes del examen real, el botón **Reiniciar
historial** del dashboard borra el récord de la clase activa para empezar de cero.

## Arquitectura

- `src/main` — proceso principal Electron: wrapper del CLI (`teuton.ts`), gestión de proyectos, parser de
  resultados, persistencia (ajustes/clases/récords) y handlers IPC.
- `src/preload` — puente seguro (`contextBridge`) que expone `window.teuton`.
- `src/renderer` — interfaz React + TypeScript + Tailwind.
- `src/shared` — tipos y canales IPC compartidos.

**Seguridad**: `contextIsolation` activado, `nodeIntegration` desactivado, CSP restrictiva, navegación
externa bloqueada (los enlaces se abren en el navegador del sistema con lista blanca de esquemas), y las
llamadas al CLI usan `spawn`/`execFile` con argumentos (sin shell, sin inyección de comandos).

## Contrato de datos con Teutón

`teuton run --export=json` genera en `<proyecto>/var/<test>/`: `case-NN.json` (detalle por alumno),
`resume.json` (agregado) y `moodle.csv`. La GUI parsea estos ficheros para el dashboard y las analíticas.

## Verificación

```bash
# Valida el parser y las analíticas contra la salida real de teuton:
node_modules/.bin/esbuild scripts/verify-parsing.ts --bundle --platform=node \
  --format=esm --outfile=/tmp/verify.mjs --external:electron
node /tmp/verify.mjs <ruta/proyecto/ya/ejecutado>
```

`scripts/screenshot.ts` es un smoke test visual que arranca la app y captura una imagen.

## Proyecto de demostración

Para ver la pantalla con datos realistas sin montar máquinas virtuales, abre en Inicio
la carpeta `sandbox/examen-demo/`. Es un cuestionario de 10 preguntas de redes con 15
alumnos inventados. No usa SSH: cada comprobación compara en local la respuesta que el
alumno lleva en su ficha. La clase **DEMO-15** ya está guardada en Clases y el proyecto
la tiene como clase activa.

Las notas están repartidas a propósito para ver la pantalla en todos sus estados
(escala del profesor, con el aprobado en 70 puntos): cuatro **10,00**, tres **8,33**,
dos **6,67**, dos justo en el **5,00** y cuatro suspensos (**3,57**, **3,57**, **2,14**
y **0,71**). Salen **11 aprobados de 15**, media **5,67**.

Para rehacerla desde cero (o cambiar las notas: se editan en la tabla `ROSTER`):

```bash
node scripts/make-demo-project.mjs
```

## Licencia

[MPL-2.0](LICENSE) — igual que Teutón.
