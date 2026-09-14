import { Tables } from './supabase'

export type Project = Tables<'projects'>
export type Task = Tables<'tasks'>
export type TaskAssignee = Tables<'task_assignees'>
export type Member = Tables<'members'>
