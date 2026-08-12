-- PostgreSQL requires a newly added enum value to be committed before policies use it.
alter type public.sitepulse_project_role add value if not exists 'commercial';
