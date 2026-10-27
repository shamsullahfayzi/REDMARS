-- Preserve existing credentials; all newly issued passwords are marked temporary by the API.
ALTER TABLE "app_user"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "credential_version" INTEGER NOT NULL DEFAULT 0;
