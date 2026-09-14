-- Create projects table
create table projects (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  area text,
  type text,
  priority text,
  status text default 'Pendiente',
  deadline date,
  created_at timestamptz default now()
);

-- Create tasks table
create table tasks (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  assignee text,
  status text default 'Pendiente',
  notes text,
  link text,
  created_at timestamptz default now()
);
