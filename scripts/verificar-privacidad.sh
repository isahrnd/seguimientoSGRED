#!/usr/bin/env bash
# Falla si el repositorio (cambios preparados, árbol e historial) contiene archivos privados o secretos.
# No imprime contenido: solo rutas y recuentos. Uso: scripts/verificar-privacidad.sh   (también como pre-push)
set -u
fallo=0
PROHIBIDAS='\.(pdf|xlsx?|docx?|zip|tar|gz|bak|dump|pem|key|p12)$|(^|/)\.env($|\.)|\.drive-token|client_secret|credenciales|(^|/)(importaciones|contrataciones|privados-local|capturas)/|\.log$'
PERMITIDAS='\.env\.example$'
echo "1) Rutas prohibidas en el historial y el índice"
rutas=$( { git log --all --name-only --format=; git diff --cached --name-only; } | sort -u | grep -E "$PROHIBIDAS" | grep -vE "$PERMITIDAS" )
if [ -n "$rutas" ]; then echo "$rutas" | sed 's/^/   PROHIBIDA: /'; fallo=1; else echo "   ninguna"; fi
echo "2) Valores de secretos locales en cualquier revisión (solo recuentos)"
revs=$(git rev-list --all)
for k in SEGUIMIENTO_DRIVE_CLIENT_SECRET SEGUIMIENTO_DRIVE_CLIENT_ID POSTGRES_PASSWORD; do
  v=$(grep -E "^$k=" .env 2>/dev/null | cut -d= -f2-)
  [ -z "$v" ] && continue
  n=$(git grep -lIF -e "$v" $revs -- . 2>/dev/null | wc -l)
  echo "   $k: $n archivos"; [ "$n" -gt 0 ] && fallo=1
done
echo "3) Patrones de credenciales"
n=$(git grep -lIE 'GOCSPX-|sk-ant-[A-Za-z0-9_-]{20,}|["= :]1//0[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY' $revs -- . ':!*package-lock.json' ':!scripts/verificar-privacidad.sh' 2>/dev/null | wc -l)
echo "   coincidencias: $n"; [ "$n" -gt 0 ] && fallo=1
[ $fallo -eq 0 ] && echo "OK: nada privado detectado" || echo "FALLA: revise las rutas indicadas antes de publicar"
exit $fallo
