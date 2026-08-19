-- v0.9.1.1: feature-switched replacement for the floating utility dock.
insert into public.game_section_settings(id,label,short_label,icon,description,enabled,sort_order)
values ('utility-menu','More','More','•••','Moves utility links into the main navigation.',false,90)
on conflict(id) do nothing;
