# Generador de diplomas

En Windows, abrí **Abrir programa.bat** con doble clic. Requiere Node.js 22 o posterior. El programa abre el navegador en http://127.0.0.1:3000. Dejá abierta la ventana de comandos mientras lo usás. También podés iniciarlo con `node server.js`.

## Asistentes

Escribí tu nombre y apellido y presioná **OK, generar diploma**. Podés descargar el PNG o imprimirlo en A4 horizontal.

## Administración

Entrá desde **Administración** con el correo registrado y la contraseña indicada al crear el programa. Elegí una imagen PNG o JPG, marcá dónde va el nombre y presioná **Publicar plantilla**. **Quitar plantilla** deja el programa sin un diploma disponible hasta que publiques otro. El archivo original viene cargado al iniciar por primera vez.

## Arquitectura por capas

- **Presentación**. `public/index.html` y `public/app.js` muestran los formularios, generan la vista previa y permiten descargar o imprimir.
- **API HTTP**. `server.js` recibe las solicitudes del navegador, verifica la sesión en las rutas de edición y sirve la interfaz.
- **Lógica de aplicación**. `src/servicio.js` autentica a la administradora, gestiona sesiones y valida los cambios de plantilla.
- **Persistencia**. `src/almacenamiento.js` guarda la plantilla activa y la posición del nombre en `plantillas/activa.json`. Podés elegir otra carpeta persistente con `DIPLOMA_DATA_DIR`.

## Despliegue en Vercel

1. Importá el repositorio desde GitHub. Seleccioná la raíz del proyecto y la rama de producción `master`. La configuración de compilación está en `vercel.json`.
2. Conectá un almacén **Vercel Blob público** y una base **Upstash Redis**. El almacén es público porque los asistentes necesitan cargar la plantilla para dibujar y descargar el diploma. La subida exige una sesión de administradora.
3. Verificá las variables `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. Configurá `ADMIN_PASSWORD` con una contraseña nueva en **Settings → Environment Variables**. Vercel usa una cookie segura por HTTPS y exige esa variable para iniciar sesión.
4. Desplegá. Abrí el enlace de producción, publicá una plantilla desde **Administración** y verificá desde una ventana privada que se pueda generar y descargar el diploma. Probá también cambiar la posición del nombre, quitar la plantilla y volver a publicar.

`npm ci` instala las dependencias y `npm run build` genera el módulo de subida que usa el navegador en Vercel. El modo local sigue funcionando con `node server.js` sin esas dependencias.

En Vercel, `api/handler.js` adapta las solicitudes a la capa HTTP compartida en `src/http.js`. `src/almacenamiento-vercel.js` guarda en Redis la plantilla activa, su posición y las sesiones. Las imágenes se suben directamente del navegador a Blob. Quitar una plantilla la retira del generador. Si necesitás borrar el archivo de Blob, podés hacerlo desde el panel de almacenamiento una vez retirado.
