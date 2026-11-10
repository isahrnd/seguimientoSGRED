-- Número de contrato separado del número de proceso; firma y revisión de contratos leídos de PDF.
ALTER TABLE "tbl_contratacion_expedientes" ADD COLUMN "numero_contrato" TEXT, ADD COLUMN "proceso_verificado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tbl_contratacion_contratos"
  ADD COLUMN "contratista" TEXT, ADD COLUMN "expresion_valor" TEXT, ADD COLUMN "firma_estado" TEXT, ADD COLUMN "firma_detalle" TEXT,
  ADD COLUMN "firma_fecha" DATE, ADD COLUMN "numero_proceso_citado" TEXT;
CREATE TABLE "tbl_contratacion_doc_contrato" (
    "version_id" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "numero_contrato" TEXT,
    "consecutivo" TEXT,
    "anio" INTEGER,
    "contratista" TEXT,
    "objeto" TEXT,
    "valor" DECIMAL(20,2),
    "expresion_valor" TEXT,
    "valor_clausula" DECIMAL(20,2),
    "proceso_citado" TEXT,
    "firma_estado" TEXT,
    "firma_detalle" TEXT,
    "firma_fecha" DATE,
    "expediente_id" INTEGER,
    "motivo" TEXT,
    "candidatos" JSONB,
    "advertencias" JSONB,
    "procesado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_doc_contrato_pkey" PRIMARY KEY ("version_id")
);
ALTER TABLE "tbl_contratacion_doc_contrato" ADD CONSTRAINT "tbl_contratacion_doc_contrato_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
