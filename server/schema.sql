-- Esquema de la plataforma El Profesor Carlos

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS courses (
  id                 SERIAL PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  price_pen          NUMERIC(10,2) NOT NULL,
  sessions_included  INTEGER NOT NULL DEFAULT 3,
  pdf_path           TEXT,
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        INTEGER NOT NULL REFERENCES courses(id),
  buyer_name       TEXT NOT NULL,
  buyer_email      TEXT NOT NULL,
  amount_pen       NUMERIC(10,2) NOT NULL,
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('culqi', 'manual')),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'pending_review', 'paid', 'rejected')),
  culqi_charge_id  TEXT,
  manual_channel   TEXT,   -- zelle | pagomovil | binance | otro
  manual_reference TEXT,   -- nro de referencia reportado por el comprador
  access_token     TEXT UNIQUE,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_token  ON purchases(access_token);

CREATE TABLE IF NOT EXISTS session_slots (
  id               SERIAL PRIMARY KEY,
  course_id        INTEGER NOT NULL REFERENCES courses(id),
  starts_at        TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'booked', 'cancelled')),
  purchase_id      UUID REFERENCES purchases(id),
  meeting_link     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slots_course_status ON session_slots(course_id, status);
