# Privacidad de la lectura asistida (Claude API)

Este documento no contiene datos de personas ni de contratos: solo describe controles y hechos operativos.

## Qué se envía y qué se suprime
- A la API solo se envían los fragmentos de página necesarios (con su número de página), no el documento completo.
- Antes de enviar, `depurar()` suprime: correos, documentos de identidad (`C.C.`, cédula, identificación, NIT de personas; con `#` o `:` y separadores), teléfonos móviles, cuentas bancarias, líneas de firma, el nombre de la persona natural que antecede a su documento y el nombre del inspector en los informes ATC-20.
- **No** se suprimen, porque son necesarios para identificar el contrato: números de proceso y de contrato, importes, nombre del contratista y de su representante legal, direcciones de edificaciones y datos de contacto de empresas.
- Las citas que se guardan en la base pasan otra vez por `depurar()`. El texto completo de los documentos no se guarda en las extracciones.
- Las respuestas del modelo solo se aceptan si su cita consta en la página enviada; la confianza declarada no publica nada.

## Registros locales
- Los registros del servicio (`api`) solo contienen recuentos (documentos, llamadas, tokens). Comprobado el 2026-11-11: sin identificaciones, nombres de las personas del piloto ni claves.
- Tablas con contenido derivado: `tbl_contratacion_ia_extracciones` (campos validados con cita corta), `tbl_contratacion_areas` y `tbl_contratacion_doc_sugerencias`. Se comprobó que no conservan identificaciones.
- Las llamadas quedan registradas (fecha, versión, tokens) en `tbl_contratacion_ia_llamadas`, sin contenido.

## Solicitudes afectadas (piloto del 2026-11-11)
Dos de las ocho solicitudes registradas se enviaron antes de que el filtro cubriera estos formatos:
- Solicitud 2 (informe ATC-20): incluía el número de identificación del inspector y su nombre.
- Solicitud 3 (contrato de servicios): incluía el documento de identidad de la persona natural contratista y su nombre.

Las solicitudes 4 a 8 se enviaron con los números de identidad suprimidos; en esas, el nombre del inspector y el de la persona natural del contrato se enviaron hasta que se añadió su supresión (versión del extractor `ia-5`, 2026-11-11). Ninguna lectura almacenada conserva esos datos: se purgaron y se regeneraron con el filtro corregido.

## Retención en el proveedor
- Borrar registros locales **no** elimina lo que ya se envió a Anthropic.
- Según la documentación oficial (API and data retention): el contenido de las solicitudes y respuestas no se retiene por defecto, salvo en los «Covered Models» (Fable y Mythos), que exigen 30 días. `claude-sonnet-5-5` no figura entre ellos. Existe un acuerdo de retención cero (ZDR) que se solicita al equipo comercial de Anthropic; hay excepciones por obligación legal y por seguridad (contenido marcado).
- La documentación consultada no describe un procedimiento autoservicio para borrar solicitudes concretas de la API. Acción recomendada: pedir por escrito a Anthropic (soporte o cuenta) la confirmación de retención para la organización y, si procede, la eliminación de las solicitudes 2 y 3 indicando su fecha y hora (UTC), y valorar el acuerdo ZDR antes de activar el procesamiento automático.

## Control operativo
- El procesamiento automático con IA está pausado (`SEGUIMIENTO_CLAUDE_AUTOMATICO=false`). Solo se ejecuta de forma manual y explícita sobre versiones concretas.
