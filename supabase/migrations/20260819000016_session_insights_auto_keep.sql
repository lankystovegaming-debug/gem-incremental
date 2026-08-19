-- v0.9.1.2: independently switchable session reporting and Auto Keep.
insert into public.game_section_settings(id,label,short_label,icon,description,enabled,sort_order)
values
 ('session-insights','Session Insights','Sessions','▤','Detailed statistics and highlights for the current browser session.',false,91),
 ('auto-keep','Auto Keep','Auto Keep','◆','Protects exceptional rolls before Auto Sell.',false,92)
on conflict(id) do nothing;
