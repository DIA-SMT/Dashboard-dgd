-- Enable RLS on specific tables
alter table projects enable row level security;
alter table tasks enable row level security;
alter table task_assignees enable row level security;

-- PROJECTS POLICIES
create policy "Enable read access for authenticated users"
on projects for select
to authenticated
using (true);

create policy "Enable all access for admins"
on projects for all
to authenticated
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);

-- TASKS POLICIES
create policy "Enable read access for authenticated users"
on tasks for select
to authenticated
using (true);

create policy "Enable all access for admins"
on tasks for all
to authenticated
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);

-- Users can update tasks status if they are assigned ? (Optional: for now only admins)
-- If we want common users to update status of tasks they are assigned to:
/*
create policy "Enable status update for assignees"
on tasks for update
to authenticated
using (
  exists (
    select 1 from task_assignees
    where task_assignees.task_id = tasks.id
    and task_assignees.member_id = (select id from members where email = auth.email()) -- This assumes mapping
  )
)
with check (
   -- Only status change allowed? Complex logic in RLS.
   true
);
*/

-- TASK ASSIGNEES POLICIES
create policy "Enable read access for authenticated users"
on task_assignees for select
to authenticated
using (true);

create policy "Enable all access for admins"
on task_assignees for all
to authenticated
using (
  exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);
