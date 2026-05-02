-- Gmail OAuth tokens for the email bot account (aplataformas/microvoz)
alter table lat_bot_config
  add column if not exists gmail_refresh_token text,
  add column if not exists gmail_access_token  text,
  add column if not exists gmail_token_expiry  timestamptz,
  add column if not exists gmail_email         text;
