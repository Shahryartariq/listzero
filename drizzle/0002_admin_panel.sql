CREATE TABLE "activity" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"seen_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_login_method" text;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_id_idx" ON "activity" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_seen_at_idx" ON "activity" USING btree ("seen_at");