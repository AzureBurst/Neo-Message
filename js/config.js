// =====================================================================
//  NEO MESSAGE — configuration
//
//  Fill in the two values below, then save. That's the only file you
//  have to edit to get the app running.
//
//  Find them in Supabase: Project Settings -> API
//    SUPABASE_URL      is the "Project URL"
//    SUPABASE_ANON_KEY is the "anon / public" key
//
//  The anon key is designed to be public — it is safe in a GitHub repo.
//  What protects your data is the row level security in sql/schema.sql,
//  not the secrecy of this key.
//
//  Never put the "service_role" key here. That one bypasses all
//  security rules and must stay off the internet.
// =====================================================================

export const SUPABASE_URL = https://lcccnnzwnfmlqrjluudw.supabase.co/rest/v1/;
export const SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjY2Nubnp3bmZtbHFyamx1dWR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0ODkwMDQsImV4cCI6MjEwMDA2NTAwNH0.QCJ3TfVMir8xleA4_nRtTq0dkJpIY_0RjkzmmJsQ1Ws;

// Cosmetic settings — change these freely.
export const APP_NAME = 'Neo Message';
export const CARRIER_NAME = 'NEO';

// Usernames are turned into fake email addresses so Supabase auth can
// use them. Players never see this domain.
export const AUTH_DOMAIN = 'neo.local';

// Largest image a player can attach or use as a profile icon.
export const MAX_UPLOAD_MB = 5;
