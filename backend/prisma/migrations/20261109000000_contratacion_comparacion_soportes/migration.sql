-- Comparación de cotizaciones, edificios, resoluciones y alertas de cifra (solo tablas/columnas nuevas; no toca datos).

-- AlterTable
ALTER TABLE "tbl_contratacion_expedientes" ADD COLUMN     "alcance_confirmado" TEXT;

-- AlterTable
ALTER TABLE "tbl_contratacion_documentos" ADD COLUMN     "alcance" TEXT;

-- AlterTable
ALTER TABLE "tbl_contratacion_hechos" ADD COLUMN     "celda" TEXT,
ADD COLUMN     "hoja" TEXT;

-- AlterTable
ALTER TABLE "tbl_contratacion_ofertas" ADD COLUMN     "celda" TEXT,
ADD COLUMN     "hoja" TEXT;

-- AlterTable
ALTER TABLE "tbl_contratacion_lineas" ADD COLUMN     "celda" TEXT,
ADD COLUMN     "hoja" TEXT;

-- AlterTable
ALTER TABLE "tbl_contratacion_referencias" ADD COLUMN     "celda" TEXT,
ADD COLUMN     "hoja" TEXT;

-- AlterTable
ALTER TABLE "tbl_contratacion_valores" ADD COLUMN     "celda" TEXT,
ADD COLUMN     "hoja" TEXT;

-- AlterTable
ALTER TABLE "tbl_contratacion_contratos" ADD COLUMN     "celda" TEXT,
ADD COLUMN     "hoja" TEXT;

-- CreateTable
CREATE TABLE "tbl_contratacion_edificios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_norm" TEXT NOT NULL,
    "direccion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_contratacion_edificios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_expediente_edificios" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER NOT NULL,
    "edificio_id" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'CONFIRMADA',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_expediente_edificios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_documento_edificios" (
    "id" SERIAL NOT NULL,
    "documento_id" INTEGER NOT NULL,
    "edificio_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_documento_edificios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_resoluciones" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" DATE,
    "tipo" TEXT NOT NULL DEFAULT 'DEMOLICION',
    "estado_verificacion" TEXT NOT NULL DEFAULT 'VERIFICADA',
    "version_id" INTEGER,
    "pagina" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_resoluciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_resolucion_edificios" (
    "id" SERIAL NOT NULL,
    "resolucion_id" INTEGER NOT NULL,
    "edificio_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_contratacion_resolucion_edificios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_alertas_cifra" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER NOT NULL,
    "entidad" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "hoja" TEXT NOT NULL,
    "celda" TEXT NOT NULL,
    "version_anterior_id" INTEGER NOT NULL,
    "version_nueva_id" INTEGER NOT NULL,
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_en" TIMESTAMP(3),

    CONSTRAINT "tbl_contratacion_alertas_cifra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_contratacion_edificios_nombre_norm_key" ON "tbl_contratacion_edificios"("nombre_norm");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_exp_edif" ON "tbl_contratacion_expediente_edificios"("expediente_id", "edificio_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_doc_edif" ON "tbl_contratacion_documento_edificios"("documento_id", "edificio_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_contratacion_resoluciones_numero_key" ON "tbl_contratacion_resoluciones"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_res_edif" ON "tbl_contratacion_resolucion_edificios"("resolucion_id", "edificio_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_alerta" ON "tbl_contratacion_alertas_cifra"("entidad", "clave", "expediente_id", "version_nueva_id");

-- AddForeignKey
ALTER TABLE "tbl_contratacion_expediente_edificios" ADD CONSTRAINT "tbl_contratacion_expediente_edificios_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_expediente_edificios" ADD CONSTRAINT "tbl_contratacion_expediente_edificios_edificio_id_fkey" FOREIGN KEY ("edificio_id") REFERENCES "tbl_contratacion_edificios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_documento_edificios" ADD CONSTRAINT "tbl_contratacion_documento_edificios_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "tbl_contratacion_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_documento_edificios" ADD CONSTRAINT "tbl_contratacion_documento_edificios_edificio_id_fkey" FOREIGN KEY ("edificio_id") REFERENCES "tbl_contratacion_edificios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_resoluciones" ADD CONSTRAINT "tbl_contratacion_resoluciones_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_resolucion_edificios" ADD CONSTRAINT "tbl_contratacion_resolucion_edificios_resolucion_id_fkey" FOREIGN KEY ("resolucion_id") REFERENCES "tbl_contratacion_resoluciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_resolucion_edificios" ADD CONSTRAINT "tbl_contratacion_resolucion_edificios_edificio_id_fkey" FOREIGN KEY ("edificio_id") REFERENCES "tbl_contratacion_edificios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_alertas_cifra" ADD CONSTRAINT "tbl_contratacion_alertas_cifra_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "tbl_contratacion_celdas_respaldo" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "hoja" TEXT NOT NULL,
    "celda" TEXT NOT NULL,
    "valor" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_celdas_respaldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_celda_respaldo" ON "tbl_contratacion_celdas_respaldo"("version_id", "hoja", "celda");
