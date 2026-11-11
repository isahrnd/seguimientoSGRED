# Privacidad de la lectura asistida (Claude API)

Este documento no contiene datos de personas ni de contratos: solo describe controles y hechos operativos.

## Qué se envía y qué se suprime
- A la API solo se envían los fragmentos de página necesarios (con su número de página), no el documento completo.
- `depurar()` suprime antes de enviar: correos, documentos de identidad (`C.C.`, cédula, identificación, NIT de personas; con `#` o `:` y separadores), teléfonos móviles de formato `3xx xxx xxxx`, cuentas bancarias y líneas de firma.
- **Nombres de personas:** desde la versión de extractor `ia-8` se suprimen el nombre de la persona natural que antecede a su documento (incluido «identificada con»), el del inspector en los informes ATC-20, el de firmantes junto a «Cargo», el que sigue a un tratamiento (doctor, señor, ingeniero, arquitecto, abogado…) y la matrícula profesional. **Las solicitudes 1 a 11 se enviaron sin esa supresión completa** (la solicitud 10 con filtros `ia-7`).
- **No se suprimen**, porque son necesarios para identificar el contrato: números de proceso y de contrato, importes, nombre del contratista y de su representante legal, direcciones de edificaciones y datos de contacto de empresas (incluidos teléfonos que no tienen formato de móvil).
- Las citas que se guardan en la base pasan otra vez por `depurar()`; el texto completo de los documentos no se guarda en las extracciones.
- Las respuestas del modelo solo se aceptan si su cita consta en la página enviada; la confianza declarada no publica nada.

## Registros locales
- Los registros del servicio (`api`) solo contienen recuentos. Comprobado el 2026-11-11: sin identificaciones, nombres de las personas del piloto ni claves.
- Tablas con contenido derivado: `tbl_contratacion_ia_extracciones` (campos validados con cita corta), `tbl_contratacion_areas` y `tbl_contratacion_doc_sugerencias`. Se comprobó que no conservan identificaciones.
- Cada llamada queda registrada (fecha, versión, tokens) en `tbl_contratacion_ia_llamadas`, sin contenido.

## Solicitudes del piloto del 2026-11-11 (8 registradas, UTC)
Se distinguen dos tipos de dato: **identificaciones** (números de documento de identidad) y **nombres de personas**.

| Solicitud | Documento | Identificaciones enviadas | Nombres de personas enviados |
|---|---|---|---|
| 1 (04:03) | cotización | no | sí (destinatario de la carta, contacto de la empresa) |
| 2 (04:03) | informe ATC-20 | **sí: número de identificación del inspector** | **sí: nombre del inspector** |
| 3 (04:03) | contrato de servicios | **sí: documento de identidad de la persona natural contratista** | **sí: contratista y firmantes** |
| 4 (04:06) | cotización | no | sí |
| 5 (04:07) | informe ATC-20 | no (suprimida) | **sí: nombre del inspector** |
| 6 (04:07) | contrato de servicios | no (suprimida) | **sí: contratista y firmantes** |
| 7 y 8 (04:32 y 04:34) | cotización | no | sí |
| 9 (05:35) | análisis del sector (86 págs.) | no verificado (el texto no se comprobó antes de enviar) | no verificado (el texto no se comprobó antes de enviar) |
| 10 (05:35) | resolución de demolición | no | **sí: nombre de un ingeniero y su matrícula profesional** (no cubiertos por el filtro de entonces) |
| 11 (05:35) | cotización de 16 páginas | no | no se detectaron en la comprobación posterior |

Además se hizo una solicitud directa con un documento ficticio escaneado, sin datos reales (no figura en la tabla de llamadas).
Ninguna lectura almacenada conserva identificaciones: las de las solicitudes 2 y 3 se purgaron y se regeneraron con el filtro corregido.

## Retención en el proveedor
- Borrar registros locales **no** elimina lo ya enviado a Anthropic.
- La documentación pública ([API and data retention](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention)) indica que el contenido de las solicitudes no se retiene por defecto, salvo en los «Covered Models» (Fable y Mythos, 30 días), entre los que no figura `claude-sonnet-5-5`, y que la retención cero (ZDR) se activa por organización a petición al equipo comercial.
- **Esa descripción general no verifica nuestra cuenta.** No consta que nuestra organización tenga ZDR ni qué condiciones, acuerdos o excepciones (por ejemplo, retención por controles de seguridad) le aplican. No debe afirmarse retención cero ni ausencia de retención hasta confirmarlo.
- Pendiente verificar con Anthropic o en la consola de la organización: (1) si hay ZDR u otro acuerdo de retención; (2) la retención efectiva de las solicitudes 2 y 3 (indicando fecha y hora UTC); (3) si procede, su eliminación. La documentación consultada no describe un borrado autoservicio por solicitud.
- Antes de activar el procesamiento automático, valorar ZDR y decidir si se amplía la supresión de nombres y datos de contacto.

## Control operativo
- El procesamiento automático con IA está pausado (`SEGUIMIENTO_CLAUDE_AUTOMATICO=false`); solo se ejecuta de forma manual sobre versiones concretas.
