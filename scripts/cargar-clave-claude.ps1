<#
 Carga ANTHROPIC_API_KEY en el .env del SERVIDOR sin mostrarla, sin guardarla en Git y sin ponerla en argumentos ni en el historial.

 Uso (con la VPN activa, desde la carpeta del proyecto):
   .\scripts\cargar-clave-claude.ps1
   .\scripts\cargar-clave-claude.ps1 -Servidor infogred@192.168.22.19 -Carpeta '~/seguimiento-sgred/app'

 Qué hace, en orden, y se detiene en el primer fallo (cada paso comprueba el código de salida de SSH o de Docker):
   1. Verifica la carpeta del despliegue y que el Compose del servidor YA inyecta ANTHROPIC_API_KEY en el servicio api
      (si no, indica que primero debe desplegarse la versión actualizada). No imprime ningún valor.
   2. Pide la clave con entrada oculta, valida su formato y la envía por la entrada estándar de SSH (nunca por la línea de comandos).
   3. La escribe en el .env del servidor con permisos 600 y borra el archivo temporal.
   4. Recrea solo el servicio api (no toca la base de datos ni los demás servicios).
   5. Hace una solicitud MÍNIMA al modelo configurado (8 tokens de salida) y muestra solo el código HTTP y si el modelo respondió.
      Solo con HTTP 200 en ese paso se puede afirmar que la clasificación asistida está operativa.
#>
param(
  [string]$Servidor = "infogred@192.168.22.19",
  [string]$Carpeta = "~/seguimiento-sgred/app"
)
$ErrorActionPreference = "Stop"
$ssh = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15")
$compose = "docker compose -f docker-compose.yml -f docker-compose.produccion.yml"

function Invoke-Remoto {
  param([string]$Etapa, [string]$Script, [string]$Entrada = $null)
  $texto = ($Script -replace "`r", "") + "`n# fin`n"
  $texto | & ssh @ssh $Servidor "cd $Carpeta && bash -s"
  if ($LASTEXITCODE -ne 0) { throw "Falló el paso '$Etapa' (código de salida $LASTEXITCODE). No se continuó." }
}

# 1) Verificación previa: carpeta, Compose actualizado y estado del servicio api. No se imprime ningún secreto.
Write-Host "1/5 Verificando la carpeta del despliegue y el Compose del servidor..."
Invoke-Remoto "verificación previa" @'
set -e
test -f docker-compose.yml || { echo "No existe docker-compose.yml en $(pwd)."; exit 11; }
test -f docker-compose.produccion.yml || { echo "Falta docker-compose.produccion.yml."; exit 12; }
test -f .env || { echo "Falta el .env del servidor."; exit 13; }
DOCKER_COMPOSE="docker compose -f docker-compose.yml -f docker-compose.produccion.yml"
$DOCKER_COMPOSE config 2>/dev/null | grep -q "ANTHROPIC_API_KEY" || { echo "El Compose del servidor aún NO inyecta ANTHROPIC_API_KEY en el servicio api: despliegue primero la versión actualizada."; exit 14; }
$DOCKER_COMPOSE ps --status running api 2>/dev/null | grep -q api || { echo "El servicio api no está en ejecución."; exit 15; }
echo "Carpeta: $(pwd)"
echo "Versión: $(git rev-parse --short HEAD 2>/dev/null || echo desconocida)"
echo "Compose actualizado: sí. Servicio api: en ejecución."
'@

# 2) Clave con entrada oculta.
$segura = Read-Host "2/5 Clave de la API de Anthropic (no se muestra)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try {
  $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ($clave -notmatch '^sk-ant-[A-Za-z0-9_-]{20,}$') { throw "El valor no tiene el formato de una clave de Anthropic. No se envió nada." }
  # La clave viaja solo por la entrada estándar y queda en un archivo temporal 600 que el paso siguiente consume y borra.
  $clave | & ssh @ssh $Servidor "cd $Carpeta && umask 077 && cat > .clave-anthropic.tmp"
  if ($LASTEXITCODE -ne 0) { throw "No se pudo transferir la clave (código de salida $LASTEXITCODE)." }
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $clave = $null
}

# 3) Escritura en el .env (permisos 600) y borrado del temporal.
Write-Host "3/5 Guardando la clave en el .env del servidor (permisos 600)..."
Invoke-Remoto "escritura del .env" @'
set -e
umask 077
CLAVE=$(tr -d '\r\n' < .clave-anthropic.tmp)
rm -f .clave-anthropic.tmp
test -n "$CLAVE" || { echo "El archivo temporal estaba vacío."; exit 21; }
grep -v '^ANTHROPIC_API_KEY=' .env > .env.nuevo || true
printf 'ANTHROPIC_API_KEY=%s\n' "$CLAVE" >> .env.nuevo
mv .env.nuevo .env
chmod 600 .env
unset CLAVE
echo "Clave guardada."
'@

# 4) Recrear solo el servicio api.
Write-Host "4/5 Reiniciando solo el servicio api..."
Invoke-Remoto "reinicio del servicio api" @'
set -e
docker compose -f docker-compose.yml -f docker-compose.produccion.yml up -d --no-deps api
for i in 1 2 3 4 5 6 7 8 9 10; do
  docker compose -f docker-compose.yml -f docker-compose.produccion.yml ps --status running api | grep -q api && break
  sleep 3
done
docker compose -f docker-compose.yml -f docker-compose.produccion.yml ps --status running api | grep -q api || { echo "El servicio api no quedó en ejecución."; exit 31; }
echo "Servicio api en ejecución."
'@

# 5) Solicitud mínima al modelo configurado: solo se imprime el código HTTP y el tipo de error, nunca la clave ni el contenido.
Write-Host "5/5 Probando una solicitud mínima al modelo configurado..."
$prueba = @'
const { claudeModelo, claudeApiKey } = require('/app/dist/src/contratacion/contratacion.config');
const modelo = claudeModelo();
const clave = claudeApiKey();
if (!clave) { console.log('El servicio api no ve la clave (revise el Compose y el .env).'); process.exit(41); }
fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: modelo, max_tokens: 8, messages: [{ role: 'user', content: 'Responde solo: ok' }] }),
}).then(async (r) => {
  const j = await r.json().catch(() => ({}));
  console.log('Modelo configurado:', modelo);
  console.log('HTTP', r.status, r.ok ? '- el modelo respondió' : '- ' + (j && j.error && j.error.type ? j.error.type : 'error'));
  process.exit(r.ok ? 0 : 42);
}).catch(() => { console.log('Sin conexión con api.anthropic.com desde el servidor.'); process.exit(43); });
'@
$prueba = ($prueba -replace "`r", "") + "`n"
$prueba | & ssh @ssh $Servidor "cd $Carpeta && $compose exec -T api node -"
if ($LASTEXITCODE -ne 0) { throw "La solicitud mínima al modelo falló (código de salida $LASTEXITCODE). La clasificación asistida NO está operativa; la clave quedó guardada y puede volver a ejecutar este script." }
Write-Host "Listo: la clave está cargada y el modelo respondió. Para ver el consumo: la actualización del índice usa la clave solo para lo que la lectura nativa no resuelve."
