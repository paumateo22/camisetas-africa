# Camisetas de África

Votación pública de 160 camisetas de selecciones africanas, puntuadas del 1 al 5 en formato Tinder.

La página está alojada en GitHub Pages y los votos se guardan en una hoja de Google, a través de Apps Script.

## Qué hay

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página: votar (por defecto), ranking en directo y mis votos |
| `kits.js` | Las 160 camisetas en el orden de votación |
| `img/` | Las fotos |
| `config.js` | La URL del backend: es lo único que hay que tocar |
| `apps-script/Code.gs` | El backend que se pega en la hoja de Google |

## Montaje (unos 10 minutos)

### 1. Hoja de Google y script
1. Crea una hoja nueva en [sheets.new](https://sheets.new) y llámala, por ejemplo, «Votos camisetas».
2. Abre **Extensiones → Apps Script**, borra lo que haya y pega el contenido de `apps-script/Code.gs`. Guarda.
3. Elige la función `setup` en el desplegable de arriba y pulsa **Ejecutar**. Google te pedirá permisos sobre tu propia hoja: acéptalos. Al terminar aparecerán las pestañas *Personas* y *Votos*.
4. Pulsa **Implementar → Nueva implementación**. En el engranaje elige **Aplicación web** y rellena:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. Pulsa **Implementar** y copia la URL que termina en `/exec`.

### 2. Conectar la página
Pega esa URL en `config.js`:
```js
window.API_URL = "https://script.google.com/macros/s/XXXX/exec";
```

### 3. GitHub Pages
1. Crea un repositorio público, por ejemplo `camisetas-africa`, y sube todo el contenido de esta carpeta.
2. Ve a **Settings → Pages**, elige *Deploy from a branch*, la rama `main` y la carpeta `/ (root)`.
3. En un minuto estará en `https://<tu-usuario>.github.io/camisetas-africa/`.

## Cómo funciona
- Cada persona entra con su **nombre y un PIN de 4 cifras**. El nombre queda reservado: nadie puede votar con un nombre ajeno ni votar dos veces la misma camiseta. Si vuelve a votar una, se sustituye la nota anterior.
- Con nombre y PIN se puede seguir votando desde otro móvil, y en «Mis votos» se ven y se cambian las notas puestas.
- Las notas son: 1 nada, 2 no me gusta, 3 me da igual, 4 me gusta, 5 me encanta. Para pasar a la siguiente camiseta hay que votar la actual.
- El orden de votación es: primero las de 5★, después las de 4★ y luego las de 3★. Dentro de cada grupo, van por ranking FIFA y de la temporada más reciente a la más antigua.
- El ranking ordena por nota media y se actualiza solo cada 20 segundos. Puedes exigir un mínimo de votos.
- Si alguien olvida su PIN, en Apps Script escribe su nombre en la función `borrarPersona` y ejecútala. Se borran su usuario y sus votos.
- Si cambias `Code.gs`, ve a **Implementar → Gestionar implementaciones → editar → Versión nueva**. Así la URL no cambia.
