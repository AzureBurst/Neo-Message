-- =====================================================================
--  NEO MESSAGE — admin deletion
--  Run this once in the Supabase SQL Editor, after schema.sql.
--
--  Lets an admin remove a whole thread: the messages in it, who was in
--  it, and the thread itself. Nobody else can, and the check runs on
--  the server so it cannot be talked around from a browser console.
--
--  This is permanent. Export the log first if the thread matters —
--  the admin console's Download transcript button exists for exactly
--  this reason.
-- =====================================================================

create or replace function public.admin_delete_conversation(conv uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  removed int;
  title   text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete a thread';
  end if;

  select c.title into title
  from public.conversations c where c.id = conv;

  if not found then
    raise exception 'No such thread';
  end if;

  select count(*) into removed
  from public.messages m where m.conversation_id = conv;

  delete from public.messages           where conversation_id = conv;
  delete from public.conversation_members where conversation_id = conv;
  delete from public.conversations      where id = conv;

  return jsonb_build_object('title', title, 'messages', removed);
end;
$$;


-- ---------------------------------------------------------------------
--  Clearing a thread without removing it: handy when a scene ends but
--  the same group keeps talking.
-- ---------------------------------------------------------------------

create or replace function public.admin_clear_conversation(conv uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  removed int;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can clear a thread';
  end if;

  select count(*) into removed
  from public.messages m where m.conversation_id = conv;

  delete from public.messages where conversation_id = conv;

  return jsonb_build_object('messages', removed);
end;
$$;


-- ---------------------------------------------------------------------
--  So a deletion disappears from everyone's screen without a reload,
--  the messages table needs to publish deletes with enough of the old
--  row to identify it.
-- ---------------------------------------------------------------------

alter table public.messages replica identity full;
alter table public.conversations replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
end $$;
