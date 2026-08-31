-- One-time Supabase Cron registration for automatic winner publishing.
-- Run after automatic-winner-publishing.sql and after enabling the Cron
-- integration in Supabase Dashboard -> Integrations -> Cron.

do $schedule$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'albumasu-finalize-due-polls';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'albumasu-finalize-due-polls',
    '* * * * *',
    'select public.finalize_due_polls();'
  );
end;
$schedule$;

select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'albumasu-finalize-due-polls';
