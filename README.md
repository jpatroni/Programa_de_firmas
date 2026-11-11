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

## Acceso desde otros equipos

Para uso local, el servidor escucha en 127.0.0.1. Para publicar el programa, ejecutalo en un servidor con almacenamiento persistente y HTTPS, configurá `ADMIN_PASSWORD` con una contraseña nueva y activá `SECURE_COOKIE=1`. Podés ajustar `HOST` y `PORT` según el entorno. Los asistentes abren la URL de esa instalación y ven la plantilla activa al cargar la página.
