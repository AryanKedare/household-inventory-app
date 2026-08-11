update public.expenses
set notes = legacy_notes
where legacy_notes is not null and notes is null;

alter table public.expenses drop column legacy_notes;
