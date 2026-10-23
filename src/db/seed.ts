import { crearUsuario, nuevoUsuarioSchema } from "@/lib/users";
import { cerrarDb, crearDb } from "./client";

async function main() {
  const [email, nombre, password] = process.argv.slice(2);
  if (!email || !nombre || !password) {
    console.error('Uso: npm run db:seed -- <email> "<nombre>" <contraseña>');
    process.exit(1);
  }

  const datos = nuevoUsuarioSchema.parse({ email, nombre, password, rol: "admin" });
  const db = crearDb(process.env.DATABASE_URL || undefined);
  try {
    await crearUsuario(db, datos);
  } finally {
    await cerrarDb(db);
  }
  console.log(`Admin creado: ${datos.email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
