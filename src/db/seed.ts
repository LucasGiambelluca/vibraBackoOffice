import { crearUsuario, nuevoUsuarioSchema } from "@/lib/users";
import { crearDb } from "./client";

async function main() {
  const [email, nombre, password] = process.argv.slice(2);
  if (!email || !nombre || !password) {
    console.error('Uso: npm run db:seed -- <email> "<nombre>" <contraseña>');
    process.exit(1);
  }

  const db = crearDb(process.env.DATABASE_URL || undefined);
  const datos = nuevoUsuarioSchema.parse({ email, nombre, password, rol: "admin" });
  await crearUsuario(db, datos);
  console.log(`Admin creado: ${datos.email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
