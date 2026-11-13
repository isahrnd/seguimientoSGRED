CREATE TABLE "tbl_contratacion_consolidado_lecturas" (
    "version_id" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "filas" INTEGER NOT NULL DEFAULT 0,
    "leida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_consolidado_lecturas_pkey" PRIMARY KEY ("version_id")
);

CREATE TABLE "tbl_contratacion_consolidado_filas" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "hoja" TEXT NOT NULL,
    "fila" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "estado" TEXT,
    "avance" TEXT,
    "valor" DECIMAL(20,2),
    "area_m2" DECIMAL(14,2),
    "valor_m2" DECIMAL(16,2),
    "responsable" TEXT,
    "formula_valor" TEXT,
    "celdas" JSONB NOT NULL,
    "fecha_corte" DATE,
    "edificio_id" INTEGER,
    "vinculo" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_consolidado_filas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_contratacion_consolidado_fila" ON "tbl_contratacion_consolidado_filas"("version_id", "hoja", "fila");
CREATE INDEX "idx_contratacion_consolidado_edif" ON "tbl_contratacion_consolidado_filas"("edificio_id");

ALTER TABLE "tbl_contratacion_consolidado_lecturas" ADD CONSTRAINT "tbl_contratacion_consolidado_lecturas_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tbl_contratacion_consolidado_filas" ADD CONSTRAINT "tbl_contratacion_consolidado_filas_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tbl_contratacion_consolidado_filas" ADD CONSTRAINT "tbl_contratacion_consolidado_filas_edificio_id_fkey" FOREIGN KEY ("edificio_id") REFERENCES "tbl_contratacion_edificios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
