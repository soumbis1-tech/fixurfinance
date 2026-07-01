-- Add 'daily' to recurring_frequency enum
ALTER TYPE public.recurring_frequency ADD VALUE IF NOT EXISTS 'daily';