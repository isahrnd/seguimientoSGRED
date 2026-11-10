<#
 Carga ANTHROPIC_API_KEY en el .env del SERVIDOR, sin mostrarla, sin guardarla en Git y sin pasarla por la línea de comandos.
 Uso (desde esta carpeta, con la VPN activa):
   .\scripts\cargar-clave-claude.ps1 -Servidor infogred@192.168.22.19
 La clave se pide con entrada oculta, viaja por la entrada estándar de SSH y se escribe en el .env con permisos 600.
 Después reinicia solo el servicio api y comprueba la conexión (imprime únicamente el código HTTP).
#>
param(
  [string]$Servidor = "infogred@192.168.22.19",
  [string]$Carpeta = "~/seguimiento-sgred/app"
)
$ErrorActionPreference = "Stop"
$segura = Read-Host "Clave de la API de Anthropic (no se muestra)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try {
  $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ($clave -notmatch '^sk-ant-[A-Za-z0-9_-]{20,}$') { throw "El valor no tiene el formato de una clave de Anthropic. No se envió nada." }
  # El script remoto lee la clave de la entrada estándar; nunca aparece en argumentos ni en el historial.
  $remoto = @'
set -e
cd __CARPETA__
IFS= read -r CLAVE
umask 077
touch .env
grep -v '^ANTHROPIC_API_KEY=' .env > .env.nuevo || true
printf 'ANTHROPIC_API_KEY=%s\n' "$CLAVE" >> .env.nuevo
mv .env.nuevo .env
chmod 600 .env
unset CLAVE
echo "Clave guardada en .env (permisos 600)."
'@.Replace("__CARPETA__", $Carpeta).Replace("`r", "")
  $clave | ssh $Servidor $remoto
  if ($LASTEXITCODE -ne 0) { throw "No se pudo guardar la clave en el servidor." }
} finally {
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  $clave = $null
}
Write-Host "Reiniciando solo el servicio api..."
ssh $Servidor "cd $Carpeta && docker compose -f docker-compose.yml -f docker-compose.produccion.yml up -d api"
Write-Host "Probando la conexión (solo se muestra el código HTTP)..."
$prueba = @'
cd __CARPETA__
docker compose -f docker-compose.yml -f docker-compose.produccion.yml exec -T api node -e "fetch('https://api.anthropic.com/v1/models',{headers:{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'}}).then(r=>console.log('HTTP',r.status)).catch(()=>console.log('Sin conexión'))"
'@.Replace("__CARPETA__", $Carpeta).Replace("`r", "")
ssh $Servidor $prueba
Write-Host "HTTP 200 = la clave funciona. 401 = clave rechazada; vuelva a ejecutar el script."
