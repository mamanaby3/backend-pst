-- ========================================
-- SCHÉMA COMPLET POUR ABONNEMENTS + PAIEMENTS
-- ========================================

-- 1. Table des plans d'abonnement (optionnel mais recommandé)
CREATE TABLE IF NOT EXISTS subscription_plans (
                                                  id SERIAL PRIMARY KEY,
                                                  name VARCHAR(100) NOT NULL,
                                                  description TEXT,
                                                  price NUMERIC(10,2) NOT NULL,
                                                  duration_days INTEGER NOT NULL DEFAULT 30,
                                                  features JSONB DEFAULT '[]'::jsonb,
                                                  role VARCHAR(20) CHECK (role IN ('driver', 'parent')),
                                                  active BOOLEAN DEFAULT true,
                                                  created_at TIMESTAMP DEFAULT now()
);

-- Plans par défaut
INSERT INTO subscription_plans (name, description, price, duration_days, role, features) VALUES
                                                                                             ('Chauffeur Mensuel', 'Abonnement mensuel pour chauffeur', 15000, 30, 'driver',
                                                                                              '[{"name": "Trajets illimités"}, {"name": "Support prioritaire"}, {"name": "Statistiques avancées"}]'::jsonb),
                                                                                             ('Chauffeur Trimestriel', 'Abonnement trimestriel pour chauffeur (-10%)', 40500, 90, 'driver',
                                                                                              '[{"name": "Trajets illimités"}, {"name": "Support prioritaire"}, {"name": "Statistiques avancées"}, {"name": "Économie de 10%"}]'::jsonb),
                                                                                             ('Parent Mensuel', 'Abonnement mensuel pour parent', 25000, 30, 'parent',
                                                                                              '[{"name": "Réservations illimitées"}, {"name": "Notifications en temps réel"}, {"name": "Support client"}]'::jsonb);

-- 2. Améliorer la table subscriptions existante
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES subscription_plans(id),
    ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES payments(id);

-- 3. Améliorer la table payments pour gérer carte bancaire et mobile money
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) CHECK (payment_type IN ('subscription', 'one_time')),
    ADD COLUMN IF NOT EXISTS subscription_id INTEGER REFERENCES subscriptions(id),
    ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50);

-- Commentaires sur les colonnes existantes
COMMENT ON COLUMN payments.method IS 'card, mobile_money, or bank_transfer';
COMMENT ON COLUMN payments.card_holder_name IS 'Nom complet du titulaire de la carte';
COMMENT ON COLUMN payments.card_last4 IS 'Derniers 4 chiffres de la carte';
COMMENT ON COLUMN payments.card_exp_month IS 'Mois d\'expiration (1-12)';
COMMENT ON COLUMN payments.card_exp_year IS 'Année d\'expiration (ex: 2025)';
COMMENT ON COLUMN payments.mobile_number IS 'Numéro de téléphone pour mobile money';
COMMENT ON COLUMN payments.payment_token IS 'Token sécurisé généré par le processeur de paiement';

-- 4. Table pour stocker les méthodes de paiement sauvegardées (optionnel)
CREATE TABLE IF NOT EXISTS saved_payment_methods (
                                                     id SERIAL PRIMARY KEY,
                                                     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Type de méthode
                                                     method_type VARCHAR(20) NOT NULL CHECK (method_type IN ('card', 'mobile_money')),

    -- Pour carte bancaire
                                                     card_holder_name VARCHAR(150),
                                                     card_last4 VARCHAR(4),
                                                     card_brand VARCHAR(20), -- Visa, Mastercard, etc.
                                                     card_exp_month INTEGER CHECK (card_exp_month BETWEEN 1 AND 12),
                                                     card_exp_year INTEGER CHECK (card_exp_year >= 2024),
                                                     card_token VARCHAR(255), -- Token du processeur de paiement

    -- Pour mobile money
                                                     mobile_number VARCHAR(30),
                                                     mobile_provider VARCHAR(50), -- Wave, Orange Money, Free Money, YUP, Wizall

    -- Métadonnées
                                                     is_default BOOLEAN DEFAULT false,
                                                     is_verified BOOLEAN DEFAULT false,
                                                     nickname VARCHAR(100), -- Ex: "Ma carte principale", "Mon compte Wave"

                                                     created_at TIMESTAMP DEFAULT now(),
                                                     updated_at TIMESTAMP DEFAULT now(),
                                                     last_used_at TIMESTAMP,

    -- Contraintes
                                                     CONSTRAINT check_card_fields CHECK (
                                                         method_type != 'card' OR (
                                                             card_holder_name IS NOT NULL AND
                                                             card_last4 IS NOT NULL AND
                                                             card_exp_month IS NOT NULL AND
                                                             card_exp_year IS NOT NULL
                                                             )
                                                         ),
                                                     CONSTRAINT check_mobile_fields CHECK (
                                                         method_type != 'mobile_money' OR (
                                                             mobile_number IS NOT NULL AND
                                                             mobile_provider IS NOT NULL
                                                             )
                                                         )
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_user ON saved_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_default ON saved_payment_methods(user_id, is_default) WHERE is_default = true;

-- 5. Fonction pour gérer une seule méthode par défaut
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
    RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        -- Désactiver toutes les autres méthodes par défaut de l'utilisateur
        UPDATE saved_payment_methods
        SET is_default = false
        WHERE user_id = NEW.user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_single_default_payment ON saved_payment_methods;
CREATE TRIGGER trigger_single_default_payment
    BEFORE INSERT OR UPDATE ON saved_payment_methods
    FOR EACH ROW
    WHEN (NEW.is_default = true)
EXECUTE FUNCTION ensure_single_default_payment_method();

-- 6. Vue pour les abonnements actifs avec détails de paiement
CREATE OR REPLACE VIEW v_active_subscriptions AS
SELECT
    s.id as subscription_id,
    s.user_id,
    u.name as user_name,
    u.email,
    u.role,
    s.type,
    s.price,
    s.start_date,
    s.end_date,
    s.active,
    s.auto_renew,
    (s.end_date - CURRENT_DATE) as days_remaining,
    CASE
        WHEN s.end_date < CURRENT_DATE THEN 'expired'
        WHEN s.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'
        ELSE 'active'
        END as status,
    p.id as last_payment_id,
    p.amount as last_payment_amount,
    p.method as last_payment_method,
    p.status as last_payment_status,
    p.created_at as last_payment_date
FROM subscriptions s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN payments p ON s.payment_id = p.id
WHERE s.active = true;

-- 7. Fonction pour vérifier l'expiration des abonnements (à exécuter périodiquement)
CREATE OR REPLACE FUNCTION expire_old_subscriptions()
    RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE subscriptions
    SET active = false
    WHERE active = true
      AND end_date < CURRENT_DATE;

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ language 'plpgsql';

-- 8. Exemple de données de test
/*
-- Insérer une méthode de paiement carte
INSERT INTO saved_payment_methods (
    user_id, method_type, card_holder_name, card_last4,
    card_brand, card_exp_month, card_exp_year, card_token,
    is_default, nickname
) VALUES (
    1, 'card', 'Mamadou Diop', '1234',
    'Visa', 12, 2025, 'tok_1234567890',
    true, 'Ma carte Visa'
);

-- Insérer une méthode mobile money
INSERT INTO saved_payment_methods (
    user_id, method_type, mobile_number, mobile_provider,
    is_default, nickname
) VALUES (
    1, 'mobile_money', '+221771234567', 'Wave',
    false, 'Mon compte Wave'
);
*/