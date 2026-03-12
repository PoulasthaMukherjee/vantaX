import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });

const schemaStatements = [
  {
    name: 'candidates',
    statement: `CREATE TABLE IF NOT EXISTS candidates (
      id serial PRIMARY KEY,
      full_name varchar(255) NOT NULL,
      email varchar(255) NOT NULL UNIQUE,
      phone varchar(20) NOT NULL,
      linkedin_url varchar(500) NOT NULL,
      resume_path varchar(500) NOT NULL,
      college varchar(255),
      graduation_year varchar(10),
      degree_branch varchar(255),
      referral_source varchar(255),
      payment_status varchar(50) DEFAULT 'pending',
      payment_id varchar(255),
      created_at timestamp DEFAULT now()
    )`,
  },
  {
    name: 'companies',
    statement: `CREATE TABLE IF NOT EXISTS companies (
      id serial PRIMARY KEY,
      company_name varchar(255) NOT NULL,
      website_url varchar(500) NOT NULL,
      industry varchar(100),
      company_size varchar(50),
      company_stage varchar(50),
      roles_hiring_for text,
      contact_name varchar(255) NOT NULL,
      contact_role varchar(255),
      contact_email varchar(255) NOT NULL,
      contact_phone varchar(20),
      contact_linkedin varchar(500),
      problem_title varchar(500) NOT NULL,
      problem_description text,
      business_context text NOT NULL,
      core_task text NOT NULL,
      expected_deliverables text,
      preferred_stack varchar(255),
      tech_stack varchar(255),
      tool_restrictions varchar(500),
      difficulty_level varchar(50),
      nominate_jury varchar(20),
      jury_name varchar(255),
      jury_designation varchar(255),
      custom_eval_criteria text,
      strong_solution_criteria text,
      hiring_intent varchar(100),
      preferred_timeline varchar(50),
      approx_openings varchar(50),
      number_roles varchar(50),
      skills_looking_for text,
      final_round_attendee_name varchar(255),
      final_round_attendee_role varchar(255),
      suggest_challenge boolean DEFAULT false,
      confirmations text,
      created_at timestamp DEFAULT now()
    )`,
  },
  {
    name: 'company_audition_drafts',
    statement: `CREATE TABLE IF NOT EXISTS company_audition_drafts (
      id serial PRIMARY KEY,
      status varchar(50) NOT NULL DEFAULT 'lead_captured',
      contact_name varchar(255) NOT NULL,
      company_name varchar(255) NOT NULL,
      work_email varchar(255) NOT NULL,
      email_verified_at timestamp,
      verification_code_hash varchar(255),
      verification_expires_at timestamp,
      website_url varchar(500),
      company_size varchar(50),
      industry varchar(100),
      roles_hiring_for text,
      number_roles varchar(50),
      tech_stack varchar(255),
      skills_to_evaluate text,
      problem_context text,
      strong_solution_criteria text,
      suggest_challenge boolean DEFAULT false,
      generated_draft_json text,
      edited_draft_json text,
      generation_count integer NOT NULL DEFAULT 0,
      last_generated_at timestamp,
      final_round_attendee_name varchar(255),
      final_round_attendee_role varchar(255),
      preferred_timeline varchar(50),
      contact_linkedin varchar(500),
      submitted_at timestamp,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )`,
  },
  {
    name: 'jury_members',
    statement: `CREATE TABLE IF NOT EXISTS jury_members (
      id serial PRIMARY KEY,
      full_name varchar(255) NOT NULL,
      email varchar(255) NOT NULL,
      linkedin_url varchar(500) NOT NULL,
      "current_role" varchar(255),
      company varchar(255),
      domain_expertise text,
      years_experience varchar(20),
      availability varchar(50),
      motivation text,
      created_at timestamp DEFAULT now()
    )`,
  },
  { name: 'companies.company_size', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_size varchar(50)' },
  { name: 'companies.roles_hiring_for', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS roles_hiring_for text' },
  { name: 'companies.contact_linkedin', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_linkedin varchar(500)' },
  { name: 'companies.problem_description', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS problem_description text' },
  { name: 'companies.tech_stack', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS tech_stack varchar(255)' },
  { name: 'companies.strong_solution_criteria', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS strong_solution_criteria text' },
  { name: 'companies.preferred_timeline', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS preferred_timeline varchar(50)' },
  { name: 'companies.number_roles', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS number_roles varchar(50)' },
  { name: 'companies.final_round_attendee_name', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS final_round_attendee_name varchar(255)' },
  { name: 'companies.final_round_attendee_role', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS final_round_attendee_role varchar(255)' },
  { name: 'companies.suggest_challenge', statement: 'ALTER TABLE companies ADD COLUMN IF NOT EXISTS suggest_challenge boolean DEFAULT false' },
];

export async function ensureDatabaseSchema() {
  for (const entry of schemaStatements) {
    try {
      await client.unsafe(entry.statement);
      console.log(`Database table ensured: ${entry.name}`);
    } catch (error) {
      console.error(`Database table init failed: ${entry.name}`, error);
    }
  }
}
