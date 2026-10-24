CREATE TABLE "notificacion" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"tarea_id" text NOT NULL,
	"mensaje" text NOT NULL,
	"leida" boolean DEFAULT false NOT NULL,
	"email_estado" text DEFAULT 'pendiente' NOT NULL,
	"intentos_email" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notificacion_email_estado_check" CHECK (email_estado in ('pendiente', 'enviado', 'omitido', 'fallido'))
);
--> statement-breakpoint
CREATE TABLE "recordatorio" (
	"id" text PRIMARY KEY NOT NULL,
	"tarea_id" text NOT NULL,
	"fecha_hora" timestamp with time zone NOT NULL,
	"origen" text NOT NULL,
	"tipo_automatico" text,
	"creado_por" text,
	"enviado_at" timestamp with time zone,
	"cancelado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordatorio_origen_check" CHECK (origen in ('automatico', 'manual')),
	CONSTRAINT "recordatorio_tipo_check" CHECK ((origen = 'manual' and tipo_automatico is null) or (origen = 'automatico' and tipo_automatico in ('3_dias_antes', 'dia_vencimiento', 'vencida_diario')))
);
--> statement-breakpoint
CREATE TABLE "tarea" (
	"id" text PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"area_id" integer NOT NULL,
	"responsable_id" text,
	"fecha_limite" date,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"notas" text,
	"creado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tarea_estado_check" CHECK (estado in ('pendiente', 'en_curso', 'hecha'))
);
--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_tarea_id_tarea_id_fk" FOREIGN KEY ("tarea_id") REFERENCES "public"."tarea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorio" ADD CONSTRAINT "recordatorio_tarea_id_tarea_id_fk" FOREIGN KEY ("tarea_id") REFERENCES "public"."tarea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorio" ADD CONSTRAINT "recordatorio_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_responsable_id_user_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notificacion_usuario_idx" ON "notificacion" USING btree ("usuario_id","leida");--> statement-breakpoint
CREATE INDEX "notificacion_email_pendiente_idx" ON "notificacion" USING btree ("created_at") WHERE email_estado = 'pendiente';--> statement-breakpoint
CREATE INDEX "recordatorio_tarea_idx" ON "recordatorio" USING btree ("tarea_id");--> statement-breakpoint
CREATE INDEX "recordatorio_pendiente_idx" ON "recordatorio" USING btree ("fecha_hora") WHERE enviado_at is null and cancelado_at is null;--> statement-breakpoint
CREATE INDEX "tarea_area_idx" ON "tarea" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "tarea_responsable_idx" ON "tarea" USING btree ("responsable_id");