CREATE TABLE IF NOT EXISTS "audition_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_id" integer NOT NULL,
	"candidate_user_id" integer NOT NULL,
	"vibe_participant_id" varchar(255),
	"registration_status" varchar(50) DEFAULT 'registered',
	"registered_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audition_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"vibe_assessment_id" varchar(255),
	"title" varchar(255) NOT NULL,
	"description" text,
	"start_time" timestamp,
	"end_time" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audition_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"registration_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"vibe_submission_id" varchar(255),
	"repo_url" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"score" integer,
	"submitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"company_draft_id" integer,
	"status" varchar(50) DEFAULT 'draft',
	"vibe_event_id" varchar(255),
	"round1_open" boolean DEFAULT false,
	"round2_open" boolean DEFAULT false,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "auditions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"firebase_uid" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false,
	"candidate_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "candidate_users_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"audition_id" integer NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submission_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"reviewer_id" integer NOT NULL,
	"score_criteria" jsonb,
	"final_score" integer NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audition_registrations" ADD CONSTRAINT "audition_registrations_audition_id_auditions_id_fk" FOREIGN KEY ("audition_id") REFERENCES "public"."auditions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audition_registrations" ADD CONSTRAINT "audition_registrations_candidate_user_id_candidate_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."candidate_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audition_rounds" ADD CONSTRAINT "audition_rounds_audition_id_auditions_id_fk" FOREIGN KEY ("audition_id") REFERENCES "public"."auditions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audition_submissions" ADD CONSTRAINT "audition_submissions_registration_id_audition_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."audition_registrations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audition_submissions" ADD CONSTRAINT "audition_submissions_round_id_audition_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."audition_rounds"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auditions" ADD CONSTRAINT "auditions_company_draft_id_company_audition_drafts_id_fk" FOREIGN KEY ("company_draft_id") REFERENCES "public"."company_audition_drafts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidate_users" ADD CONSTRAINT "candidate_users_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_audition_id_auditions_id_fk" FOREIGN KEY ("audition_id") REFERENCES "public"."auditions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_submission_id_audition_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."audition_submissions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submission_reviews" ADD CONSTRAINT "submission_reviews_reviewer_id_jury_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."jury_members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
