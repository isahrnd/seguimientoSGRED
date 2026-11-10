export interface SoporteRef {
  version_id: number;
  documento_id: number;
  documento: string | null;
  numero_version: number;
  es_vigente: boolean;
  version_vigente_id: number | null;
  pagina: number | null;
  hoja?: string | null;
  celda?: string | null;
}

export interface FuenteEstado {
  tipo: "LOCAL" | "DRIVE";
  estado: "SIN_CONFIGURAR" | "VACIA" | "CORRECTA" | "ERROR";
  ultima_correcta: string | null;
  ultimo_intento: string | null;
  total: number | null;
  detalle: string | null;
}

export interface ExpedienteFila {
  sectores?: string[];
  tipo_intervencion?: "DEMOLICION" | "IZAJE_GRUAS" | "OTRA";
  reportado_contratado?: boolean;
  id: number;
  proceso: string;
  numero_contrato?: string | null;
  proceso_verificado?: boolean;
  intervencion: string;
  edificaciones: string[];
  empresa_seleccionada: string | null;
  ofertas_analizadas: string[];
  estado: "PENDIENTE_SOPORTE" | "ANALISIS_DEL_SECTOR" | "CONTRATADO" | "EJECUCION_DOCUMENTADA";
  fecha_documento: string | null;
  cotizaciones: number;
  valores: {
    presupuesto_oficial: number | null;
    cotizado: { min: number; max: number } | null;
    contratado: number | null;
    ejecutado: number | null;
  };
  pendientes: string[];
}

export interface ListadoContratacion {
  expedientes: ExpedienteFila[];
  totales: { expedientes: number; contratado: number | null; contratos: number };
  documentos_pendientes_clasificacion: number;
  fuentes: FuenteEstado[];
}

export interface FiltrosContratacion {
  q?: string;
  intervencion?: string;
  empresa?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
}

export interface Comparacion {
  comparable: boolean;
  motivo?: string;
  diferencia_pct?: number;
}

export interface LineaPrecio {
  id: number;
  clave: string;
  oferta_clave: string | null;
  proveedor: string | null;
  actividad: string;
  descripcion: string;
  cantidad: number | null;
  unidad: string;
  precio_unitario: number | null;
  total: number | null;
  base_economica: string;
  grupo_comparacion: string | null;
  derivado: boolean;
  estado_revision: string;
  nota: string | null;
  soporte: SoporteRef | null;
}

export interface Hecho {
  clave: string;
  titulo: string;
  detalle: string | null;
  tipo?: string;
  atributos?: Record<string, unknown> | null;
  soporte: SoporteRef | null;
}

export interface SoporteDoc {
  documento_id: number;
  version_id: number | null;
  numero_version: number | null;
  nombre: string;
  categoria: string;
  categoria_nombre: string;
  alcance?: string | null;
  edificios?: { id: number; nombre: string }[];
  fecha_documento: string | null;
  origenes: { tipo: "LOCAL" | "DRIVE"; estado: string; nombre_original: string }[];
  disponible: boolean;
  previsualizable: boolean;
  abrir_en_drive: boolean;
  versiones: { version_id: number; numero: number; vigente: boolean }[];
}

export interface Valor {
  id: number;
  clave: string;
  tipo: "PRESUPUESTO_OFICIAL" | "COTIZADO" | "EJECUTADO";
  concepto: string;
  importe: number;
  estado_soporte: "RESPALDADO" | "CITADO_SIN_ACTA";
  oferta: string | null;
  soporte: SoporteRef | null;
}

export interface DetalleExpediente {
  analisis_precios: AnalisisPrecios;
  sectores: Hecho[];
  expediente: ExpedienteFila & { objeto: string | null };
  necesidad: {
    edificaciones: Hecho[];
    actividades: Hecho[];
    particularidades: Hecho[];
    factores: Hecho[];
    pendientes_aclaracion: Hecho[];
  };
  cotizaciones: {
    id: number;
    clave: string;
    proveedor: string;
    grupo_oferta: string;
    revision: number;
    fecha_oferta: string | null;
    incluye: string[];
    excluye: string[];
    notas: string | null;
    soporte: SoporteRef | null;
    lineas: LineaPrecio[];
  }[];
  lineas_sin_oferta: LineaPrecio[];
  comparaciones_entre_ofertas: ({ a: string; b: string } & Comparacion)[];
  analisis_sector: {
    referencias: {
      id: number;
      entidad: string;
      proveedor: string | null;
      proceso_ref: string | null;
      fecha: string | null;
      objeto: string;
      valor: number | null;
      unidad: string;
      condiciones: string | null;
      soporte: SoporteRef | null;
      comparacion: Comparacion;
    }[];
  };
  contratacion: {
    contratos: {
      id: number;
      tipo_acto: string;
      numero: string | null;
      fecha_acto: string | null;
      alcance: string | null;
      justificacion: string | null;
      valor: number;
      oferta: string | null;
      soporte: SoporteRef | null;
      contratista: string | null;
      expresion_valor: string | null;
      firma_estado: "FIRMADO_ELECTRONICAMENTE" | "FIRMA_PARCIAL" | "SIN_EVIDENCIA_DE_FIRMA" | null;
      firma_detalle: string | null;
      firma_fecha: string | null;
      numero_proceso_citado: string | null;
    }[];
    seleccion_documentada: boolean;
    aviso: string | null;
  };
  ejecucion: { valores: Valor[] };
  valores: Valor[];
  soportes: SoporteDoc[];
  edificios: EdificioProceso[];
  documentos_por_edificio: {
    edificio: { id: number; nombre: string } | null;
    documentos: { documento_id: number; version_id: number | null; nombre: string; categoria: string; categoria_nombre: string; origen: "PROCESO" | "EDIFICIO" }[];
  }[];
  comparacion: ComparacionCotizaciones;
  cotizaciones_edificio: CotizacionEdificio[];
}

export type RequisitoResolucion = "VERIFICADA" | "PENDIENTE_SOPORTE" | "NO_APLICA" | "POR_CONFIRMAR_ALCANCE" | "SIN_INTERVENCION";

export interface ResolucionRegistrada {
  numero: string;
  fecha: string | null;
  tipo: string;
  estado_verificacion: string;
  estado_texto: string;
  soporte: SoporteRef | null;
}

export interface ResolucionEdificio {
  requisito: RequisitoResolucion;
  etiqueta: string;
  resoluciones: ResolucionRegistrada[];
}

export interface EdificioProceso {
  id: number;
  nombre: string;
  direccion: string | null;
  estado_asociacion: string;
  resolucion: ResolucionEdificio | null;
}

export interface ImporteSignificado {
  importe: number;
  concepto: string | null;
  proveedor: string | null;
  soporte: SoporteRef | null;
  estado_soporte: string;
}

export interface ValorSignificado {
  tipo: "PRESUPUESTO_OFICIAL" | "COTIZACION" | "OFERTA_SELECCIONADA" | "VALOR_CONTRATADO" | "VALOR_EJECUTADO";
  etiqueta: string;
  estado: "SOPORTADO" | "CITADO_SIN_ACTA" | "PENDIENTE_SOPORTE";
  importes: ImporteSignificado[];
}

export interface ComparacionCotizaciones {
  valores: ValorSignificado[];
  cotizaciones_resumen: {
    clave: string;
    proveedor: string;
    es_seleccionada: boolean;
    edificios_o_alcance: string[];
    condiciones: string | null;
    excluye: string[];
    valor_cotizado: { importe: number; concepto: string | null; soporte: SoporteRef | null }[];
  }[];
  alcance: {
    hay_diferencias: boolean;
    comparables: boolean;
    diferencias: { concepto: string; incluyen: string[]; no_incluyen: string[] }[];
    aviso: string | null;
  };
  seleccion: {
    estado: "ADJUDICADA" | "JUSTIFICADA_SIN_ACTO" | "PENDIENTE_SOPORTE";
    oferta: string | null;
    justificaciones: { oferta: string | null; texto: string; soporte: SoporteRef | null }[];
    texto: string | null;
    contratos: { numero: string | null; justificacion: string | null; soporte: SoporteRef | null }[];
  };
  estudio_mercado: {
    estado: "RECIBIDO" | "PENDIENTE_DE_RECIBIR";
    etiqueta: string;
    documentos: { documento_id: number; nombre: string; version_id: number | null }[];
    analisis_del_sector: { documento_id: number; nombre: string; version_id: number | null }[];
    aviso: string;
  };
  diferencias_sin_explicar: { codigo: string; descripcion: string }[];
  comparativo_general: { clave: string; titulo: string; detalle: string | null; atributos: Record<string, unknown> | null; soporte: SoporteRef | null }[];
  alertas_cifra: {
    id: number;
    entidad: string;
    clave: string;
    hoja: string;
    celda: string;
    valor_anterior: string | null;
    valor_nuevo: string | null;
    version_anterior_id: number;
    version_nueva_id: number;
  }[];
}

export interface DocumentoEdificio {
  documento_id: number;
  version_id: number | null;
  nombre: string;
  categoria: string;
  categoria_nombre: string;
  formato: "PDF" | "XLSX" | "OTRO";
  disponible: boolean;
  vista_previa: "pdf" | "hoja" | null;
  abrir_en_drive: boolean;
  origen_asociacion: "DIRECTO" | "PROCESO";
  proceso: { id: number; proceso: string } | null;
  fecha_documento: string | null;
  asociaciones_faltantes: string[];
  empresas?: Array<{ nombre: string; aclaracion: string | null }>;
}

export interface EdificioFila {
  id: number;
  nombre: string;
  direccion: string | null;
  procesos: { id: number; proceso: string; intervencion: string }[];
  documentos: number;
  resolucion: { requisito: RequisitoResolucion; etiqueta: string };
}

export interface CotizacionEdificio {
  id: number;
  proveedor: string;
  concepto: string;
  importe: number;
  base: "COSTO_DIRECTO" | "TOTAL";
  total_oferta: number | null;
  alcance_oferta: string | null;
  verificacion: "VERIFICADO_EN_IMAGEN" | "COINCIDE_CON_PDF" | "PENDIENTE";
  nota: string | null;
  edificio_id: number;
  fecha_oferta: string | null;
  referencia_oferta: string | null;
  tratamiento_aiu: string | null;
  actividades: string | null;
  cantidad: string | null;
  proceso: { id: number; proceso: string } | null;
  soporte: SoporteRef;
}

export interface DetalleEdificio {
  cotizaciones: CotizacionEdificio[];
  edificio: { id: number; nombre: string; direccion: string | null };
  procesos: {
    id: number;
    proceso: string;
    intervencion: string;
    estado_asociacion: string;
    alcance_confirmado: string | null;
    edificios_del_proceso: number;
    valor_contratado: number | null;
    nota_valor: string | null;
  }[];
  sin_proceso_confirmado: boolean;
  resolucion: ResolucionEdificio;
  grupos: { codigo: string; nombre: string; documentos: DocumentoEdificio[] }[];
  visitas_y_soportes_tecnicos: DocumentoEdificio[];
}

export interface EstadoSincronizacion {
  automatica: boolean;
  intervalo_minutos: number | null;
  estado: string;
  ultimo_intento: string | null;
  ultima_correcta: string | null;
  detalle: string | null;
  proxima_estimada: string | null;
}

export interface ComparacionExpedientes {
  a: { id: number; proceso: string; intervencion: string; factores: Hecho[]; particularidades: Hecho[] };
  b: { id: number; proceso: string; intervencion: string; factores: Hecho[]; particularidades: Hecho[] };
  pares: { a: LineaPrecio; b: LineaPrecio; resultado: Comparacion }[];
  aviso: string;
}

export interface ResumenFuenteIndice {
  estado: FuenteEstado["estado"];
  total: number;
  nuevos: number;
  modificados?: number;
  retirados: number;
  errores: number;
  detalle?: string;
}

export interface ResumenReindexado {
  local: ResumenFuenteIndice;
  drive: ResumenFuenteIndice;
}

export interface CambioIndice {
  fuente: "LOCAL" | "DRIVE";
  nombre: string;
  tipo: "NUEVO" | "MODIFICADO" | "RETIRADO";
}

/** Una actualización del índice (manual o automática). */
export interface TrabajoIndice {
  id: number;
  origen: "MANUAL" | "AUTOMATICA";
  estado: "EN_CURSO" | "FINALIZADA" | "ERROR";
  iniciado_en: string;
  finalizado_en: string | null;
  resultado: ResumenReindexado | null;
  cambios: CambioIndice[];
  error: string | null;
}

export interface DocumentoPendiente {
  documento_id: number;
  nombre: string;
  categoria: string;
  categoria_nombre: string;
  proceso_detectado: string | null;
  version_id: number | null;
  origenes: ("LOCAL" | "DRIVE")[];
  previsualizable: boolean;
}

export interface EvidenciaSugerencia {
  fuente_tipo: "CARPETA" | "NOMBRE" | "PDF_PAGINA" | "XLSX_CELDA" | "RESOLUCION_CITADA" | "REVISION_PRIVADA";
  fuente_detalle: string;
  estado: "SUGERIDA" | "CONFIRMADA" | "DESCARTADA";
}

export interface ValorSugerido {
  valor: string;
  estado: "SUGERIDA" | "CONFIRMADA" | "DESCARTADA";
  evidencias: EvidenciaSugerencia[];
}

export interface DocumentoBiblioteca {
  documento_id: number;
  version_id: number | null;
  numero_version: number | null;
  nombre: string;
  formato: "PDF" | "XLSX" | "OTRO";
  vista_previa: "pdf" | "hoja" | null;
  disponible: boolean;
  carpeta: string | null;
  origenes: { tipo: "LOCAL" | "DRIVE"; estado: string }[];
  abrir_en_drive: boolean;
  categoria: { codigo: string; nombre: string; origen: "confirmada" | "detectada" | "sugerida"; evidencias: EvidenciaSugerencia[] } | null;
  edificaciones: ValorSugerido[];
  empresas: ValorSugerido[];
  resoluciones: ValorSugerido[];
  expedientes_sugeridos: ValorSugerido[];
  expediente: { id: number; proceso: string; intervencion: string; confirmado: boolean } | null;
  clasificado: boolean;
  alcance: string | null;
  es_general: boolean;
  edificios_confirmados: { id: number; nombre: string }[];
  asociaciones_faltantes: string[];
}

export interface Faceta {
  valor: string;
  nombre: string;
  n: number;
}

export interface BibliotecaRespuesta {
  vista: "todos" | "revisar" | "clasificados" | "generales";
  conteos: { todos: number; revisar: number; clasificados: number; generales: number };
  total: number;
  pagina: number;
  tam: number;
  items: DocumentoBiblioteca[];
  facetas: { categorias: Faceta[]; formatos: Faceta[]; edificaciones: Faceta[]; origenes: Faceta[] };
}

export interface FiltrosBiblioteca {
  vista?: string;
  q?: string;
  categoria?: string;
  formato?: string;
  edificacion?: string;
  origen?: string;
  expediente?: string;
  pagina?: number;
}

export interface HojaRespuesta {
  documento: string;
  numero_version: number;
  origen: string;
  hojas: { indice: number; nombre: string }[];
  hoja: { indice: number; nombre: string; filas: (string | number | boolean | null)[][]; total_filas: number; total_columnas: number; truncado: boolean };
}

export type ResultadoPrecio =
  | "SIN_CONTRATO_SOPORTADO"
  | "EVIDENCIA_INSUFICIENTE"
  | "ALCANCE_NO_EQUIVALENTE"
  | "DENTRO_DEL_RANGO"
  | "POR_ENCIMA_DEL_RANGO"
  | "POR_DEBAJO_DEL_RANGO";

export interface ReferenciaPrecio {
  tipo: "COTIZACION" | "PRESUPUESTO_OFICIAL" | "REFERENCIA_EXTERNA";
  etiqueta: string;
  proveedor: string | null;
  valor: number | null;
  independiente: boolean;
  comparable: boolean;
  motivo: string | null;
  base: number | null;
  diferencia_cop: number | null;
  diferencia_pct: number | null;
  es_la_seleccionada: boolean;
  soporte: SoporteRef | null;
}

export interface ContratadoDesglose {
  valor_inicial: number | null;
  modificaciones: number | null;
  valor_actualizado: number | null;
  sustentado: boolean;
  detalle: Array<{ tipo_acto: string; numero: string | null; valor: number; es_modificacion: boolean; soporte: SoporteRef | null }>;
}

export interface AnalisisPrecios {
  contratado: ContratadoDesglose;
  referencias: ReferenciaPrecio[];
  rango: { min: number; max: number; referencias: number } | null;
  resultado: ResultadoPrecio;
  resumen: string;
  cobertura: { partidas_comparadas: number; partidas_totales: number; aviso: string | null };
  ejecutado_vs_contratado: { ejecutado: number; diferencia_cop: number; nota: string } | null;
  pendientes: string[];
}

export interface FilaAnalisisPrecios {
  id: number;
  proceso: string;
  numero_contrato?: string | null;
  proceso_verificado?: boolean;
  intervencion: string;
  tipo_intervencion: "DEMOLICION" | "IZAJE_GRUAS" | "OTRA";
  edificios: string[];
  sectores: string[];
  alcance: string[];
  empresa_seleccionada: string | null;
  valor_contratado: ContratadoDesglose | null;
  soporte_contrato: SoporteRef | null;
  reportado_contratado: boolean;
  resultado: ResultadoPrecio;
  resumen: string;
  pendientes: string[];
  rango: { min: number; max: number; referencias: number } | null;
  referencias_independientes: number;
  ofertas: number;
}

export interface RespuestaAnalisisPrecios {
  expedientes: FilaAnalisisPrecios[];
  totales: { contratado_demoliciones: number | null; contratado_izaje_gruas: number | null; con_contrato_soportado: number };
  pendientes_de_soporte: Array<{ id: number; proceso: string; intervencion: string; reportado_contratado: boolean; documento_necesario: string }>;
  aviso: string;
}
