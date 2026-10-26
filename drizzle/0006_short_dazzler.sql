ALTER TABLE "cotizacion" ADD COLUMN "aprobada_por" text;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD COLUMN "aprobada_at" timestamp;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_aprobada_por_user_id_fk" FOREIGN KEY ("aprobada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;