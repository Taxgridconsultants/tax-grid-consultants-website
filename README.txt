TGC PRACTICE MANAGER v5.12 — FULL NAME & SECURITY REVIEW

Adds:
- Full “Tax Grid Consultants” name throughout invitation and activation flow
- Revised security notice focused on forwarding, passwords and verification codes
- Existing branded activation page retained
- No database migration required

Supabase Invite User email button should point to:
{{ .SiteURL }}/auth/confirm/?token_hash={{ .TokenHash }}&type=invite

Ensure Authentication > URL Configuration > Site URL is:
https://practice.taxgridconsultants.com
