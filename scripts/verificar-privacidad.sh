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
echo "4) Valores reales conocidos (lista local scripts/.valores-privados.local, no versionada): archivos en el árbol actual y en el historial"
LISTA="$(dirname "$0")/.valores-privados.local"
if [ -f "$LISTA" ]; then
  en_arbol=0; en_historial=0
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    a=$(git grep -lIiE -e "$pat" HEAD -- . ':!scripts/.valores-privados.local' 2>/dev/null | wc -l)
    h=$(git grep -lIiE -e "$pat" $revs -- . ':!scripts/.valores-privados.local' 2>/dev/null | sed 's/^[0-9a-f]*://' | sort -u | wc -l)
    en_arbol=$((en_arbol + a)); en_historial=$((en_historial + h))
  done < "$LISTA"
  echo "   en el árbol actual: $en_arbol archivo(s)-patrón | en el historial: $en_historial archivo(s)-patrón"
  [ "$en_arbol" -gt 0 ] && fallo=1
  [ "$en_historial" -gt 0 ] && echo "   AVISO: el historial publicado aún contiene valores reales (ver informe de alcance); no se considera limpio." && fallo_historial=1
else
  echo "   (no hay lista local: no se pudo comprobar este punto)"
fi
[ "${fallo_historial:-0}" -eq 1 ] && fallo=1
[ $fallo -eq 0 ] && echo "OK: nada privado detectado" || echo "FALLA: revise las rutas indicadas antes de publicar"
exit $fallo
