import { useRef } from 'react'
import {
  BookOpen,
  Rocket,
  FolderOpen,
  FileCode2,
  Users,
  KeyRound,
  PlayCircle,
  Radio,
  LayoutDashboard,
  BarChart3,
  GraduationCap,
  Download,
  LifeBuoy,
  ClipboardPaste,
  ArrowRight
} from 'lucide-react'
import { useApp } from '../stores/app'
import { ViewHeader } from '../components/ui'
import { cn } from '../lib/utils'

interface Section {
  id: string
  title: string
  icon: typeof BookOpen
}

const SECTIONS: Section[] = [
  { id: 'intro', title: '¿Qué es esto?', icon: BookOpen },
  { id: 'quickstart', title: 'Flujo rápido', icon: Rocket },
  { id: 'projects', title: 'Proyectos', icon: FolderOpen },
  { id: 'editor', title: 'Editor de test', icon: FileCode2 },
  { id: 'classes', title: 'Clases y pegar de Excel', icon: Users },
  { id: 'credentials', title: 'Credenciales por defecto', icon: KeyRound },
  { id: 'run', title: 'Ejecutar', icon: PlayCircle },
  { id: 'exam', title: 'Modo examen', icon: Radio },
  { id: 'dashboard', title: 'Resultados y récords', icon: LayoutDashboard },
  { id: 'analytics', title: 'Analíticas', icon: BarChart3 },
  { id: 'grading', title: 'Nota configurable', icon: GraduationCap },
  { id: 'moodle', title: 'Exportar a Moodle', icon: Download },
  { id: 'troubleshoot', title: 'Problemas frecuentes', icon: LifeBuoy }
]

export default function Help() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const setView = useApp((s) => s.setView)

  function jump(id: string) {
    scrollRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ViewHeader title="Manual de ayuda" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Índice. Antes se escondía por debajo de `lg:`: en una ventana de
          escritorio única eso solo significaba «a veces no está». */}
      <nav className="w-56 shrink-0 overflow-y-auto border-r border-border p-3">
        <div className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <s.icon className="h-4 w-4 shrink-0 opacity-70" />
              {s.title}
            </button>
          ))}
        </div>
      </nav>

      {/* Contenido */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-2xl px-8 py-8">
          <h2 className="mb-2 text-2xl font-bold tracking-tight">Cómo funciona Teutón GUI</h2>
          <p className="mb-9 text-muted-foreground">
            Guía completa para preparar, ejecutar y calificar exámenes de infraestructura con la
            interfaz. Si es tu primera vez, empieza por <Anchor onClick={() => jump('quickstart')}>Flujo
            rápido</Anchor>.
          </p>

          <Sec id="intro" icon={BookOpen} title="¿Qué es esto?">
            <P>
              Teutón GUI es una interfaz de escritorio sobre <B>Teutón</B>, el motor que evalúa
              automáticamente las máquinas de los alumnos por SSH: se conecta a cada equipo, ejecuta
              comprobaciones (¿está el servicio levantado?, ¿existe el usuario?, ¿responde el puerto?)
              y pone una nota de 0 a 100.
            </P>
            <P>
              Esta app <B>no cambia cómo Teutón califica</B>: solo te da una forma visual de editar el
              test y la lista de alumnos, lanzar la evaluación y ver los resultados en un panel pensado
              para proyectar en clase. La nota siempre la calcula Teutón.
            </P>
            <Callout icon={LifeBuoy}>
              Necesitas tener el comando <Code>teuton</Code> instalado en el sistema. Si en la barra
              lateral ves «Teutón no encontrado», ve a{' '}
              <Anchor onClick={() => setView('settings')}>Ajustes</Anchor> para ver cómo instalarlo.
            </Callout>
          </Sec>

          <Sec id="quickstart" icon={Rocket} title="Flujo rápido (un examen de principio a fin)">
            <Ol>
              <li>
                <B>Crea o abre un proyecto</B> (la carpeta con el test) desde{' '}
                <Anchor onClick={() => setView('home')}>Inicio</Anchor>.
              </li>
              <li>
                <B>Prepara tu clase</B> en <Anchor onClick={() => setView('classes')}>Clases</Anchor>:
                pega desde Excel la lista de alumnos con nombre, email e IP.
              </li>
              <li>
                <B>Importa la clase</B> en el proyecto desde el Editor (pestaña Tabla). Sus datos
                rellenan el <Code>config.yaml</Code> y el usuario/contraseña por defecto se aplican
                solos.
              </li>
              <li>
                <B>Ejecuta</B> desde <Anchor onClick={() => setView('run')}>Ejecutar</Anchor>. Durante
                el examen puedes activar el <Anchor onClick={() => jump('exam')}>Modo examen</Anchor>{' '}
                para que se reevalúe solo cada pocos minutos.
              </li>
              <li>
                <B>Revisa y exporta</B>: mira el panel en Resultados y descarga el CSV para subir las
                notas a Moodle.
              </li>
            </Ol>
          </Sec>

          <Sec id="projects" icon={FolderOpen} title="Proyectos">
            <P>
              Un proyecto es una carpeta con dos ficheros: <Code>start.rb</Code> (el test: qué se
              comprueba) y <Code>config.yaml</Code> (los alumnos y sus datos). Desde{' '}
              <Anchor onClick={() => setView('home')}>Inicio</Anchor> puedes crear uno nuevo (se genera
              el esqueleto) o abrir una carpeta existente. Los últimos proyectos abiertos aparecen en
              «Recientes».
            </P>
          </Sec>

          <Sec id="editor" icon={FileCode2} title="Editor de test">
            <P>
              El editor tiene dos partes. <B>El test</B> (<Code>start.rb</Code>) define los objetivos a
              comprobar; se edita como código. <B>La configuración</B> (<Code>config.yaml</Code>) tiene
              dos vistas:
            </P>
            <Ul>
              <li>
                <B>Tabla</B> — una fila por alumno y columnas para sus datos (IP, puerto…). Es donde
                <B> importas una clase</B> con un clic y donde editas la sección global.
              </li>
              <li>
                <B>YAML</B> — el fichero en crudo, por si necesitas tocar algo a mano.
              </li>
            </Ul>
            <Callout icon={FileCode2}>
              La <B>sección global</B> contiene los valores comunes a todos los alumnos (usuario,
              contraseña, puerto…). Poner ahí lo que se repite evita teclearlo en cada fila.
            </Callout>
          </Sec>

          <Sec id="classes" icon={Users} title="Clases y pegar desde Excel">
            <P>
              En <Anchor onClick={() => setView('classes')}>Clases</Anchor> guardas tus grupos de
              alumnos para reutilizarlos en cada examen. La forma más rápida de crear una:{' '}
              <B>pega directamente desde una hoja de cálculo</B>.
            </P>
            <P>Prepara en Excel tres columnas, una fila por alumno, en este orden:</P>
            <div className="my-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 font-medium">Email (ID de Moodle)</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  <tr className="border-t border-border">
                    <td className="px-3 py-2">Ana García</td>
                    <td className="px-3 py-2">ana@centro.cat</td>
                    <td className="px-3 py-2">10.0.0.11</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2">Beto Ruiz</td>
                    <td className="px-3 py-2">beto@centro.cat</td>
                    <td className="px-3 py-2">10.0.0.12</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <P>
              Selecciona el rango, cópialo, y en Clases pulsa{' '}
              <span className="inline-flex items-center gap-1 font-medium">
                <ClipboardPaste className="h-3.5 w-3.5" /> Pegar desde Excel
              </span>{' '}
              y pega. El email se guarda como <Code>ID de Moodle</Code> (necesario para asociar la nota
              al importar el CSV) y la IP como <Code>host1_ip</Code>. Si todavía no tienes las IPs,
              puedes pegar solo el nombre, o nombre y email.
            </P>
            <Callout icon={ArrowRight}>
              Una clase guardada se importa en cualquier proyecto desde el Editor. Al reimportar la{' '}
              <B>misma</B> clase se conservan los datos específicos del examen ya puestos; al importar
              una clase <B>distinta</B> se parte de cero, para que un alumno homónimo no herede la IP
              del grupo anterior.
            </Callout>
          </Sec>

          <Sec id="credentials" icon={KeyRound} title="Credenciales por defecto">
            <P>
              Si todas las máquinas de tus alumnos usan las mismas credenciales (por ejemplo{' '}
              <Code>usuario</Code> / <Code>usuario</Code>), no hace falta escribirlas por alumno ni por
              proyecto. Configúralas <B>una sola vez</B> en{' '}
              <Anchor onClick={() => setView('settings')}>Ajustes → Credenciales por defecto</Anchor>.
            </P>
            <P>
              Al importar una clase en un proyecto, esos valores se vuelcan automáticamente a la sección
              global del <Code>config.yaml</Code>. Vienen ya rellenos con <Code>usuario</Code> /{' '}
              <Code>usuario</Code>; edítalos o añade otros campos comunes (puerto, un segundo host…). Si
              un proyecto ya tenía un valor puesto en su sección global, no se sobrescribe.
            </P>
          </Sec>

          <Sec id="run" icon={PlayCircle} title="Ejecutar">
            <P>
              En <Anchor onClick={() => setView('run')}>Ejecutar</Anchor> lanzas la evaluación. Puedes
              evaluar a <B>todos</B> los alumnos o seleccionar solo algunos casos (útil para reintentar
              con quien tuvo un problema de red). Verás la consola de Teutón en vivo y una barra de
              progreso.
            </P>
            <Callout icon={PlayCircle}>
              La ejecución sigue en marcha aunque cambies de pestaña: no se corta al ir a mirar los
              resultados. Los cambios sin guardar del editor se guardan solos justo antes de ejecutar.
            </Callout>
          </Sec>

          <Sec id="exam" icon={Radio} title="Modo examen (reevaluación automática)">
            <P>
              El modo examen reejecuta todo el grupo cada X minutos, sin que tengas que pulsar nada.
              Pensado para proyectar el panel durante el examen: la nota de cada alumno se va
              actualizando a medida que terminan sus tareas.
            </P>
            <P>
              Se inicia desde la pestaña Ejecutar (elige el intervalo: 3, 5, 10 minutos o el que
              quieras) y se detiene con el botón rojo del panel. Cada ciclo espera a que termine el
              anterior, así que nunca se solapan.
            </P>
            <P>
              Si un alumno corrige algo y quiere que le vuelvas a mirar sin esperar al siguiente
              ciclo, usa el botón <B>Reevaluar</B> de su fila o de su detalle en Resultados: ejecuta
              el test solo para él. Mientras dura, el panel muestra únicamente a ese alumno (igual
              que al seleccionar casos a mano en Ejecutar); la siguiente pasada completa restaura la
              vista de toda la clase y su récord de mejor nota se conserva siempre.
            </P>
          </Sec>

          <Sec id="dashboard" icon={LayoutDashboard} title="Resultados y récords por clase">
            <P>
              El panel de <Anchor onClick={() => setView('dashboard')}>Resultados</Anchor> muestra a
              cada alumno con su nota, objetivos superados y errores de conexión. Tiene vista de{' '}
              <B>lista</B> y vista de <B>matriz</B> (objetivos × alumnos), y detalle por alumno al hacer
              clic.
            </P>
            <Callout icon={GraduationCap}>
              <B>Se guarda siempre la mejor nota</B> de cada alumno entre ejecuciones. Así, si un
              alumno acaba con un 10 y apaga su máquina, una pasada posterior que lo vea caído (0) no le
              baja la nota. Este historial está <B>separado por clase</B>: dos grupos con un alumno del
              mismo nombre no se mezclan.
            </Callout>
            <P>
              El botón <B>Reiniciar historial</B> borra las mejores notas de la clase activa. Úsalo, por
              ejemplo, tras una pasada de prueba antes del examen real, para que esas notas de práctica
              no cuenten.
            </P>
          </Sec>

          <Sec id="analytics" icon={BarChart3} title="Analíticas">
            <P>
              <Anchor onClick={() => setView('analytics')}>Analíticas</Anchor> resume la clase: nota
              media, distribución de notas, objetivos que más falla el grupo y una tabla de{' '}
              <B>atención prioritaria</B> con los alumnos que necesitan tu intervención (primero los que
              tienen la conexión caída, luego los que van por debajo del aprobado).
            </P>
          </Sec>

          <Sec id="grading" icon={GraduationCap} title="Nota configurable">
            <P>
              Teutón puntúa de 0 a 100. La app convierte esa puntuación a tu escala con una recta a
              trozos que puedes ajustar en{' '}
              <Anchor onClick={() => setView('settings')}>Ajustes → Nota</Anchor>: defines cuántos
              puntos son aprobado y cuál es la nota máxima. Por ejemplo «70 puntos = 5, 100 puntos =
              10». Este umbral es el que decide quién aprueba en todos los paneles.
            </P>
          </Sec>

          <Sec id="moodle" icon={Download} title="Exportar a Moodle">
            <P>
              Desde Resultados exportas un CSV listo para Moodle, usando siempre la mejor nota de cada
              alumno. Además, tras cada ejecución la app deja automáticamente un CSV por clase en la
              carpeta <Code>informes/</Code> del proyecto.
            </P>
            <Callout icon={Download}>
              Como el mismo examen se pasa a varios grupos, cada clase genera su propio fichero (con un
              identificador estable en el nombre), de modo que dos grupos nunca se sobrescriben las
              notas. El <Code>ID de Moodle</Code> de cada alumno debe coincidir con el de Moodle (email
              o número de identificación) para que la nota se asocie al importar.
            </Callout>
          </Sec>

          <Sec id="troubleshoot" icon={LifeBuoy} title="Problemas frecuentes">
            <Dl>
              <Dt>«Teutón no encontrado» en la barra lateral</Dt>
              <Dd>
                Falta el comando <Code>teuton</Code>. Instálalo con <Code>gem install teuton</Code> (ver{' '}
                <Anchor onClick={() => setView('settings')}>Ajustes</Anchor>) y pulsa «Volver a
                comprobar». La app busca también en los directorios de gemas de Ruby del usuario.
              </Dd>
              <Dt>Un alumno sale con 0 o «conexión»</Dt>
              <Dd>
                Su máquina no responde por SSH: comprueba la IP, que esté encendida y que el usuario y
                contraseña sean correctos. Su mejor nota anterior no se pierde por esto.
              </Dd>
              <Dt>Importé otra clase pero salen los alumnos antiguos</Dt>
              <Dd>
                Ejecuta de nuevo: Teutón lee los ficheros del disco. La app guarda los cambios antes de
                ejecutar, así que basta con volver a lanzar la evaluación.
              </Dd>
              <Dt>Subí un CSV a Moodle con notas viejas</Dt>
              <Dd>
                Usa el CSV con el identificador de clase en el nombre (dentro de <Code>informes/</Code>)
                o el botón Exportar del panel, que siempre usa las mejores notas actuales.
              </Dd>
            </Dl>
          </Sec>

          <div className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
            ¿Dudas sobre el motor de evaluación? Consulta el proyecto original{' '}
            <button
              onClick={() => window.teuton.openExternal('https://github.com/teuton-software/teuton')}
              className="font-medium text-primary hover:underline"
            >
              teuton-software/teuton
            </button>
            .
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

// ---- Primitivos de maquetación del manual ----

function Sec({
  id,
  icon: Icon,
  title,
  children
}: {
  id: string
  icon: typeof BookOpen
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      {/* Icono en gris: el azul de esta vista se reserva a los enlaces, que son
          lo único pulsable del manual. */}
      <h3 className="mb-3 flex items-center gap-2 border-b border-border pb-2 text-base font-semibold tracking-tight">
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </h3>
      <div className="space-y-3 text-ui leading-relaxed text-foreground/90">{children}</div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}

function B({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  )
}

function Anchor({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="font-medium text-primary hover:underline">
      {children}
    </button>
  )
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>
}

function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5 marker:text-muted-foreground">{children}</ol>
}

function Callout({ icon: Icon, children }: { icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

function Dl({ children }: { children: React.ReactNode }) {
  return <dl className="space-y-3">{children}</dl>
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="font-semibold text-foreground">{children}</dt>
}

function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="text-foreground/85">{children}</dd>
}
