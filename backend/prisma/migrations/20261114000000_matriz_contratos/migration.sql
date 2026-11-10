CREATE TABLE "tbl_contratacion_matriz_lecturas" (
    "version_id" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "hojas" TEXT,
    "filas" INTEGER NOT NULL DEFAULT 0,
    "origen_id" TEXT,
    "leida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_matriz_lecturas_pkey" PRIMARY KEY ("version_id")
);

CREATE TABLE "tbl_contratacion_matriz_filas" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "hoja" TEXT NOT NULL,
    "fila" INTEGER NOT NULL,
    "tipo_hoja" TEXT NOT NULL,
    "proceso_original" TEXT,
    "contrato_original" TEXT,
    "proceso_norm" TEXT,
    "contrato_norm" TEXT,
    "modalidad" TEXT,
    "objeto" TEXT,
    "valor" DECIMAL(20,2),
    "estado" TEXT,
    "contratista" TEXT,
    "secop_url" TEXT,
    "celdas" JSONB NOT NULL,
    "alcance" TEXT NOT NULL,
    "expediente_id" INTEGER,
    "vinculo" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_matriz_filas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_contratacion_matriz_fila" ON "tbl_contratacion_matriz_filas"("version_id", "hoja", "fila");
CREATE INDEX "idx_contratacion_matriz_exp" ON "tbl_contratacion_matriz_filas"("expediente_id");

ALTER TABLE "tbl_contratacion_matriz_lecturas" ADD CONSTRAINT "tbl_contratacion_matriz_lecturas_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tbl_contratacion_matriz_filas" ADD CONSTRAINT "tbl_contratacion_matriz_filas_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tbl_contratacion_matriz_filas" ADD CONSTRAINT "tbl_contratacion_matriz_filas_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
