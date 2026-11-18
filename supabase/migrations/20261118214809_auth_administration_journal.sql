-- Administrative fingerprints and assignments are isolated from application data.
CREATE SCHEMA esmeraldinha_auth_admin;
REVOKE ALL ON SCHEMA esmeraldinha_auth_admin FROM PUBLIC, anon, authenticated, service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'esmeraldinha_auth_admin_runtime') THEN
    CREATE ROLE esmeraldinha_auth_admin_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA esmeraldinha_auth_admin TO esmeraldinha_auth_admin_runtime;
SET search_path = esmeraldinha_auth_admin, pg_catalog;

CREATE TABLE assignments (
  professor_id UUID PRIMARY KEY,
  auth_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  operation_id UUID NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE operations (
  id UUID PRIMARY KEY,
  professor_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  complete BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX operations_professor_id ON operations(professor_id);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON assignments TO esmeraldinha_auth_admin_runtime USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY backend_access ON operations TO esmeraldinha_auth_admin_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON assignments, operations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignments, operations TO esmeraldinha_auth_admin_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA esmeraldinha_auth_admin REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA esmeraldinha_auth_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
RESET search_path;
