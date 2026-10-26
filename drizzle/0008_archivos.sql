CREATE TABLE "archivo" (
	"id" text PRIMARY KEY NOT NULL,
	"evento_id" text NOT NULL,
	"evento_rubro_id" text,
	"cotizacion_id" text,
	"tarea_id" text,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"guardado" text NOT NULL,
	"miniatura" text,
	"bytes" integer,
	"subido_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "archivo_guardado_unique" UNIQUE("guardado"),
	CONSTRAINT "archivo_tipo_check" CHECK (tipo in ('pdf', 'imagen')),
	CONSTRAINT "archivo_un_duenio_check" CHECK (num_nonnulls(evento_rubro_id, cotizacion_id, tarea_id) <= 1)
);
--> statement-breakpoint
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."evento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_evento_rubro_id_evento_rubro_id_fk" FOREIGN KEY ("evento_rubro_id") REFERENCES "public"."evento_rubro"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_cotizacion_id_cotizacion_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_tarea_id_tarea_id_fk" FOREIGN KEY ("tarea_id") REFERENCES "public"."tarea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_subido_por_user_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archivo_evento_idx" ON "archivo" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "archivo_evento_rubro_idx" ON "archivo" USING btree ("evento_rubro_id");--> statement-breakpoint
CREATE INDEX "archivo_cotizacion_idx" ON "archivo" USING btree ("cotizacion_id");--> statement-breakpoint
CREATE INDEX "archivo_tarea_idx" ON "archivo" USING btree ("tarea_id");--> statement-breakpoint
-- El PDF de cada cotización pasa a ser un archivo de la cotización.
INSERT INTO "archivo" ("id", "evento_id", "cotizacion_id", "tipo", "nombre", "guardado", "subido_por", "created_at")
SELECT gen_random_uuid()::text, er.evento_id, c.id, 'pdf', 'Cotización.pdf', c.adjunto, c.creado_por, c.created_at
FROM "cotizacion" c
JOIN "evento_rubro" er ON er.id = c.evento_rubro_id
WHERE c.adjunto IS NOT NULL;--> statement-breakpoint
ALTER TABLE "cotizacion" DROP COLUMN "adjunto";