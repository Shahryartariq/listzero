CREATE TABLE "shared_invite" (
	"list_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shared_invite_list_id_email_pk" PRIMARY KEY("list_id","email")
);
--> statement-breakpoint
CREATE TABLE "shared_item" (
	"list_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"data" jsonb,
	"deleted" boolean DEFAULT false NOT NULL,
	"rev" bigint NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shared_item_list_id_item_id_pk" PRIMARY KEY("list_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "shared_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"access" text DEFAULT 'restricted' NOT NULL,
	"link_role" text DEFAULT 'edit' NOT NULL,
	"link_token" text NOT NULL,
	"rev" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shared_list_link_token_unique" UNIQUE("link_token")
);
--> statement-breakpoint
CREATE TABLE "shared_member" (
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shared_member_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "shared_invite" ADD CONSTRAINT "shared_invite_list_id_shared_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shared_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_item" ADD CONSTRAINT "shared_item_list_id_shared_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shared_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_member" ADD CONSTRAINT "shared_member_list_id_shared_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shared_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_member" ADD CONSTRAINT "shared_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_invite_email_idx" ON "shared_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "shared_item_list_rev_idx" ON "shared_item" USING btree ("list_id","rev");--> statement-breakpoint
CREATE INDEX "shared_member_user_idx" ON "shared_member" USING btree ("user_id");