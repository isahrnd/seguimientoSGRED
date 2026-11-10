-- Cuentas de consulta y sesiones del servidor (aislado de INFOGRED).
CREATE TABLE "tbl_usuarios" (
    "id" SERIAL NOT NULL,
    "correo" VARCHAR(200) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "password_hash" VARCHAR(300) NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_usuarios_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tbl_usuarios_correo_key" ON "tbl_usuarios"("correo");

CREATE TABLE "tbl_sesiones" (
    "id" SERIAL NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tbl_sesiones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tbl_sesiones_token_hash_key" ON "tbl_sesiones"("token_hash");
CREATE INDEX "tbl_sesiones_usuario_id_idx" ON "tbl_sesiones"("usuario_id");
ALTER TABLE "tbl_sesiones" ADD CONSTRAINT "tbl_sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "tbl_usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
