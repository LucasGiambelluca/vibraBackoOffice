import { cn } from "@/lib/utils";

const TONOS = {
  neutro: "bg-muted text-muted-foreground",
  marca: "bg-marca-suave text-marca-tinta",
  ok: "bg-ok-suave text-ok",
  aviso: "bg-aviso-suave text-aviso",
  peligro: "bg-peligro-suave text-peligro",
  info: "bg-info-suave text-info",
} as const;

export type Tono = keyof typeof TONOS;

/** Estado en una pastilla de color suave con un punto. */
export function Pastilla({
  tono = "neutro",
  punto = true,
  className,
  children,
}: {
  tono?: Tono;
  punto?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        TONOS[tono],
        className,
      )}
    >
      {punto && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
