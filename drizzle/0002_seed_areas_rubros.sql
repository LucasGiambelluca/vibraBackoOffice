INSERT INTO "area" ("id", "nombre") VALUES
  (1, 'Marketing y Audiovisual'),
  (2, 'Técnica, Escenario y Backline'),
  (3, 'Logística, Hospitalidad y RRHH'),
  (4, 'Infraestructura y Predio'),
  (5, 'Seguridad y Prevención'),
  (6, 'Gestión Presupuestaria');
--> statement-breakpoint
INSERT INTO "rubro" ("id", "nombre", "area_id", "dias") VALUES
  (gen_random_uuid()::text, 'Técnica', 2, 2),
  (gen_random_uuid()::text, 'Sonido', 2, 2),
  (gen_random_uuid()::text, 'Pantalla', 2, 2),
  (gen_random_uuid()::text, 'Escenario', 2, 2),
  (gen_random_uuid()::text, 'Luces', 2, 2),
  (gen_random_uuid()::text, 'Vallas blancas', 4, 2),
  (gen_random_uuid()::text, 'Vallas freestanding', 4, 2);
