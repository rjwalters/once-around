CREATE TABLE alignment_reports (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX alignment_reports_received_at ON alignment_reports(received_at);
