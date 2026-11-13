import PDFDocument = require('pdfkit');
import { LOGO_INFOGRED_PNG_BASE64 } from './logo-infogred';
import { cop, etiquetaConsolidado, ETQ_PROCEDENCIA, FilaEdificio, fechaCorteTexto, FuenteDato, OfertaEdificio } from './contratacion-vista-precios';

/**
 * Informe PDF (plantilla propia, independiente del diseño de pantalla): texto seleccionable, tablas con encabezado repetido, gráficos vectoriales,
 * numeración de páginas y fecha de corte. Usa los MISMOS datos y fórmulas de la vista por edificio (pantalla y Excel): no recalcula nada.
 */
const COLOR = { tinta: '#1B2433', gris: '#5B6577', linea: '#D5DBE5', fondo: '#F3F6FA', marca: '#1F3A5F', acento: '#3A6EA5', suave: '#EEF3F9', aviso: '#8A5A00' };
const M = 48; // margen
const FUENTE = 'Helvetica';
const NEGRITA = 'Helvetica-Bold';

export interface DatosInformeGeneral { fecha_corte: string | null; generado_en: string; filas: FilaEdificio[]; fuentes: Array<{ rotulo: string; documento: string; version_id: number }> }
export interface DatosInformeEdificio {
  fila: FilaEdificio; fecha_corte: string | null; generado_en: string;
  documentos: Array<{ grupo: string; nombre: string; version_id: number | null; formato: string; evidencias: Array<{ fuente_tipo: string; detalle: string }> }>;
  anexo: boolean;
}

export const fuenteTexto = (f: FuenteDato | null | undefined): string => {
  if (!f) return '';
  const donde = f.hoja && f.celda ? `hoja ${f.hoja}, celda ${f.celda}` : f.hoja ? `hoja ${f.hoja}` : f.pagina ? `p. ${f.pagina}` : '';
  return [f.documento, donde].filter(Boolean).join(', ');
};
const nfc = (t: string | null | undefined) => (t ?? '').normalize('NFC');
const m2 = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} m²`;
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' });

class Informe {
  readonly doc: PDFKit.PDFDocument;
  private readonly cuerpo: { arriba: number; abajo: number; ancho: number; izq: number };
  private encabezadoTabla: (() => void) | null = null;

  constructor(private readonly titulo: string, private readonly corte: string | null, private readonly generado: string) {
    this.doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: titulo, Author: 'Seguimiento SGRED', Subject: 'Informe de precios por edificio', Creator: 'Seguimiento SGRED' } });
    this.cuerpo = { arriba: M + 34, abajo: 842 - M - 24, ancho: 595 - 2 * M, izq: M };
    this.doc.y = this.cuerpo.arriba;
  }

  get y() { return this.doc.y; }
  get ancho() { return this.cuerpo.ancho; }

  /** Salto de página si no cabe `alto` puntos; repite el encabezado de la tabla en curso. */
  espacio(alto: number) {
    if (this.doc.y + alto > this.cuerpo.abajo) {
      this.doc.addPage();
      this.doc.y = this.cuerpo.arriba;
      if (this.encabezadoTabla) this.encabezadoTabla();
    }
  }

  /** Altura máxima que un bloque «atómico» (tabla o gráfica corta) puede ocupar: si cabe en una página, nunca se parte. */
  private static readonly ATOMICO_MAX = 600;
  /** Títulos pendientes: se dibujan junto con el contenido que les sigue (nunca quedan solos al final de una página). */
  private pendientes: Array<{ n: 1 | 2; t: string }> = [];
  private static readonly ALTO_TITULO = { 1: 40, 2: 24 } as const;

  private altoPendientes() { return this.pendientes.reduce((a, p) => a + Informe.ALTO_TITULO[p.n], 0); }

  /** Dibuja los títulos pendientes asegurando que quepan JUNTO con `altoContenido` del bloque que sigue. */
  private soltarTitulos(altoContenido: number) {
    if (!this.pendientes.length) return;
    this.espacio(this.altoPendientes() + altoContenido);
    for (const p of this.pendientes) {
      if (p.n === 1) { this.doc.y += 8; this.escribir(p.t, { size: 13, bold: true, color: COLOR.marca, gap: 2 }); this.linea(); this.doc.y += 6; }
      else { this.doc.y += 4; this.escribir(p.t, { size: 10.5, bold: true, color: COLOR.marca, gap: 4 }); }
    }
    this.pendientes = [];
  }

  private escribir(t0: string, o: { size?: number; bold?: boolean; color?: string; gap?: number; width?: number; align?: 'left' | 'right' | 'center'; x?: number } = {}) {
    const d = this.doc;
    const t = nfc(t0);
    d.font(o.bold ? NEGRITA : FUENTE).fontSize(o.size ?? 9.5).fillColor(o.color ?? COLOR.tinta);
    const w = o.width ?? this.cuerpo.ancho;
    const alto = d.heightOfString(t, { width: w, align: o.align });
    this.espacio(alto + (o.gap ?? 4));
    d.text(t, o.x ?? this.cuerpo.izq, d.y, { width: w, align: o.align });
    d.y += o.gap ?? 4;
  }

  texto(t0: string, o: { size?: number; bold?: boolean; color?: string; gap?: number; width?: number; align?: 'left' | 'right' | 'center'; x?: number } = {}) {
    if (this.pendientes.length) {
      const d = this.doc;
      d.font(o.bold ? NEGRITA : FUENTE).fontSize(o.size ?? 9.5);
      this.soltarTitulos(Math.min(d.heightOfString(nfc(t0), { width: o.width ?? this.cuerpo.ancho, align: o.align }) + (o.gap ?? 4), 90));
    }
    this.escribir(t0, o);
  }

  titulo1(t: string) { this.pendientes.push({ n: 1, t }); }
  titulo2(t: string) { this.pendientes.push({ n: 2, t }); }
  linea(color = COLOR.linea) { const y = this.doc.y; this.doc.moveTo(this.cuerpo.izq, y).lineTo(this.cuerpo.izq + this.cuerpo.ancho, y).lineWidth(0.6).strokeColor(color).stroke(); this.doc.y = y + 2; }

  /**
   * Tabla con encabezado repetido en cada página. Si cabe en una página se imprime completa (nunca se parte); si es más larga, se reparte sin dejar una sola
   * fila sola en la última página ni el encabezado solo al final de una página. Los títulos pendientes viajan con su primera fila.
   */
  tabla(cols: Array<{ t: string; w: number; a?: 'left' | 'right' | 'center' }>, filas0: Array<Array<string>>, o: { size?: number; negritas?: number[]; fondos?: Array<string | null> } = {}) {
    const filas = filas0.map((f) => f.map((c) => nfc(c)));
    const d = this.doc; const size = o.size ?? 8.5; const pad = 4;
    const total = cols.reduce((a, c) => a + c.w, 0);
    const esc = this.cuerpo.ancho / total;
    const anchos = cols.map((c) => c.w * esc);
    d.font(NEGRITA).fontSize(size);
    const hCab = Math.max(...cols.map((c, i) => d.heightOfString(c.t, { width: anchos[i] - 2 * pad }))) + 2 * pad - 2;
    d.font(FUENTE).fontSize(size);
    const alturas = filas.map((f) => Math.max(...f.map((t, i) => d.heightOfString(t ?? '', { width: anchos[i] - 2 * pad }))) + 2 * pad - 1 + 1);
    const dibujarEncabezado = () => {
      const y = d.y; let x = this.cuerpo.izq;
      d.rect(this.cuerpo.izq, y, this.cuerpo.ancho, hCab).fill(COLOR.fondo);
      cols.forEach((c, i) => { d.fillColor(COLOR.marca).font(NEGRITA).fontSize(size).text(c.t, x + pad, y + pad - 1, { width: anchos[i] - 2 * pad, align: c.a ?? 'left' }); x += anchos[i]; });
      d.y = y + hCab;
      d.moveTo(this.cuerpo.izq, d.y).lineTo(this.cuerpo.izq + this.cuerpo.ancho, d.y).lineWidth(0.8).strokeColor(COLOR.marca).stroke();
    };
    const sumar = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const alturaTotal = hCab + sumar(alturas);
    const atomica = alturaTotal <= Informe.ATOMICO_MAX;
    // Contenido que debe acompañar a los títulos: toda la tabla si es atómica; si no, el encabezado y las dos primeras filas.
    this.soltarTitulos(atomica ? alturaTotal : hCab + sumar(alturas.slice(0, 2)));
    if (atomica) this.espacio(alturaTotal);
    else this.espacio(hCab + sumar(alturas.slice(0, 2)));

    // Reparto por páginas (simulación): se evita dejar una sola fila en la última página.
    const cortes: number[] = []; // índices de fila donde empieza una página nueva
    if (!atomica) {
      let libre = this.cuerpo.abajo - d.y - hCab;
      const capacidad = this.cuerpo.abajo - this.cuerpo.arriba - hCab;
      for (let i = 0; i < filas.length; i++) {
        if (alturas[i] > libre) { cortes.push(i); libre = capacidad; }
        libre -= alturas[i];
      }
      const ultimo = cortes[cortes.length - 1];
      if (cortes.length && filas.length - ultimo === 1 && ultimo - (cortes[cortes.length - 2] ?? 0) >= 3) cortes[cortes.length - 1] = ultimo - 1;
    }
    this.encabezadoTabla = dibujarEncabezado;
    dibujarEncabezado();
    filas.forEach((f, fi) => {
      if (cortes.includes(fi)) { d.addPage(); d.y = this.cuerpo.arriba; dibujarEncabezado(); }
      const h = alturas[fi] - 1;
      const y = d.y; let x = this.cuerpo.izq;
      if (o.fondos?.[fi]) d.rect(this.cuerpo.izq, y, this.cuerpo.ancho, h).fill(o.fondos[fi]!);
      f.forEach((t, i) => { d.fillColor(COLOR.tinta).font(o.negritas?.includes(i) ? NEGRITA : FUENTE).fontSize(size).text(t ?? '', x + pad, y + pad - 1, { width: anchos[i] - 2 * pad, align: cols[i].a ?? 'left' }); x += anchos[i]; });
      d.y = y + h;
      d.moveTo(this.cuerpo.izq, d.y).lineTo(this.cuerpo.izq + this.cuerpo.ancho, d.y).lineWidth(0.3).strokeColor(COLOR.linea).stroke();
    });
    this.encabezadoTabla = null;
    d.y += 6;
  }

  /** Barras horizontales (vectoriales): etiqueta, barra proporcional al valor y cifra. Una gráfica que cabe en una página nunca se parte. */
  barras(titulo: string, datos: Array<{ etiqueta: string; valor: number; nota?: string; color?: string }>) {
    if (!datos.length) return;
    const d = this.doc; const maxV = Math.max(...datos.map((x) => x.valor));
    const wEtq = 150; const wCifra = 92; const wBarra = this.cuerpo.ancho - wEtq - wCifra - 8; const h = 15; const paso = h + 5;
    const alto = 26 + datos.length * paso + 2;
    const atomica = alto <= Informe.ATOMICO_MAX;
    this.soltarTitulos(atomica ? alto : 26 + 6 * paso);
    this.espacio(atomica ? alto : 26 + 6 * paso);
    this.escribir(titulo, { size: 9.5, bold: true, gap: 6 });
    datos.forEach((x, i) => {
      // Una gráfica larga que se parte no deja una sola barra en la página nueva.
      if (!atomica && datos.length - i <= 2) this.espacio(paso * (datos.length - i));
      else this.espacio(paso);
      const y = d.y;
      d.font(FUENTE).fontSize(8.5).fillColor(COLOR.tinta).text(nfc(x.etiqueta), this.cuerpo.izq, y + 3, { width: wEtq - 6, height: h, ellipsis: true, lineBreak: false });
      const w = Math.max(1.5, (x.valor / maxV) * wBarra);
      d.rect(this.cuerpo.izq + wEtq, y + 1, w, h - 2).fill(x.color ?? COLOR.acento);
      d.font(NEGRITA).fontSize(8.5).fillColor(COLOR.tinta).text(cop(x.valor), this.cuerpo.izq + wEtq + wBarra + 8, y + 3, { width: wCifra, align: 'right', lineBreak: false });
      d.y = y + paso;
    });
    d.y += 2;
  }

  /** Recuadro de datos clave (cuatro columnas). */
  datosClave(items: Array<{ etiqueta: string; valor: string; detalle?: string }>) {
    const d = this.doc; const n = items.length; const gap = 8; const w = (this.cuerpo.ancho - gap * (n - 1)) / n;
    d.font(FUENTE).fontSize(8);
    const hDet = Math.max(...items.map((i) => (i.detalle ? d.heightOfString(i.detalle, { width: w - 16 }) : 0)));
    const h = 52 + hDet;
    this.soltarTitulos(h + 6);
    this.espacio(h + 6);
    const y = d.y;
    items.forEach((it, i) => {
      const x = this.cuerpo.izq + i * (w + gap);
      d.roundedRect(x, y, w, h, 5).lineWidth(0.7).strokeColor(COLOR.linea).fillAndStroke(COLOR.suave, COLOR.linea);
      d.font(FUENTE).fontSize(7.5).fillColor(COLOR.gris).text(it.etiqueta.toUpperCase(), x + 8, y + 8, { width: w - 16, lineBreak: false });
      d.font(NEGRITA).fontSize(it.valor.length > 16 ? 11 : 13).fillColor(COLOR.marca).text(nfc(it.valor), x + 8, y + 22, { width: w - 16, lineBreak: false });
      if (it.detalle) d.font(FUENTE).fontSize(8).fillColor(COLOR.gris).text(nfc(it.detalle), x + 8, y + 42, { width: w - 16 });
    });
    d.y = y + h + 8;
  }

  /** Encabezado y pie de cada página (con «Página i de n»). */
  cerrar(): void {
    this.pendientes = [];
    const d = this.doc; const rango = d.bufferedPageRange();
    const logo = Buffer.from(LOGO_INFOGRED_PNG_BASE64, 'base64');
    for (let i = 0; i < rango.count; i++) {
      d.switchToPage(rango.start + i);
      const margenAbajo = d.page.margins.bottom; d.page.margins.bottom = 0;
      d.image(logo, M, 24, { height: 18 });
      d.font(FUENTE).fontSize(8).fillColor(COLOR.gris).text(nfc(this.titulo), M + 120, 30, { width: 595 - 2 * M - 120, align: 'right', lineBreak: false });
      d.moveTo(M, 48).lineTo(595 - M, 48).lineWidth(0.6).strokeColor(COLOR.linea).stroke();
      d.moveTo(M, 842 - 40).lineTo(595 - M, 842 - 40).lineWidth(0.6).strokeColor(COLOR.linea).stroke();
      const pie = `${this.corte ? `Datos del consolidado: corte ${fechaCorteTexto(this.corte)} · ` : ''}Generado el ${fechaLarga(this.generado)}`;
      d.font(FUENTE).fontSize(7.5).fillColor(COLOR.gris).text(pie, M, 842 - 34, { width: 360, lineBreak: false });
      d.text(`Página ${i + 1} de ${rango.count}`, 595 - M - 120, 842 - 34, { width: 120, align: 'right', lineBreak: false });
      d.page.margins.bottom = margenAbajo;
    }
    d.end();
  }
}

const aBuffer = (inf: Informe): Promise<Buffer> => new Promise((ok, mal) => {
  const partes: Buffer[] = [];
  inf.doc.on('data', (c: Buffer) => partes.push(c));
  inf.doc.on('end', () => ok(Buffer.concat(partes)));
  inf.doc.on('error', mal);
  inf.cerrar();
});

const valorTexto = (f: FilaEdificio) => (f.valor ? cop(f.valor.valor) : f.contrato_conjunto ? 'Contrato conjunto' : '—');
const procedenciaTexto = (f: FilaEdificio) => (f.valor ? ETQ_PROCEDENCIA[f.valor.procedencia] : f.contrato_conjunto ? `Contrato ${/\.(\d{3})-\d{4}$/.exec(f.contrato_conjunto.proceso)?.[1] ?? ''}`.trim() : '');
const ETQ_FUENTE: Record<string, string> = { CARPETA: 'Carpeta de origen', PDF_PAGINA: 'Contenido del documento', HOJA_CELDA: 'Hoja de cálculo', ACLARACION: 'Aclaración', REVISION_PRIVADA: 'Revisión', RESOLUCION_CITADA: 'Resolución citada' };

// ------------------------------------------------------------------------------------------------ informe general
export async function informeGeneral(d: DatosInformeGeneral): Promise<Buffer> {
  const inf = new Informe('Análisis de precios por edificio', d.fecha_corte, d.generado_en);
  const doc = inf.doc;
  doc.font(NEGRITA).fontSize(20).fillColor(COLOR.marca).text('Análisis de precios por edificio', M, doc.y, { width: inf.ancho });
  doc.y += 2;
  inf.texto(d.fecha_corte ? `Información del consolidado de seguimiento con fecha de corte ${fechaCorteTexto(d.fecha_corte)}` : 'Información de contratación disponible', { size: 10, color: COLOR.gris, gap: 10 });

  const conValor = d.filas.filter((f) => f.valor).length;
  const conjunto = d.filas.filter((f) => f.contrato_conjunto).length;
  const respaldados = d.filas.filter((f) => f.documento_contractual === 'RESPALDADO').length;
  const consolidado = d.filas.filter((f) => f.valor?.procedencia === 'CONSOLIDADO').length;
  inf.titulo1('Resumen ejecutivo');
  inf.texto(`Se presentan ${d.filas.length} edificaciones. ${conValor} cuentan con un valor y su procedencia; ${conjunto} están cubiertas por un contrato conjunto, cuyo valor no se asigna a cada edificio.`, { gap: 5 });
  inf.texto(`Valores respaldados por contrato: ${respaldados}. Valores reportados en el consolidado: ${consolidado}. Los valores del consolidado son datos reportados: el estado «Contratado» no verifica un contrato firmado ni el avance un acta de terminación.`, { gap: 5 });
  inf.texto('El valor por m² se muestra como «reportado» cuando proviene del consolidado; solo se llama «Valor contratado por m²» cuando el importe contractual y la superficie documentada corresponden al mismo edificio.', { gap: 8 });

  inf.titulo1('Edificios');
  const conFondo: Array<string | null> = [];
  const filas = d.filas.map((f) => {
    conFondo.push(null);
    return [f.nombre, f.responsable?.nombre ?? '—', valorTexto(f), procedenciaTexto(f), f.area ? m2(f.area.valor) : 'Por precisar', f.valor_m2 ? `${cop(f.valor_m2.valor)}${f.valor_m2.clase === 'REPORTADO' ? ' (rep.)' : ''}` : '—', f.estado.etiqueta];
  });
  inf.tabla(
    [{ t: 'Edificio', w: 22 }, { t: 'Responsable', w: 12 }, { t: 'Valor', w: 14, a: 'right' }, { t: 'Procedencia', w: 13 }, { t: 'Área', w: 11, a: 'right' }, { t: 'Valor/m²', w: 13, a: 'right' }, { t: 'Estado', w: 15 }],
    filas, { size: 8, negritas: [0], fondos: conFondo },
  );
  inf.texto('«rep.» = valor por m² reportado en el consolidado. Procedencia: Contrato (respaldado por documento), Consolidado (reportado), Matriz, Presupuesto, Cotización.', { size: 8, color: COLOR.gris, gap: 8 });

  const conj = d.filas.filter((f) => f.contrato_conjunto);
  const vistos = new Set<string>();
  const contratos = conj.filter((f) => (vistos.has(f.contrato_conjunto!.proceso) ? false : (vistos.add(f.contrato_conjunto!.proceso), true)));
  if (contratos.length) {
    inf.titulo1('Contratos que cubren varios edificios');
    inf.tabla(
      [{ t: 'Proceso', w: 24 }, { t: 'Edificaciones', w: 12, a: 'right' }, { t: 'Valor del contrato', w: 18, a: 'right' }, { t: 'Fuente', w: 46 }],
      contratos.map((f) => [f.contrato_conjunto!.proceso, String(f.contrato_conjunto!.edificios), cop(f.contrato_conjunto!.valor), fuenteTexto(f.contrato_conjunto!.soporte)]),
      { size: 8 },
    );
    inf.texto('El valor de un contrato conjunto corresponde a todas sus edificaciones; no se divide sin un desglose documentado.', { size: 8, color: COLOR.gris, gap: 6 });
  }

  const dif = d.filas.filter((f) => f.diferencias.length);
  if (dif.length) {
    inf.titulo1('Diferencias entre fuentes');
    for (const f of dif) for (const t of f.diferencias) inf.texto(`${f.nombre}: ${t}`, { size: 8.5, gap: 4 });
  }
  const conM2 = d.filas.filter((f) => f.valor_m2);
  if (conM2.length) {
    inf.titulo1('Valor por m²');
    inf.barras('Valor por m² por edificio (cada barra indica si es contratado o reportado en el consolidado)', conM2.map((f) => ({ etiqueta: `${f.nombre}${f.valor_m2!.clase === 'REPORTADO' ? ' (rep.)' : ''}`, valor: f.valor_m2!.valor, color: f.valor_m2!.clase === 'CONTRATADO' ? COLOR.marca : COLOR.acento })));
    inf.texto('No se compara el valor por m² entre edificios con alcances distintos (demolición, transporte, alquiler de equipos); es un indicador por edificio con su fuente.', { size: 8, color: COLOR.gris, gap: 6 });
  }

  if (d.fuentes.length) {
    inf.titulo1('Fuentes');
    for (const s of d.fuentes) inf.texto(`${s.rotulo}: ${s.documento} (versión ${s.version_id})`, { size: 8.5, gap: 3 });
  }
  return aBuffer(inf);
}

// ------------------------------------------------------------------------------------------------ informe de un edificio
const ETQ_NIVEL_ITEM: Record<string, string> = { PARTIDA: 'Actividad' };

export async function informeEdificio(d: DatosInformeEdificio): Promise<Buffer> {
  const f = d.fila;
  const inf = new Informe(`Informe del edificio — ${f.nombre}`, d.fecha_corte, d.generado_en);
  const doc = inf.doc;
  doc.font(NEGRITA).fontSize(20).fillColor(COLOR.marca).text(f.nombre, M, doc.y, { width: inf.ancho });
  doc.y += 2;
  inf.texto([f.direccion, d.fecha_corte ? `Fecha de corte del consolidado: ${fechaCorteTexto(d.fecha_corte)}` : null].filter(Boolean).join('  ·  '), { size: 10, color: COLOR.gris, gap: 10 });

  inf.datosClave([
    { etiqueta: f.valor?.procedencia === 'CONTRATO' ? 'Valor contratado' : 'Valor reportado', valor: f.valor ? cop(f.valor.valor) : f.contrato_conjunto ? 'Contrato conjunto' : 'Por documentar', detalle: f.valor ? `${f.valor.etiqueta}` : f.contrato_conjunto ? `${cop(f.contrato_conjunto.valor)} · ${f.contrato_conjunto.edificios} edificaciones` : undefined },
    { etiqueta: 'Área', valor: f.area ? m2(f.area.valor) : 'Por precisar', detalle: f.area ? f.area.etiqueta : undefined },
    { etiqueta: f.valor_m2?.clase === 'CONTRATADO' ? 'Valor contratado por m²' : 'Valor por m²', valor: f.valor_m2 ? cop(f.valor_m2.valor) : 'Por precisar', detalle: f.valor_m2 ? (f.valor_m2.clase === 'REPORTADO' ? 'Reportado (consolidado)' : 'Contrato ÷ área documentada') : undefined },
    { etiqueta: 'Responsable', valor: f.responsable?.nombre ?? 'Por identificar', detalle: f.responsable?.etiqueta },
  ]);

  inf.titulo1('Resumen ejecutivo');
  inf.texto(`Estado: ${f.estado.etiqueta}${f.estado.avance ? ` · avance ${f.estado.avance.toLowerCase()} (según consolidado)` : ''}.`, { gap: 4 });
  for (const m of f.mensajes) inf.texto(`• ${m}`, { size: 9, gap: 2 });
  if (f.valor?.procedencia === 'CONSOLIDADO') inf.texto('El valor proviene del consolidado de seguimiento; no se ha verificado un contrato firmado para este edificio con los documentos disponibles.', { size: 9, color: COLOR.gris, gap: 4 });
  if (f.contrato_conjunto) inf.texto(f.contrato_conjunto.nota, { size: 9, color: COLOR.gris, gap: 4 });
  if (f.valores_alternos.length) {
    inf.titulo2('Otras cifras disponibles (fuentes distintas; no se suman)');
    inf.tabla([{ t: 'Fuente', w: 30 }, { t: 'Valor', w: 18, a: 'right' }, { t: 'Documento', w: 52 }], f.valores_alternos.map((v) => [v.etiqueta, cop(v.valor), fuenteTexto(v.fuente)]), { size: 8.5 });
  }
  if (f.diferencias.length) { inf.titulo2('Diferencias entre fuentes'); for (const t of f.diferencias) inf.texto(t, { size: 8.5, gap: 3 }); }

  // A. Desglose de precios
  inf.titulo1('A. Desglose de precios');
  const conItems = f.ofertas.filter((o) => o.items.length || o.componentes.costo_directo || o.componentes.total);
  if (!conItems.length) inf.texto('Aún no hay ofertas con desglose documentado para este edificio.', { color: COLOR.gris });
  for (const o of conItems) desgloseOferta(inf, o);
  const actividades = conItems.flatMap((o) => o.items.filter((i) => i.subtotal).map((i) => ({ etiqueta: `${o.empresa}: ${i.actividad}`.slice(0, 60), valor: i.subtotal as number })));
  if (actividades.length > 1) inf.barras('Composición del costo por actividad', actividades.slice(0, 10));

  // B. Comparación
  inf.titulo1('B. Comparación');
  if (!f.comparacion.disponible) inf.texto(f.comparacion.nota, { color: COLOR.gris });
  else {
    inf.texto(f.comparacion.nota, { size: 9, color: COLOR.gris, gap: 6 });
    for (const n of f.comparacion.niveles) {
      inf.tabla([{ t: n.etiqueta, w: 40 }, { t: 'Valor', w: 20, a: 'right' }, { t: 'Fecha', w: 14 }, { t: 'Fuente', w: 40 }], n.ofertas.map((o) => [`${o.etiqueta}${o.secuencia ? ` (${o.secuencia === 'ANTERIOR' ? 'anterior' : 'posterior'})` : ''}`, cop(o.valor), o.fecha ? fechaCorteTexto(o.fecha) ?? '' : '', fuenteTexto(o.fuente)]), { size: 8.5, negritas: [0] });
      inf.barras(`${n.etiqueta} por empresa`, n.ofertas.map((o) => ({ etiqueta: o.etiqueta, valor: o.valor })));
    }
  }
  if (f.etapas.length >= 1) {
    inf.titulo2('Valores por etapa (cada etapa conserva su fuente; no son precios equivalentes por defecto)');
    inf.tabla([{ t: 'Etapa', w: 34 }, { t: 'Valor', w: 18, a: 'right' }, { t: 'Nivel', w: 16 }, { t: 'Fuente', w: 48 }], f.etapas.map((e) => [e.etapa, cop(e.valor), e.nivel ?? '', `${ETQ_PROCEDENCIA[e.procedencia]}${e.fecha ? ` (${fechaCorteTexto(e.fecha)})` : ''} · ${fuenteTexto(e.fuente)}`]), { size: 8.5 });
    if (f.etapas_comparables) inf.barras('Evolución de valores por etapa', f.etapas.map((e) => ({ etiqueta: e.etapa.replace(/^Cotización · /, 'Cot. '), valor: e.valor })));
    else if (f.etapas.length > 1) inf.texto('Las cifras de cada etapa no declaran el mismo nivel (costo directo, total con AIU e IVA); por eso no se grafican juntas.', { size: 8.5, color: COLOR.gris, gap: 4 });
  }

  // C. Documentos de respaldo
  inf.titulo1('C. Documentos de respaldo');
  const origen = (v: FilaEdificio['valor'] | null) => (v ? `${v.etiqueta}: ${fuenteTexto(v.fuente)}` : '');
  const filasRef: string[][] = [];
  if (f.valor) filasRef.push(['Valor', origen(f.valor)]);
  if (f.area) filasRef.push([`Área (${f.area.clase === 'DOCUMENTADA' ? 'documentada' : 'reportada'})`, fuenteTexto(f.area.fuente)]);
  if (f.valor_m2) filasRef.push(['Valor por m²', fuenteTexto(f.valor_m2.fuente)]);
  if (f.responsable) filasRef.push(['Responsable', `${f.responsable.etiqueta}: ${fuenteTexto(f.responsable.fuente)}`]);
  if (f.contrato_conjunto) filasRef.push(['Contrato conjunto', fuenteTexto(f.contrato_conjunto.soporte)]);
  inf.tabla([{ t: 'Dato', w: 28 }, { t: 'Documento y ubicación', w: 72 }], filasRef.length ? filasRef : [['—', 'Sin documento de respaldo identificado']], { size: 8.5, negritas: [0] });
  if (d.documentos.length) {
    inf.titulo2('Documentos del edificio');
    inf.tabla([{ t: 'Grupo', w: 26 }, { t: 'Documento', w: 62 }, { t: 'Formato', w: 12 }], d.documentos.map((x) => [x.grupo, x.nombre, x.formato]), { size: 8.5 });
  }
  if (d.anexo) {
    inf.titulo1('Anexo documental');
    const ev = d.documentos.filter((x) => x.evidencias.length);
    if (!ev.length) inf.texto('No hay fragmentos de evidencia registrados para los documentos de este edificio.', { color: COLOR.gris });
    for (const x of ev) { inf.titulo2(x.nombre); for (const e of x.evidencias) inf.texto(`${ETQ_FUENTE[e.fuente_tipo] ?? e.fuente_tipo}: ${e.detalle}`, { size: 8.5, gap: 3 }); }
    for (const o of f.ofertas.filter((x) => x.controles.length)) {
      inf.titulo2(`Controles aritméticos — ${o.empresa}`);
      for (const c of o.controles) inf.texto(`${c.control}: ${c.estado === 'CUADRA' ? 'cuadra' : Math.abs(c.diferencia) < 1 ? `diferencia aritmética de ${cop(Math.abs(c.diferencia))} entre las cifras documentadas` : `no cuadra (${cop(c.diferencia)})`}`, { size: 8.5, gap: 3 });
    }
  }
  return aBuffer(inf);
}

function desgloseOferta(inf: Informe, o: OfertaEdificio) {
  inf.titulo2(`${o.empresa} — ${o.documento}${o.referencia ? ` · ${o.referencia}` : ''}${o.fecha ? ` (${fechaCorteTexto(o.fecha)})` : ''}${o.secuencia ? ` · ${o.secuencia === 'ANTERIOR' ? 'versión anterior' : 'versión posterior'}` : ''}`);
  inf.texto(`${o.nota_version ? `${o.nota_version} ` : ''}${o.relacion}.${o.alcance ? ` ${o.alcance}.` : ''}${o.oferta_conjunta ? ` Oferta conjunta de ${o.oferta_conjunta.edificios} edificios${o.oferta_conjunta.total ? `: total de la oferta ${cop(o.oferta_conjunta.total)} (no es el valor de este edificio)` : ''}.` : ''}`, { size: 8.5, color: COLOR.gris, gap: 4 });
  if (o.items.length) {
    inf.tabla(
      [{ t: 'Actividad', w: 44 }, { t: 'Unidad', w: 9 }, { t: 'Cantidad', w: 10, a: 'right' }, { t: 'Precio unitario', w: 15, a: 'right' }, { t: 'Subtotal', w: 17, a: 'right' }, { t: 'Fuente', w: 15 }],
      o.items.map((i) => [i.actividad, i.unidad ?? '', i.cantidad !== null ? i.cantidad.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : '', i.precio_unitario !== null ? cop(i.precio_unitario) : '', i.subtotal !== null ? cop(i.subtotal) : '', i.fuente?.hoja && i.fuente.celda ? `${i.fuente.hoja}!${i.fuente.celda}` : i.fuente?.pagina ? `p. ${i.fuente.pagina}` : '']),
      { size: 8 },
    );
  }
  const c = o.componentes;
  const comp: string[][] = [];
  const add = (r: string, v: number | null, k: string) => { if (v !== null) comp.push([r, cop(v), fuenteTexto(o.fuentes_componentes[k] ?? null).replace(/^.*?, /, '')]); };
  add('Costo directo', c.costo_directo, 'costo_directo'); add('Administración', c.administracion, 'administracion'); add('Imprevistos', c.imprevistos, 'imprevistos');
  add('Utilidad', c.utilidad, 'utilidad'); add('IVA', c.iva, 'iva'); add('Total de la oferta', c.total, 'total');
  if (comp.length) inf.tabla([{ t: 'Componente (cada fuente, con su base de cálculo)', w: 50 }, { t: 'Valor', w: 22, a: 'right' }, { t: 'Ubicación', w: 28 }], comp, { size: 8.5, negritas: [0] });
  void etiquetaConsolidado; void ETQ_NIVEL_ITEM;
}
