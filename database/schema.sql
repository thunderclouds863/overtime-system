-- TABEL USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'employee' 
    CHECK (role IN ('employee', 'manager', 'admin')),
  jabatan VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- TABEL OVERTIME RECORDS
CREATE TABLE IF NOT EXISTS overtime_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  planned_duration INTERVAL NOT NULL,
  planned_start TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  source VARCHAR(20) DEFAULT 'employee' 
    CHECK (source IN ('employee', 'manager')),
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'revision',
    'active', 'cancelled',
    'pending_verification', 'proof_revision', 'verify_rejected',
    'completed'
  )),
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  actual_duration INTERVAL,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION,
  gps_distance INTEGER,
  auto_started BOOLEAN DEFAULT FALSE,
  auto_start_failed_reason TEXT,
  proof_text TEXT,
  proof_file_name VARCHAR(255),
  proof_uploaded_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_note TEXT,
  revision_count INTEGER DEFAULT 0,
  verified_by INTEGER REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  verify_rating INTEGER CHECK (verify_rating BETWEEN 1 AND 5),
  verify_note TEXT,
  proof_revision_count INTEGER DEFAULT 0,
  cancel_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overtime_employee ON overtime_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_overtime_status ON overtime_records(status);
CREATE INDEX IF NOT EXISTS idx_overtime_planned ON overtime_records(planned_start);

-- TABEL ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  record_id INTEGER REFERENCES overtime_records(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  actor_name VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_record ON activity_logs(record_id);

-- ADMIN PERTAMA (password: admin123)
INSERT INTO users (email, password_hash, full_name, role) VALUES
('admin@cimory.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Super Admin', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (email, password_hash, full_name, role, department) VALUES
('atasan@cimory.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Budi Atasan', 'manager', 'Keuangan')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (email, password_hash, full_name, role, department) VALUES
('opet@cimory.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Opet', 'employee', 'Keuangan')
ON CONFLICT (email) DO NOTHING;
