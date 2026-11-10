-- Monitoreo de contratacion: expedientes, documentos versionados, origenes y cifras trazables.
-- Sin FK hacia otros dominios.

-- CreateTable
CREATE TABLE "tbl_contratacion_expedientes" (
    "id" SERIAL NOT NULL,
    "proceso" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DEMOLICION',
    "intervencion" TEXT NOT NULL,
    "objeto" TEXT,
    "estado_documentado" TEXT NOT NULL DEFAULT 'PENDIENTE_SOPORTE',
    "fecha_documento" DATE,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_contratacion_expedientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_documentos" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "fecha_documento" DATE,
    "proceso_detectado" TEXT,
    "estado_clasificacion" TEXT NOT NULL DEFAULT 'PENDIENTE_CLASIFICACION',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_contratacion_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_doc_versiones" (
    "id" SERIAL NOT NULL,
    "documento_id" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "md5" TEXT NOT NULL,
    "tamano" BIGINT,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reemplazada_en" TIMESTAMP(3),

    CONSTRAINT "tbl_contratacion_doc_versiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_doc_origenes" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "id_origen" TEXT NOT NULL,
    "nombre_original" TEXT NOT NULL,
    "ruta" TEXT,
    "mime" TEXT,
    "tamano" BIGINT,
    "modificado_en" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "motivo_retiro" TEXT,
    "visto_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_doc_origenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_fuentes_estado" (
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'SIN_CONFIGURAR',
    "ultimo_intento" TIMESTAMP(3),
    "ultima_correcta" TIMESTAMP(3),
    "total" INTEGER,
    "detalle" TEXT,

    CONSTRAINT "tbl_contratacion_fuentes_estado_pkey" PRIMARY KEY ("tipo")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_hechos" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT,
    "atributos" JSONB,
    "version_id" INTEGER,
    "pagina" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_hechos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_ofertas" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "grupo_oferta" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fecha_oferta" DATE,
    "incluye" TEXT[],
    "excluye" TEXT[],
    "notas" TEXT,
    "version_id" INTEGER,
    "pagina" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_lineas" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER NOT NULL,
    "oferta_id" INTEGER,
    "clave" TEXT NOT NULL,
    "actividad" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(20,4),
    "unidad" TEXT NOT NULL,
    "precio_unitario" DECIMAL(20,4),
    "total" DECIMAL(20,2),
    "base_economica" TEXT NOT NULL,
    "grupo_comparacion" TEXT,
    "derivado" BOOLEAN NOT NULL DEFAULT false,
    "estado_revision" TEXT NOT NULL DEFAULT 'VERIFICADO',
    "nota" TEXT,
    "version_id" INTEGER,
    "pagina" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_referencias" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "proveedor" TEXT,
    "proceso_ref" TEXT,
    "fecha" DATE,
    "objeto" TEXT NOT NULL,
    "valor" DECIMAL(20,2),
    "unidad" TEXT NOT NULL DEFAULT 'GLOBAL',
    "condiciones" TEXT,
    "version_id" INTEGER,
    "pagina" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_referencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_valores" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER NOT NULL,
    "oferta_id" INTEGER,
    "clave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "importe" DECIMAL(20,2) NOT NULL,
    "estado_soporte" TEXT NOT NULL DEFAULT 'RESPALDADO',
    "version_id" INTEGER,
    "pagina" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_valores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_contratos" (
    "id" SERIAL NOT NULL,
    "expediente_id" INTEGER NOT NULL,
    "oferta_id" INTEGER,
    "clave" TEXT NOT NULL,
    "tipo_acto" TEXT NOT NULL,
    "numero" TEXT,
    "fecha_acto" DATE,
    "alcance" TEXT,
    "justificacion" TEXT,
    "valor" DECIMAL(20,2) NOT NULL,
    "version_id" INTEGER,
    "pagina" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_importaciones" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "resumen" JSONB,
    "creado_por" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_importaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_contratacion_auditoria" (
    "id" SERIAL NOT NULL,
    "importacion_id" INTEGER,
    "entidad" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "expediente_id" INTEGER,
    "accion" TEXT NOT NULL,
    "anterior" JSONB,
    "nuevo" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_contratacion_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_contratacion_expedientes_proceso_key" ON "tbl_contratacion_expedientes"("proceso");

-- CreateIndex
CREATE INDEX "idx_contratacion_exp_tipo" ON "tbl_contratacion_expedientes"("tipo");

-- CreateIndex
CREATE INDEX "idx_contratacion_doc_exp" ON "tbl_contratacion_documentos"("expediente_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_contratacion_doc_versiones_md5_key" ON "tbl_contratacion_doc_versiones"("md5");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_ver_doc_num" ON "tbl_contratacion_doc_versiones"("documento_id", "numero");

-- CreateIndex
CREATE INDEX "idx_contratacion_origen_busqueda" ON "tbl_contratacion_doc_origenes"("tipo", "id_origen", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_origen" ON "tbl_contratacion_doc_origenes"("tipo", "id_origen", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_hecho" ON "tbl_contratacion_hechos"("expediente_id", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_oferta" ON "tbl_contratacion_ofertas"("expediente_id", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_linea" ON "tbl_contratacion_lineas"("expediente_id", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_referencia" ON "tbl_contratacion_referencias"("expediente_id", "clave");

-- CreateIndex
CREATE INDEX "idx_contratacion_valor_tipo" ON "tbl_contratacion_valores"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_valor" ON "tbl_contratacion_valores"("expediente_id", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "uq_contratacion_contrato" ON "tbl_contratacion_contratos"("expediente_id", "clave");

-- CreateIndex
CREATE INDEX "idx_contratacion_imp_hash" ON "tbl_contratacion_importaciones"("hash");

-- CreateIndex
CREATE INDEX "idx_contratacion_aud_clave" ON "tbl_contratacion_auditoria"("entidad", "clave");

-- AddForeignKey
ALTER TABLE "tbl_contratacion_documentos" ADD CONSTRAINT "tbl_contratacion_documentos_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_doc_versiones" ADD CONSTRAINT "tbl_contratacion_doc_versiones_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "tbl_contratacion_documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_doc_origenes" ADD CONSTRAINT "tbl_contratacion_doc_origenes_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_hechos" ADD CONSTRAINT "tbl_contratacion_hechos_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_hechos" ADD CONSTRAINT "tbl_contratacion_hechos_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_ofertas" ADD CONSTRAINT "tbl_contratacion_ofertas_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_ofertas" ADD CONSTRAINT "tbl_contratacion_ofertas_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_lineas" ADD CONSTRAINT "tbl_contratacion_lineas_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_lineas" ADD CONSTRAINT "tbl_contratacion_lineas_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "tbl_contratacion_ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_lineas" ADD CONSTRAINT "tbl_contratacion_lineas_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_referencias" ADD CONSTRAINT "tbl_contratacion_referencias_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_referencias" ADD CONSTRAINT "tbl_contratacion_referencias_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_valores" ADD CONSTRAINT "tbl_contratacion_valores_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_valores" ADD CONSTRAINT "tbl_contratacion_valores_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "tbl_contratacion_ofertas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_valores" ADD CONSTRAINT "tbl_contratacion_valores_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_contratos" ADD CONSTRAINT "tbl_contratacion_contratos_expediente_id_fkey" FOREIGN KEY ("expediente_id") REFERENCES "tbl_contratacion_expedientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_contratos" ADD CONSTRAINT "tbl_contratacion_contratos_oferta_id_fkey" FOREIGN KEY ("oferta_id") REFERENCES "tbl_contratacion_ofertas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_contratos" ADD CONSTRAINT "tbl_contratacion_contratos_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_contratacion_auditoria" ADD CONSTRAINT "tbl_contratacion_auditoria_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "tbl_contratacion_importaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
