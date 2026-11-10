"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/** Filtros y búsqueda viven en la URL: «Atrás» y «Volver» los restauran sin estado adicional. */
export function useUrlState<K extends string>(claves: readonly K[]) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const valores = useMemo(
    () => Object.fromEntries(claves.map((k) => [k, sp.get(k) ?? ""])) as Record<K, string>,
    [sp, claves],
  );
  const cambiar = useCallback(
    (cambios: Partial<Record<K, string>>) => {
      const u = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(cambios) as [string, string][]) {
        if (v) u.set(k, v);
        else u.delete(k);
      }
      const s = u.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );
  return { valores, cambiar };
}
