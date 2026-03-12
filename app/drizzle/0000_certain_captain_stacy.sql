CREATE TABLE IF NOT EXISTS "candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"linkedin_url" varchar(500) NOT NULL,
	"resume_path" varchar(500) NOT NULL,
	"college" varchar(255),
	"graduation_year" varchar(10),
	"degree_branch" varchar(255),
	"referral_source" varchar(255),
	"payment_status" varchar(50) DEFAULT 'pending',
	"payment_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "candidates_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"website_url" varchar(500) NOT NULL,
	"industry" varchar(100),
	"company_size" varchar(50),
	"company_stage" varchar(50),
	"roles_hiring_for" text,
	"contact_name" varchar(255) NOT NULL,
	"contact_role" varchar(255),
	"contact_email" varchar(255) NOT NULL,
	"contact_phone" varchar(20),
	"contact_linkedin" varchar(500),
	"problem_title" varchar(500) NOT NULL,
	"problem_description" text,
	"business_context" text NOT NULL,
	"core_task" text NOT NULL,
	"expected_deliverables" text,
	"preferred_stack" varchar(255),
	"tech_stack" varchar(255),
	"tool_restrictions" varchar(500),
	"difficulty_level" varchar(50),
	"nominate_jury" varchar(20),
	"jury_name" varchar(255),
	"jury_designation" varchar(255),
	"custom_eval_criteria" text,
	"strong_solution_criteria" text,
	"hiring_intent" varchar(100),
	"preferred_timeline" varchar(50),
	"approx_openings" varchar(50),
	"number_roles" varchar(50),
	"skills_looking_for" text,
	"final_round_attendee_name" varchar(255),
	"final_round_attendee_role" varchar(255),
	"suggest_challenge" boolean DEFAULT false,
	"confirmations" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jury_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"linkedin_url" varchar(500) NOT NULL,
	"current_role" varchar(255),
	"company" varchar(255),
	"domain_expertise" text,
	"years_experience" varchar(20),
	"availability" varchar(50),
	"motivation" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "company_size" varchar(50);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "roles_hiring_for" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "contact_linkedin" varchar(500);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "problem_description" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tech_stack" varchar(255);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "strong_solution_criteria" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "preferred_timeline" varchar(50);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "number_roles" varchar(50);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "final_round_attendee_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "final_round_attendee_role" varchar(255);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "suggest_challenge" boolean DEFAULT false;
