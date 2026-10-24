CREATE TABLE "area" (
	"id" integer PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	CONSTRAINT "area_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "cotizacion" (
	"id" text PRIMARY KEY NOT NULL,
	"rubro_id" text NOT NULL,
	"proveedor_id" text NOT NULL,
	"descripcion" text NOT NULL,
	"moneda" text NOT NULL,
	"precio_dia" numeric(14, 2) NOT NULL,
	"descuento_2_dias" numeric(5, 2) DEFAULT '0' NOT NULL,
	"adjunto" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"creado_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cotizacion_moneda_check" CHECK (moneda in ('BOB', 'USD', 'ARS')),
	CONSTRAINT "cotizacion_estado_check" CHECK (estado in ('pendiente', 'aprobada', 'descartada')),
	CONSTRAINT "cotizacion_precio_check" CHECK (precio_dia > 0),
	CONSTRAINT "cotizacion_descuento_check" CHECK (descuento_2_dias between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "proveedor" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"contacto" text,
	"telefono" text,
	"email" text,
	"notas" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "proveedor_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "rubro" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"area_id" integer NOT NULL,
	"dias" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rubro_nombre_unique" UNIQUE("nombre"),
	CONSTRAINT "rubro_dias_check" CHECK (dias in (1, 2))
);
--> statement-breakpoint
CREATE TABLE "tipo_cambio" (
	"moneda" text PRIMARY KEY NOT NULL,
	"valor_bob" numeric(14, 6) NOT NULL,
	"actualizado_por" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tipo_cambio_moneda_check" CHECK (moneda in ('USD', 'ARS')),
	CONSTRAINT "tipo_cambio_valor_check" CHECK (valor_bob > 0)
);
--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_rubro_id_rubro_id_fk" FOREIGN KEY ("rubro_id") REFERENCES "public"."rubro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_proveedor_id_proveedor_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedor"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubro" ADD CONSTRAINT "rubro_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_cambio" ADD CONSTRAINT "tipo_cambio_actualizado_por_user_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cotizacion_una_aprobada_por_rubro" ON "cotizacion" USING btree ("rubro_id") WHERE estado = 'aprobada';--> statement-breakpoint
CREATE INDEX "cotizacion_rubro_idx" ON "cotizacion" USING btree ("rubro_id");--> statement-breakpoint
CREATE INDEX "cotizacion_proveedor_idx" ON "cotizacion" USING btree ("proveedor_id");