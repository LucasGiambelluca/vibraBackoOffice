"use client";

import { useEffect } from "react";
import { COOKIE_EVENTO } from "@/lib/evento-cookie";

/** Guarda el evento que se está viendo (las cookies no se pueden escribir al renderizar en el servidor). */
export function RecordarEvento({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `${COOKIE_EVENTO}=${id}; path=/; max-age=31536000; samesite=lax`;
  }, [id]);
  return null;
}
