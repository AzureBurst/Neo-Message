-- =====================================================================
--  NPC students count as NPCs in lists and mail
--  is_npc() leaves out NPC students on purpose (Flight treats them as
--  real students). Lists and Neomail need "is this one of the GM's
--  characters?", so they use is_gm_character() instead:
--   * MyTime, Messages and Neomail list every NPC as an NPC, not a player.
--   * Emails to an NPC student go to the GM (who answers as them), like
--     every other NPC, instead of to the NPC's own inbox.
--  Run after number-only.sql. Safe to run more than once.
-- =====================================================================

create or replace function public.is_gm_character(uid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r boolean := false;
begin
  if to_regclass('public.npcs') is null then return false; end if;
  execute 'select exists (select 1 from public.npcs where id = $1)' into r using uid;
  return r;
end;
$$;

create or replace function public.directory()
returns table (id uuid, username text, avatar_url text, category_id uuid, category text, color text,
               about text, is_npc boolean, can_add boolean, can_email boolean, in_contacts boolean)
language plpgsql stable security definer set search_path = public as $$
declare mine uuid := public.my_category(); gm boolean := public.is_admin();
begin
  return query
  select p.id, p.username, p.avatar_url, c.id, c.name, c.color,
         p.bio,
         public.is_gm_character(p.id),
         gm or (mine = any(c.add_by) and not p.number_only),
         gm or public.in_contacts(p.id) or (mine = any(c.email_by) and not p.number_only),
         public.in_contacts(p.id)
    from public.profiles p
    left join public.account_categories c on c.id = p.category_id
   where p.id <> auth.uid()
     and (gm or public.in_contacts(p.id)
          or (not public.is_hidden(p.id) and not p.number_only and mine = any(c.seen_by)))
   order by c.sort nulls last, p.username;
end;
$$;
grant execute on function public.directory() to authenticated;

create or replace function public.mail_compose(p_target uuid, p_subject text, p_body text, p_domain text default 'neo.mail')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); my_name text; t_name text; gm uuid; t1 uuid; t2 uuid;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Add a subject.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write something first.'; end if;
  if not public.can_email(p_target) then raise exception 'You can''t email them.'; end if;
  select username into my_name from public.profiles where id = me;
  select username into t_name from public.profiles where id = p_target;

  -- Any NPC (students included) or the GM: it lands with the GM.
  if public.is_gm_character(p_target) or exists (select 1 from public.profiles where id = p_target and is_admin) then
    select id into gm from public.profiles where is_admin order by created_at limit 1;
    insert into public.mail_threads (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
                                     last_at, last_snippet, last_from_recipient, target_id)
    values (coalesce(gm, p_target), me, trim(p_subject), t_name, public.mail_addr(t_name, p_domain),
            now(), left(p_body, 140), true, p_target)
    returning id into t1;
    insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
    values (t1, true, my_name, null, p_body);
    return t1;
  end if;

  -- Player to player: my copy (them as the sender), and theirs (me as the sender).
  insert into public.mail_threads (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
                                   last_at, last_snippet, last_from_recipient, target_id)
  values (p_target, me, trim(p_subject), t_name, public.mail_addr(t_name, p_domain), now(), left(p_body, 140), true, p_target)
  returning id into t1;
  insert into public.mail_threads (owner_admin_id, recipient_id, subject, sender_name, sender_addr,
                                   last_at, last_snippet, last_from_recipient, target_id, peer_thread)
  values (me, p_target, trim(p_subject), my_name, public.mail_addr(my_name, p_domain), now(), left(p_body, 140), false, me, t1)
  returning id into t2;
  update public.mail_threads set peer_thread = t2 where id = t1;
  insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
  values (t1, true, my_name, null, p_body);
  insert into public.mail_messages (thread_id, from_recipient, from_name, from_addr, body)
  values (t2, false, my_name, public.mail_addr(my_name, p_domain), p_body);
  return t1;
end;
$$;
grant execute on function public.mail_compose(uuid, text, text, text) to authenticated;
