-- Schema + akun demo untuk instance portfolio (DEMO_MODE=1). Idempotent.
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

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);


-- ===== Kolom tambahan yang dipakai kode (sinkron dengan backend/src) =====
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('employee', 'manager', 'admin', 'reviewer'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS level VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approver_ids INTEGER[] DEFAULT '{}';

ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS is_holiday BOOLEAN DEFAULT FALSE;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS approval_chain INTEGER[] DEFAULT '{}';
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS approval_progress INTEGER DEFAULT 0;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS is_direct_and_final BOOLEAN DEFAULT FALSE;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS direct_approver_id INTEGER REFERENCES users(id);
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS direct_approval_at TIMESTAMPTZ;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS direct_approval_note TEXT;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS final_approver_id INTEGER REFERENCES users(id);
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS final_approval_at TIMESTAMPTZ;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS jumped_in BOOLEAN DEFAULT FALSE;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS verified_by_level VARCHAR(20);
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS proof_file_url TEXT;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS proof_file_size INTEGER;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS proof_notes TEXT;
ALTER TABLE overtime_records ADD COLUMN IF NOT EXISTS proof_external_url TEXT;

-- ===== Akun demo (password semua: demo123) =====
INSERT INTO users (email, password_hash, full_name, role, jabatan, level) VALUES
('admin@demo.local',    '$2a$10$EkcE36hBZyh9riS2tpTFO.s4xcAG9bsCShpuhPC7.TWSRGlUliaAG', 'Demo Admin',    'admin',    'HR Admin',      '5'),
('reviewer@demo.local', '$2a$10$EkcE36hBZyh9riS2tpTFO.s4xcAG9bsCShpuhPC7.TWSRGlUliaAG', 'Demo Reviewer', 'reviewer', 'HR Reviewer',   '4'),
('manager@demo.local',  '$2a$10$EkcE36hBZyh9riS2tpTFO.s4xcAG9bsCShpuhPC7.TWSRGlUliaAG', 'Demo Manager',  'manager',  'Finance Manager','4'),
('spv@demo.local',      '$2a$10$EkcE36hBZyh9riS2tpTFO.s4xcAG9bsCShpuhPC7.TWSRGlUliaAG', 'Demo Supervisor','manager', 'Supervisor',    '3')
ON CONFLICT (email) DO NOTHING;
INSERT INTO users (email, password_hash, full_name, role, jabatan, level, approver_ids)
SELECT 'employee@demo.local', '$2a$10$EkcE36hBZyh9riS2tpTFO.s4xcAG9bsCShpuhPC7.TWSRGlUliaAG', 'Demo Karyawan', 'employee', 'Staff Finance', '2',
       ARRAY[(SELECT id FROM users WHERE email='spv@demo.local')]
ON CONFLICT (email) DO NOTHING;
UPDATE users SET approver_ids = ARRAY[(SELECT id FROM users WHERE email='manager@demo.local')]
 WHERE email='spv@demo.local' AND (approver_ids IS NULL OR approver_ids = '{}');

-- ===== Record contoh di berbagai status (hanya kalau tabel masih kosong) =====
DO $$
DECLARE emp INT; spv INT; mgr INT; rev INT; d DATE;
BEGIN
  IF EXISTS (SELECT 1 FROM overtime_records) THEN RETURN; END IF;
  SELECT id INTO emp FROM users WHERE email='employee@demo.local';
  SELECT id INTO spv FROM users WHERE email='spv@demo.local';
  SELECT id INTO mgr FROM users WHERE email='manager@demo.local';
  SELECT id INTO rev FROM users WHERE email='reviewer@demo.local';

  -- 1) Selesai & terverifikasi
  d := CURRENT_DATE - 6;
  INSERT INTO overtime_records (employee_id, employee_name, date, start_time, planned_duration, planned_start, reason, description,
    status, approval_chain, approval_progress, direct_approver_id, direct_approval_at, final_approver_id, final_approval_at, approved_by, approved_at,
    actual_start, actual_end, actual_duration, gps_lat, gps_lng, gps_distance, proof_text, proof_uploaded_at,
    verified_by, verified_at, verify_rating, verify_note)
  VALUES (emp, 'Demo Karyawan', d, '17:00', '3 hours', (d + TIME '10:00') AT TIME ZONE 'UTC', 'Closing bulanan', 'Rekonsiliasi laporan keuangan',
    'completed', ARRAY[spv,mgr], 2, spv, d - 1, mgr, d - 1, mgr, d - 1,
    (d + TIME '10:00') AT TIME ZONE 'UTC', (d + TIME '13:05') AT TIME ZONE 'UTC', '3 hours 5 minutes', -6.1918, 106.7378, 35,
    'Laporan rekonsiliasi Oktober selesai dan dikirim ke manager', d, mgr, d + 1, 5, 'Hasil rapi');

  -- 2) Menunggu verifikasi bukti
  d := CURRENT_DATE - 2;
  INSERT INTO overtime_records (employee_id, employee_name, date, start_time, planned_duration, planned_start, reason, description,
    status, approval_chain, approval_progress, direct_approver_id, direct_approval_at, final_approver_id, final_approval_at, approved_by, approved_at,
    actual_start, actual_end, actual_duration, gps_lat, gps_lng, gps_distance, proof_text, proof_uploaded_at)
  VALUES (emp, 'Demo Karyawan', d, '17:00', '2 hours', (d + TIME '10:00') AT TIME ZONE 'UTC', 'Audit stok gudang', 'Stock opname akhir bulan',
    'pending_verification', ARRAY[spv,mgr], 2, spv, d - 1, mgr, d - 1, mgr, d - 1,
    (d + TIME '10:00') AT TIME ZONE 'UTC', (d + TIME '12:10') AT TIME ZONE 'UTC', '2 hours 10 minutes', -6.1918, 106.7378, 40,
    'Stock opname selesai, selisih 3 item sudah dicatat', d);

  -- 3) Menunggu approval supervisor (langkah 1)
  d := CURRENT_DATE + 1;
  INSERT INTO overtime_records (employee_id, employee_name, date, start_time, planned_duration, planned_start, reason, description,
    status, approval_chain, approval_progress)
  VALUES (emp, 'Demo Karyawan', d, '17:00', '2 hours', (d + TIME '10:00') AT TIME ZONE 'UTC', 'Persiapan presentasi', 'Menyiapkan deck review kuartal',
    'pending', ARRAY[spv,mgr], 0);

  -- 4) Sudah di-approve supervisor, menunggu manager (final)
  d := CURRENT_DATE + 2;
  INSERT INTO overtime_records (employee_id, employee_name, date, start_time, planned_duration, planned_start, reason, description,
    status, approval_chain, approval_progress, direct_approver_id, direct_approval_at, direct_approval_note)
  VALUES (emp, 'Demo Karyawan', d, '17:00', '3 hours', (d + TIME '10:00') AT TIME ZONE 'UTC', 'Migrasi data', 'Input data vendor ke sistem baru',
    'pending', ARRAY[spv,mgr], 1, spv, NOW(), 'Oke, lanjut ke manager');

  -- 5) Ditolak
  d := CURRENT_DATE - 4;
  INSERT INTO overtime_records (employee_id, employee_name, date, start_time, planned_duration, planned_start, reason, description,
    status, approval_chain, approval_progress, approval_note, rejected_at)
  VALUES (emp, 'Demo Karyawan', d, '17:00', '1 hours', (d + TIME '10:00') AT TIME ZONE 'UTC', 'Rapat vendor', 'Meeting dengan vendor',
    'rejected', ARRAY[spv,mgr], 0, 'Bisa dijadwalkan di jam kerja', d - 1);
END $$;
