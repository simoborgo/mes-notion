-- Fase 8: clienti verniciatura come tabella reale, non più solo la lista fissa
-- CLIENTI_VERNICIATURA nel codice. Il form Campionatura deve poter aggiungere un cliente al
-- volo, quindi la lista deve poter crescere senza un deploy. Univocità case-insensitive per
-- mantenere lo stesso obiettivo per cui la lista fissa era nata: evitare varianti di scrittura
-- dello stesso cliente (es. "Gucci" vs "gucci").
CREATE TABLE IF NOT EXISTS clienti_verniciatura (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clienti_verniciatura_nome_lower_idx ON clienti_verniciatura (LOWER(nome));

INSERT INTO clienti_verniciatura (nome) VALUES
  ('Gucci'), ('Armani'), ('Cartier'), ('Diesel'), ('Bottega Veneta'),
  ('Brioni'), ('Boucheron'), ('Mage'), ('Villa Giuseppina'), ('Valentino')
ON CONFLICT (LOWER(nome)) DO NOTHING;
