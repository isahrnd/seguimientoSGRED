-- Importe de una cotización atribuido a una edificación, con fuente (PDF/página o Excel/hoja/celda).
CREATE TABLE "tbl_contratacion_cotizaciones_edificio" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "edificio_id" INTEGER NOT NULL,
    "version_id" INTEGER NOT NULL,
    "expediente_id" INTEGER,
    "proveedor" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "importe" DECIMAL(18,2) NOT NULL,
    "base" VARCHAR(30) NOT NULL,
    "total_oferta" DECIMAL(18,2),
    "alcance_oferta" TEXT,
    "pagina" INTEGER,
    "hoja" TEXT,
    "celda" TEXT,
    "verificacion" VARCHAR(30) NOT NULL,
    "nota" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_cotizaciones_edificio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tbl_contratacion_cotizaciones_edificio_clave_key" ON "tbl_contratacion_cotizaciones_edificio"("clave");
ALTER TABLE "tbl_contratacion_cotizaciones_edificio" ADD CONSTRAINT "tbl_contratacion_cotizaciones_edificio_edificio_id_fkey" FOREIGN KEY ("edificio_id") REFERENCES "tbl_contratacion_edificios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tbl_contratacion_cotizaciones_edificio" ADD CONSTRAINT "tbl_contratacion_cotizaciones_edificio_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tbl_contratacion_cotizaciones_edificio" ADD CONSTRAINT "tbl_contratacion_cotizaciones_edificio_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
