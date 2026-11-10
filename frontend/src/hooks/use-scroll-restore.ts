"use client";
import { useEffect } from "react";

/** Recuerda la posición de la lista al abrir un soporte y la restaura al volver, cuando los datos ya están listos. */
export function useScrollRestore(clave: string, listo: boolean) {
  useEffect(() => {
    const guardar = () => sessionStorage.setItem(`scroll:${clave}`, String(window.scrollY));
    window.addEventListener("pagehide", guardar);
    return () => {
      guardar();
      window.removeEventListener("pagehide", guardar);
    };
  }, [clave]);
  useEffect(() => {
    if (!listo) return;
    const y = Number(sessionStorage.getItem(`scroll:${clave}`));
    if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [clave, listo]);
}
