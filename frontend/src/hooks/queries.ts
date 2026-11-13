"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  BibliotecaRespuesta,
  ComparacionExpedientes,
  DetalleEdificio,
  DetalleExpediente,
  EdificioFila,
  EstadoSincronizacion,
  FichaPrecios,
  FiltrosBiblioteca,
  FiltrosContratacion,
  FuenteEstado,
  HojaRespuesta,
  ListadoContratacion,
  RespuestaAnalisisPrecios,
  VistaPrecios,
  TrabajoIndice,
} from "@/types/contratacion";

const K = "sgred";
const base = { retry: false, gcTime: 0 } as const;

export const useExpedientes = (f: FiltrosContratacion) =>
  useQuery({
    ...base,
    queryKey: [K, "lista", f],
    placeholderData: (p) => p,
    queryFn: () => api.get<ListadoContratacion>("/expedientes", f as Record<string, unknown>),
  });

export const useDetalleExpediente = (id: number) =>
  useQuery({
    ...base,
    queryKey: [K, "detalle", id],
    enabled: Number.isInteger(id),
    queryFn: () => api.get<DetalleExpediente>(`/expedientes/${id}`),
  });

export const useComparar = (a: number, b: number | null) =>
  useQuery({
    ...base,
    queryKey: [K, "comparar", a, b],
    enabled: b !== null,
    queryFn: () => api.get<ComparacionExpedientes>("/comparar", { a, b }),
  });

export const useEdificios = (q: string) =>
  useQuery({
    ...base,
    queryKey: [K, "edificios", q],
    placeholderData: (p) => p,
    queryFn: () => api.get<{ edificios: EdificioFila[]; total: number }>("/edificios", { q }),
  });

export const useDetalleEdificio = (id: number) =>
  useQuery({
    ...base,
    queryKey: [K, "edificio", id],
    enabled: Number.isInteger(id),
    queryFn: () => api.get<DetalleEdificio>(`/edificios/${id}`),
  });

export const usePreciosPorEdificio = () =>
  useQuery({ ...base, queryKey: [K, "precios-por-edificio"], queryFn: () => api.get<VistaPrecios>("/precios-por-edificio") });

export const useFichaPrecios = (clave: string) =>
  useQuery({ ...base, queryKey: [K, "precios-por-edificio", clave], enabled: !!clave, queryFn: () => api.get<FichaPrecios>(`/precios-por-edificio/${clave}`) });

export const useAnalisisPrecios = () =>
  useQuery({ ...base, queryKey: [K, "analisis-precios"], queryFn: () => api.get<RespuestaAnalisisPrecios>("/analisis-precios") });

export const useBiblioteca = (f: FiltrosBiblioteca) =>
  useQuery({
    ...base,
    queryKey: [K, "biblioteca", f],
    placeholderData: (p) => p,
    queryFn: () => api.get<BibliotecaRespuesta>("/documentos", f as Record<string, unknown>),
  });

export const useHoja = (versionId: number, indice: number) =>
  useQuery({
    ...base,
    queryKey: [K, "hoja", versionId, indice],
    enabled: Number.isInteger(versionId),
    queryFn: () => api.get<HojaRespuesta>(`/documentos/${versionId}/hoja`, { indice }),
  });

export const useSincronizacion = () =>
  useQuery({
    ...base,
    queryKey: [K, "sincronizacion"],
    refetchInterval: 60_000,
    queryFn: () => api.get<EstadoSincronizacion>("/sincronizacion"),
  });

export const useFuentes = () =>
  useQuery({
    ...base,
    queryKey: [K, "fuentes"],
    refetchInterval: 60_000,
    queryFn: () => api.get<FuenteEstado[]>("/fuentes"),
  });

/**
 * «Actualizar índice»: el servidor responde enseguida con el trabajo (o el que ya estaba corriendo) y esta consulta
 * lo sigue hasta que termina; al terminar se refrescan biblioteca, expedientes y edificios sin tocar los filtros de la URL.
 */
export function useActualizarIndice() {
  const qc = useQueryClient();
  const [seguir, setSeguir] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const visto = useRef<number | null>(null);

  const iniciar = useMutation({
    mutationFn: () => api.post<{ trabajo: TrabajoIndice; ya_en_curso: boolean }>("/reindexar"),
    onSuccess: (r) => {
      setAviso(r.ya_en_curso ? "Ya había una actualización en curso; se muestra su avance." : null);
      visto.current = null;
      setSeguir(true);
      qc.setQueryData([K, "indice-estado"], { trabajo: r.trabajo });
    },
    onError: (e) => {
      setSeguir(false);
      const st = e instanceof ApiError ? e.status : 0;
      setAviso(
        st === 403
          ? "Su cuenta no tiene permiso para actualizar el índice."
          : st === 401
            ? "La sesión expiró; vuelva a iniciar sesión."
            : "No fue posible iniciar la actualización. Intente de nuevo.",
      );
    },
  });

  const estado = useQuery({
    ...base,
    queryKey: [K, "indice-estado"],
    enabled: seguir,
    refetchInterval: (q) =>
      (q.state.data as { trabajo: TrabajoIndice | null } | undefined)?.trabajo?.estado === "EN_CURSO" ? 1200 : false,
    queryFn: () => api.get<{ trabajo: TrabajoIndice | null }>("/reindexar/estado"),
  });

  const trabajo = estado.data?.trabajo ?? iniciar.data?.trabajo ?? null;
  const enCurso = iniciar.isPending || (seguir && trabajo?.estado === "EN_CURSO");

  useEffect(() => {
    if (!trabajo || trabajo.estado === "EN_CURSO" || visto.current === trabajo.id) return;
    visto.current = trabajo.id;
    setSeguir(false);
    void qc.invalidateQueries({ queryKey: [K], predicate: (q) => q.queryKey[1] !== "indice-estado" });
  }, [trabajo, qc]);

  return { iniciar: () => iniciar.mutate(), enCurso, trabajo, aviso, errorConsulta: estado.isError };
}
