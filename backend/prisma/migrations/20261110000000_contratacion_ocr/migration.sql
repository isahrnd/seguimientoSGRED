-- OCR local por versión y página.
CREATE TABLE "tbl_contratacion_ocr_paginas" (
    "id" SERIAL NOT NULL,
    "version_id" INTEGER NOT NULL,
    "pagina" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "motor" VARCHAR(40) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tbl_contratacion_ocr_paginas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tbl_contratacion_ocr_paginas_version_id_pagina_key" ON "tbl_contratacion_ocr_paginas"("version_id", "pagina");
ALTER TABLE "tbl_contratacion_ocr_paginas" ADD CONSTRAINT "tbl_contratacion_ocr_paginas_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "tbl_contratacion_doc_versiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
