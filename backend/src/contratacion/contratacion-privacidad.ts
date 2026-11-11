/**
 * Barrera de privacidad: se ejecuta sobre el texto EXACTO de cada solicitud, después de todas las transformaciones (depuración, selección de
 * fragmentos, armado de la solicitud). Si detecta algo que debía haberse suprimido, la solicitud NO se envía. Solo devuelve tipos y recuentos:
 * nunca devuelve ni registra el texto detectado.
 * Es independiente de `depurar()`: comprueba el resultado con sus propios patrones y añade casos que `depurar()` no suprime (pasaporte, tarjeta profesional).
 */
export interface HallazgoPrivacidad { tipo: string; cantidad: number }

const NOMBRE = String.raw`(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ]{2,})`;
const NOMBRES = String.raw`${NOMBRE}(?:\s+${NOMBRE}){1,3}`;
// Cifras con formato de documento de identidad: 1.234.567.890, 1 234 567, 1234567…
const CIFRA_ID = String.raw`(?:\d{1,3}(?:[.\s]\d{3}){2,}|\d{7,})`;

/**
 * Teléfonos colombianos. Separadores: espacios, guiones y saltos de línea (nunca puntos ni comas: así no se confunden con importes).
 * - Con prefijo (+57, (57), 0057): código de área o móvil de 1 a 3 dígitos y 7 u 8 dígitos más, agrupados 3-3-2-2, 3-3-4 o 3-4.
 * - Móvil sin prefijo (3xx): 3-3-4 o 3-3-2-2.
 * Un número precedido o seguido de dígitos, puntos o comas (importes, números de proceso) no coincide.
 */
export const reTelefonoConPrefijo = () => /(?<![\d.,])(?:\+\s?57|\(\s?\+?57\s?\)|00\s?57)[\s-]{0,3}\(?\d{1,3}\)?[\s-]{0,3}\d{3}[\s-]{0,3}\d{2}[\s-]{0,3}\d{2}(?!\d|[.,]\d)/g;
export const reMovilSinPrefijo = () => /(?<![\d.,])3\d{2}[\s-]{0,3}\d{3}[\s-]{0,3}\d{2}[\s-]{0,3}\d{2}(?!\d|[.,]\d)/g;

const PATRONES: Array<[string, RegExp]> = [
  ['correo', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['movil', reMovilSinPrefijo()],
  ['telefono_con_prefijo', reTelefonoConPrefijo()],
  ['documento_identidad', new RegExp(String.raw`\b(?:c\.?\s?c\.?|c[eé]dula(?:\s+de\s+ciudadan[ií]a)?|identificaci[oó]n|documento(?:\s+de\s+identidad)?|identificad[oa]\s+con|nit)\s*[#:]?\s*(?:n[oº°.]*\s*)?${CIFRA_ID}`, 'gi')],
  ['documento_extranjero_o_profesional', new RegExp(String.raw`\b(?:pasaporte|carn[eé]|tarjeta\s+profesional|t\.\s?p\.)\s*[#:]?\s*(?:n[oº°.]*\s*)?[A-Za-z]{0,3}\d{4,}`, 'gi')],
  ['matricula_profesional', /matr[ií]cula\s+profesional\s*(?:n[oº°.]*\s*)?[A-Za-z0-9]/gi],
  ['nombre_inspector', /inspector\s+nombre\s+(?!\[nombre\])\S/gi],
  ['nombre_tras_tratamiento', new RegExp(String.raw`\b(?:Doctor|DOCTOR|doctor|Doctora|DOCTORA|doctora|Dr\.|Dra\.|Se[ñn]or|SE[ÑN]OR|se[ñn]or|Se[ñn]ora|SE[ÑN]ORA|se[ñn]ora|Ingeniero|ingeniero|Ingeniera|ingeniera|Arquitecto|arquitecto|Arquitecta|arquitecta|Abogado|abogado|Abogada|abogada)\s+${NOMBRES}`, 'g')],
  ['nombre_antes_de_identificacion', new RegExp(String.raw`${NOMBRES}\s*,?\s*(?:identificad[oa]\s+con\s+)?\[documento de identidad\]`, 'g')],
  ['firmante_con_cargo', new RegExp(String.raw`\bnombre\s*:\s*(?!\[nombre\])${NOMBRES}\s+cargo\b`, 'gi')],
];

export function verificarPrivacidad(texto: string): HallazgoPrivacidad[] {
  const out: HallazgoPrivacidad[] = [];
  for (const [tipo, re] of PATRONES) {
    re.lastIndex = 0;
    const cantidad = (texto.match(re) ?? []).length;
    if (cantidad > 0) out.push({ tipo, cantidad });
  }
  return out;
}

/** Texto exacto de una solicitud: lo único que sale hacia la API. */
export function textoDeSolicitud(s: { system: string; tools: unknown[]; messages: Array<{ content: string }> }): string {
  return [s.system, JSON.stringify(s.tools), ...s.messages.map((m) => m.content)].join('\n');
}
