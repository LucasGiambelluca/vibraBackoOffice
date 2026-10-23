import { usuarioActual } from "@/lib/session";

export default async function TableroPage() {
  const usuario = await usuarioActual();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Hola, {usuario.name}</h1>
      <p className="text-muted-foreground">Vibra Bolivia 2027 — back office de producción.</p>
    </div>
  );
}
