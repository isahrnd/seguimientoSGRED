-- Biblioteca documental: indice de texto y sugerencias con evidencia.

-- CreateTable
CREATE TABLE "tbl_contratacion_doc_indice" (
    "version_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "hojas" JSONB,
    "extraido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_doc_indice_pkey" PRIMARY KEY ("version_id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_doc_sugerencias" (
    "id" SERIAL NOT NULL,
    "documento_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "fuente_tipo" TEXT NOT NULL,
    "fuente_detalle" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'SUGERIDA',
    "confirmada_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_doc_sugerencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_contratacion_sug_valor" ON "tbl_contratacion_doc_sugerencias"("tipo", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_sugerencia" ON "tbl_contratacion_doc_sugerencias"("documento_id", "tipo", "valor", "fuente_tipo", "fuente_detalle");

-- AddForeignKey
ALTER TABLE "tbl_contratacion_doc_indice" ADD CONSTRAINT "tbl_contratacion_doc_indice_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_doc_sugerencias" ADD CONSTRAINT "tbl_contratacion_doc_sugerencias_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "tbl_contratacion_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
