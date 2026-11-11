/**
 * Sustituto de pdf-parse SOLO para las pruebas de integración: devuelve el texto que el generador de PDF de la prueba escribió en
 * el contenido, sin pasar por pdf.js. Los PDF hechos a mano no son fiables en pdf.js (resultados distintos según el orden de lectura),
 * lo que producía fallos que no dependían de la lógica probada. La lectura con el lector real se cubre en contratacion-pdf-real.spec.ts.
 */
module.exports = async (buf: Buffer, opts?: { pagerender?: (p: any) => Promise<unknown> }) => {
  const m = /\(([^)]*)\) Tj/.exec(Buffer.from(buf).toString('latin1'));
  const texto = m ? m[1] : '';
  if (opts?.pagerender) await opts.pagerender({ getTextContent: async () => ({ items: [{ str: texto }] }) });
  return { text: `\n\n${texto}`, numpages: 1 };
};
