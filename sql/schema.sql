BEGIN;

CREATE TABLE users (
                       id SERIAL PRIMARY KEY,
                       name VARCHAR(150) NOT NULL,
                       email VARCHAR(150) UNIQUE NOT NULL,
                       password VARCHAR(255) NOT NULL,
                       role VARCHAR(20) NOT NULL CHECK (role IN ('admin','parent','driver')),
                       phone VARCHAR(30),
                       status VARCHAR(20) DEFAULT 'active',

                       created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE users
    ADD COLUMN address TEXT;

CREATE TABLE schools (
                         id SERIAL PRIMARY KEY,
                         name VARCHAR(200) NOT NULL,
                         address TEXT,
                         opening_time TIME,
                         closing_time TIME
);

ALTER TABLE schools
    ADD COLUMN  created_at TIMESTAMP DEFAULT now();
ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Actif'
        CHECK (status IN ('Actif', 'Inactif'));

-- Update existing schools to have 'Actif' status if they don't have one
UPDATE schools SET status = 'Actif' WHERE status IS NULL;

-- Add schedule column to schools table to store daily schedules as JSON
ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT '[
      {"day": "Lundi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
      {"day": "Mardi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
      {"day": "Mercredi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
      {"day": "Jeudi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
      {"day": "Vendredi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
      {"day": "Samedi", "open": false, "openTime": "00:00", "closeTime": "00:00"},
      {"day": "Dimanche", "open": false, "openTime": "00:00", "closeTime": "00:00"}
    ]'::jsonb;

-- Add status column if not exists
ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Actif'
        CHECK (status IN ('Actif', 'Inactif'));

-- Update existing schools to have default schedule and status
UPDATE schools
SET schedule = '[
  {"day": "Lundi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
  {"day": "Mardi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
  {"day": "Mercredi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
  {"day": "Jeudi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
  {"day": "Vendredi", "open": true, "openTime": "08:00", "closeTime": "18:00"},
  {"day": "Samedi", "open": false, "openTime": "00:00", "closeTime": "00:00"},
  {"day": "Dimanche", "open": false, "openTime": "00:00", "closeTime": "00:00"}
]'::jsonb
WHERE schedule IS NULL;

UPDATE schools SET status = 'Actif' WHERE status IS NULL;


CREATE TABLE children (
                          id SERIAL PRIMARY KEY,
                          parent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                          name VARCHAR(150) NOT NULL,
                          school_id INTEGER REFERENCES schools(id),
                          address TEXT,
                          created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE drivers (
                         id SERIAL PRIMARY KEY,
                         user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                         vehicle_brand TEXT ,         -- marque du véhicule
                         vehicle_color TEXT NOT NULL,         -- couleur du véhicule
                         vehicle_plate TEXT NOT NULL,         -- immatriculation du véhicule
                         license_document TEXT NOT NULL,      -- chemin/URL de la CNI de conduire
                         id_document TEXT NOT NULL,           -- chemin/URL du permis ou passeport
                         vehicle_photo TEXT NOT NULL  ,       -- chemin/URL de la photo du véhicule
                         created_at TIMESTAMP DEFAULT now()

);

ALTER TABLE drivers
    ADD COLUMN status VARCHAR(20) DEFAULT 'En attente'
        CHECK (status IN ('En attente', 'Approuvé', 'Refusé')),
    ADD CONSTRAINT unique_vehicle_plate UNIQUE (vehicle_plate),
    ADD CONSTRAINT unique_driver_user UNIQUE (user_id);





CREATE TABLE trips (
                       id SERIAL PRIMARY KEY,
                       driver_id INTEGER REFERENCES drivers(id),
                       school_id INTEGER REFERENCES schools(id),
                       date TIMESTAMP,
                       start_time TIME,
                       end_time TIME,
                       status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','canceled' )),
                       is_recurring BOOLEAN DEFAULT FALSE,
                       created_at TIMESTAMP DEFAULT now()
);
ALTER TABLE trips
    DROP COLUMN date,
    DROP COLUMN start_time,
    DROP COLUMN end_time;

ALTER TABLE trips
ADD COLUMN  start_point VARCHAR(255) NOT NULL,
 ADD COLUMN   end_point VARCHAR(255) NOT NULL,

  ADD COLUMN    departure_time TIMESTAMP NOT NULL,

  ADD COLUMN   capacity_max INTEGER NOT NULL CHECK (capacity_max > 0);
ALTER TABLE trips
    ADD CONSTRAINT unique_trip_driver_time
        UNIQUE (start_point, end_point, departure_time, driver_id);

ALTER TABLE trips DROP CONSTRAINT trips_status_check;

ALTER TABLE trips
    ADD CONSTRAINT trips_status_check
        CHECK (status IN ('pending', 'in_progress', 'completed', 'canceled'));


CREATE TABLE trip_children (
                               trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
                               child_id INTEGER REFERENCES children(id) ON DELETE CASCADE,
                               PRIMARY KEY (trip_id, child_id)
);
ALTER TABLE trip_children
    ADD COLUMN
    created_at TIMESTAMP DEFAULT now();
CREATE TABLE payments (
                          id SERIAL PRIMARY KEY,
                          user_id INTEGER REFERENCES users(id),
                          amount NUMERIC(10,2) NOT NULL,
                          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('paid','pending','failed')),
                          method VARCHAR(50),
                          transaction_id VARCHAR(200),
                          created_at TIMESTAMP DEFAULT now()
);

ALTER TABLE payments
      ADD COLUMN card_holder_name VARCHAR(150), -- Nom sur la carte
    ADD COLUMN card_last4 VARCHAR(4),          -- 4 derniers chiffres
    ADD COLUMN card_exp_month INTEGER,         -- Mois d'expiration
    ADD COLUMN card_exp_year INTEGER,          -- Année d'expiration
    ADD COLUMN mobile_number VARCHAR(30),      -- Pour Mobile Money
    ADD COLUMN payment_token VARCHAR(255);     -- Token généré par le prestataire


CREATE TABLE evaluations (
                             id SERIAL PRIMARY KEY,
                             trip_id INTEGER REFERENCES trips(id),
                             parent_id INTEGER REFERENCES users(id),
                             driver_id INTEGER REFERENCES drivers(id),
                             rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
                             comment TEXT,
                             created_at TIMESTAMP DEFAULT now()
);



CREATE TABLE subscriptions (
                               id SERIAL PRIMARY KEY,
                               user_id INTEGER REFERENCES users(id),
                               type VARCHAR(100),
                               price NUMERIC(10,2),
                               active BOOLEAN DEFAULT TRUE,
                               created_at TIMESTAMP DEFAULT now(),
                               updated_at TIMESTAMP DEFAULT now()
);

ALTER TABLE subscriptions
    ADD COLUMN start_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN end_date DATE,
    ADD CONSTRAINT unique_user_subscription UNIQUE (user_id, type, start_date);

CREATE TABLE support_tickets (
                                 id SERIAL PRIMARY KEY,
                                 user_id INTEGER REFERENCES users(id),
                                 subject VARCHAR(200),
                                 message TEXT,
                                 status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
                                 created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE password_resets (
                                 id SERIAL PRIMARY KEY,
                                 user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                                 code CHAR(4) NOT NULL,
                                 expires_at TIMESTAMP NOT NULL,
                                 created_at TIMESTAMP DEFAULT now()
);

-- Vues pour dashboard
CREATE VIEW dashboard_user_counts AS
SELECT role, count(*) as total FROM users GROUP BY role;

CREATE VIEW dashboard_revenue_monthly AS
SELECT date_trunc('month', created_at) as month, sum(amount) as total
FROM payments WHERE status='paid' GROUP BY 1 ORDER BY 1 DESC;





-- trips stats
CREATE VIEW v_trips_stats AS
SELECT status, count(*) AS total FROM trips GROUP BY status;



CREATE TABLE public_holidays (
                                 id SERIAL PRIMARY KEY,
                                 date DATE NOT NULL UNIQUE,
                                 label VARCHAR(150) NOT NULL
);

CREATE TABLE school_vacations (
                                  id SERIAL PRIMARY KEY,
                                  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
                                  name VARCHAR(150) NOT NULL,
                                  start_date DATE NOT NULL,
                                  end_date DATE NOT NULL,
                                  created_at TIMESTAMP DEFAULT now(),

                                  CHECK (end_date >= start_date)
);




-- 2. Table des Incidents (Gestion des signalements)
CREATE TABLE incidents (
                           id SERIAL PRIMARY KEY,
                           type_de_problem VARCHAR(100) NOT NULL,
                           description TEXT NOT NULL,
                           status VARCHAR(20) DEFAULT 'En cours'
                               CHECK (status IN ('En cours', 'Resolu')),
    -- JSONB est excellent pour stocker les métadonnées des fichiers (nom, taille, url)
                           documents JSONB DEFAULT '[]'::jsonb,
                           created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                           updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add user_id to the incidents table
ALTER TABLE incidents ADD COLUMN user_id INTEGER NOT NULL REFERENCES users(id); -- Adjust 'users' to your actual table name

-- Optional: Add an index for performance on user_id queries
CREATE INDEX idx_incidents_user_id ON incidents(user_id);

-- 3. Table des Notifications (Alertes système)
CREATE TABLE notifications (
                               id SERIAL PRIMARY KEY  ,
                               libelle VARCHAR(255) NOT NULL,
                               type VARCHAR(100) NOT NULL,
                               description TEXT NOT NULL,
                               image_url VARCHAR(500),
                               emetteur_id INT NOT NULL,  -- ID de l'utilisateur qui publie
                               date_creation TIMESTAMP WITH TIME ZONE DEFAULT   CURRENT_TIMESTAMP,
                               statut VARCHAR(20)
                                   CHECK (statut IN('active', 'inactive') )DEFAULT 'active',
                               FOREIGN KEY (emetteur_id) REFERENCES users(id)
);

CREATE TABLE notification_destinataires (
                                            id SERIAL PRIMARY KEY  ,
                                            notification_id INT NOT NULL,
                                            destinataire_id INT,
                                            lu BOOLEAN DEFAULT FALSE,
                                            date_lecture TIMESTAMP WITH TIME ZONE DEFAULT   CURRENT_TIMESTAMP,
                                            FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
                                            FOREIGN KEY (destinataire_id) REFERENCES users(id)
);
-- 4. Fonction pour mettre à jour automatiquement le champ updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
    RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 5. Triggers pour l'automatisation
CREATE TRIGGER update_incident_modtime BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
