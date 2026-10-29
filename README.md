# Marcas para guía

App independiente (no tiene relación con ningún otro sistema). Funciona sin internet y sin cuenta: todo queda guardado en el teléfono.

**Qué hace:** sacás una foto de cada marca con la cámara, la app la recorta, la limpia, le pone el mismo grosor de trazo y el mismo tamaño máximo, y la ubica en el siguiente cuadro del Frente o del Anexo. Todas las marcas ocupan el mismo recuadro máximo (67 × 59,5 pt, la medida de la marca dominante del modelo) y el mismo grosor de trazo (2,55 pt). Al final generás el PDF (hoja oficio 612 × 1008 pt, igual al modelo) con o sin las líneas de los cuadros. Podés copiar hojas las veces que necesites.

---

## Parte 1 — Probarla en el teléfono (GitHub Pages)

1. Entrá a https://github.com y tocá **New** (o el botón verde **New repository**).
2. En *Repository name* escribí `marcas-guia`. Dejalo en **Public**. No marques "Add a README". Tocá **Create repository**.
3. En la página del repositorio nuevo tocá el enlace **uploading an existing file**.
4. Descomprimí el ZIP en tu computadora. Arrastrá a la página **el contenido de la carpeta** (las carpetas `docs` y `extras`, y los archivos `package.json`, `capacitor.config.json`, `README.md`). No subas el ZIP cerrado.
5. Abajo tocá **Commit changes**. Esperá a que termine de subir.
6. Tocá **Settings** (arriba) → **Pages** (menú de la izquierda).
7. En *Source* elegí **Deploy from a branch**. En *Branch* elegí **main** y en la carpeta elegí **/docs** (no "/ (root)"). Tocá **Save**.
8. Esperá 1 o 2 minutos y recargá esa misma página. Aparece el enlace: `https://TU-USUARIO.github.io/marcas-guia/`
9. Abrí ese enlace en el Chrome del teléfono. Aceptá el permiso de cámara. Menú de Chrome → **Instalar app** o **Agregar a la pantalla principal** para tenerla como una app.

## Parte 2 — Crear el APK (instalable en Android)

El APK se arma solo en GitHub, no necesitás programas en tu computadora.

1. En tu repositorio tocá **Add file → Create new file**.
2. En el nombre escribí exactamente: `.github/workflows/build-apk.yml` (al escribir las barras `/` se van creando las carpetas).
3. Abrí el archivo `extras/build-apk.yml` del ZIP, copiá todo su contenido y pegalo en el cuadro grande. Tocá **Commit changes**.
4. Tocá la pestaña **Actions**. Si pide habilitar los flujos, tocá **I understand my workflows, go ahead and enable them**.
5. Entrá a **Crear APK** → **Run workflow** → **Run workflow**. Tarda entre 5 y 10 minutos.
6. Cuando aparezca el tilde verde, entrá a esa ejecución y abajo, en **Artifacts**, descargá `marcas-para-guia-apk` (es un ZIP con `app-debug.apk`).
7. Pasá el `app-debug.apk` al teléfono (WhatsApp, Drive o cable) y abrilo. Android va a pedir permiso para **instalar apps de esta fuente**: aceptalo.
8. La primera vez que abras la cámara, aceptá el permiso.

Si en el paso 5 aparece una cruz roja, abrí la ejecución, copiá el mensaje del error y mandámelo.

## Actualizar la app (cuando hay una versión nueva)

1. Descomprimí el ZIP nuevo.
2. En tu repositorio tocá **Add file → Upload files**.
3. Arrastrá **la carpeta `docs`** completa (y `extras`, `package.json`, `capacitor.config.json` si querés). GitHub reemplaza los archivos que tienen el mismo nombre.
4. Tocá **Commit changes** y esperá 1 o 2 minutos.
5. En el celular abrí la app: busca sola la versión nueva y se recarga al estar en la pantalla de inicio (si estabas trabajando, te avisa y se aplica al volver al inicio). Abajo en el inicio dice la versión que tenés, por ejemplo «Versión v3». No hace falta borrar el caché. No borres los «datos del sitio»: eso borra las guías guardadas.

Las guías y las marcas ya guardadas en el teléfono se conservan al actualizar. Las guías viejas conservan su grosor anterior; las nuevas arrancan en 2,55 pt.

## Cómo se usa

1. **Nueva guía** → poné el nombre y la cantidad de marcas (por ejemplo 62).
2. Con el celular a unos 15 cm, poné la marca dentro del cuadro verde (no tiene que llenarlo). Si hace falta acercar, usá los botones de zoom (1×, 2×…) o juntá los dedos sobre la imagen. Después tocá el botón redondo. También podés elegir una foto de la galería (botón izquierdo) o usar la cámara del teléfono (botón derecho). Con la galería se abre primero **Ajustar recorte**.
3. En **Revisar**: mirás el resultado, ajustás el grosor del trazo (vale para todas las marcas), activás **Conservar punto suelto** si la marca tiene puntos, o tocás **Ajustar recorte**. Abajo ves en qué cuadro cae la marca y cuántos llevás usados. Después **Aceptar y sacar la siguiente**.
4. Se llena primero el Frente (cuadros 2 al 6; el cuadro 1 queda vacío para la marca dominante) y después el Anexo 1, Anexo 2, etc. Cada anexo tiene 40 cuadros. Las hojas de anexo se agregan solas según la cantidad de marcas, y podés **Agregar hoja** o **Quitar hoja**.
5. En **Documento** tocá cualquier cuadro para revisar, repetir o quitar esa marca.
6. **Copiar hojas**: elegí una o varias hojas (por ejemplo el Frente), indicá cuántas veces repetirlas y tocá **Copiar hojas**. Las copias son idénticas y se arman después de la última hoja elegida. Abajo ves todas las hojas que va a tener el PDF y, con **Ver el PDF**, las recorrés deslizando como en un PDF. Ejemplo: Frente ×3 deja 4 frentes iguales; Anexo 1 + Anexo 2 ×3 deja ese par 4 veces.
7. **Exportar PDF**: elegí **Con líneas** o **Solo marcas**. Si hace falta, ajustá el grosor y el **tamaño de las marcas** (vale para todas). Generá el PDF y tocá **Guardar o compartir**.

## Consejos para que la foto salga bien

- Buena luz pareja, sin sombras ni reflejos sobre el papel.
- La marca bien dentro del cuadro verde, con un poco de papel alrededor.
- Esperá a que la etiqueta diga **Foto nítida**.
- El recorte es el cuadro verde: la app limpia y centra lo que hay adentro. Si en el cuadro entra texto de la guía, ajustá el recorte para que quede solo la marca.

## Privacidad

No hay cuenta, ni servidor, ni internet. Las fotos y las marcas se guardan solo en el almacenamiento del teléfono. Desinstalar la app o borrar sus datos elimina todo.

## Archivos

- `docs/` — la app (es lo que publica GitHub Pages y lo que se empaqueta en el APK).
- `extras/build-apk.yml` — copia del flujo que arma el APK.
- `package.json`, `capacitor.config.json` — configuración del empaquetado Android.

## Flujo continuo (v4)

- En la cámara: foto → panel de revisión sobre la cámara → **Aceptar** → la marca se guarda en segundo plano y la cámara queda lista para la siguiente.
- Arriba se ve la sección (Frente / Anexo N), "marca k de n" y una mini grilla que se pinta a medida que cargás.
- Al completar una hoja aparece el aviso ("Frente listo") y se pasa solo a la siguiente. Al llegar a la meta se abre el documento.
- **Ajustes** dentro del panel: grosor, punto suelto y "Ajustar recorte".
- **Auto** (apagado por defecto): acepta solo si la foto es nítida y se detectó la marca; muestra **Deshacer** unos segundos.

## Novedades v5

- Pantalla de cámara ordenada: grilla grande de avance en su propia franja con el contador, "Auto" arriba a la derecha, ayuda en una línea y zoom solo abajo.
- Memoria: la foto de trabajo es más chica (1600 px) y los lienzos se liberan después de cada marca. Cada 50 fotos seguidas la app guarda todo, recarga la cámara y sigue en el mismo cuadro.
- Si una marca no se puede guardar (por ejemplo, sin espacio), aparece un aviso rojo que hay que cerrar; se reintenta una vez antes de avisar.
