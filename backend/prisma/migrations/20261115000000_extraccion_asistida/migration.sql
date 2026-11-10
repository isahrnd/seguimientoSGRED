CREATE TABLE "tbl_contratacion_ia_extracciones" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "extractor" VARCHAR(40) NOT NULL,
    "estado" VARCHAR(20) NOT NULL,
    "huella" VARCHAR(64),
    "modelo" VARCHAR(80),
    "resultado" JSONB,
    "descartes" JSONB,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximo_intento" TIMESTAMP(3),
    "error" VARCHAR(60),
    "paginas_ocr" INTEGER NOT NULL DEFAULT 0,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_salida" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tbl_contratacion_ia_extracciones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_contratacion_ia_version" ON "tbl_contratacion_ia_extracciones"("version_id", "extractor");
CREATE INDEX "idx_contratacion_ia_huella" ON "tbl_contratacion_ia_extracciones"("huella", "extractor");
ALTER TABLE "tbl_contratacion_ia_extracciones" ADD CONSTRAINT "tbl_contratacion_ia_extracciones_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tbl_contratacion_ia_llamadas" (
    "id" SERIAL NOT NULL,
    "dia" DATE NOT NULL,
    "version_id" INTEGER,
    "modelo" VARCHAR(80) NOT NULL,
    "estado" VARCHAR(12) NOT NULL,
    "http" INTEGER,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_salida" INTEGER NOT NULL DEFAULT 0,
    "duracion_ms" INTEGER,
    "costo_usd" DECIMAL(12,6),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_ia_llamadas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_contratacion_ia_llamada_dia" ON "tbl_contratacion_ia_llamadas"("dia");

CREATE TABLE "tbl_contratacion_areas" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "pagina" INTEGER NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "tipo" VARCHAR(14) NOT NULL,
    "edificio_id" INTEGER,
    "etapa" VARCHAR(24),
    "cita" TEXT NOT NULL,
    "origen" VARCHAR(8) NOT NULL,
    "estado" VARCHAR(14) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_areas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_contratacion_area" ON "tbl_contratacion_areas"("version_id", "pagina", "tipo", "valor");
ALTER TABLE "tbl_contratacion_areas" ADD CONSTRAINT "tbl_contratacion_areas_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tbl_contratacion_areas" ADD CONSTRAINT "tbl_contratacion_areas_edificio_id_fkey" FOREIGN KEY ("edificio_id") REFERENCES "tbl_contratacion_edificios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
