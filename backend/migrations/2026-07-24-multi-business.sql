-- Multi-business: link an owner's user-rows across tenants with a shared key.
-- Data isolation is unchanged — every table still filters by the single tenant_id
-- carried in the JWT; only which tenant the owner is "in" can now be switched.
ALTER TABLE users ADD COLUMN owner_key VARCHAR(36) NULL;
ALTER TABLE users ADD INDEX idx_owner_key (owner_key);
-- Each existing owner becomes its own single-business group.
UPDATE users SET owner_key = UUID() WHERE role = 'owner' AND owner_key IS NULL;
