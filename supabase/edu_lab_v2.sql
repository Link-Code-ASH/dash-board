-- Edu 문항 연구소 v2: 문항의 난이도, 검토 상태, 쓰임과 수정본 연결.
-- Apply after edu_lab.sql. Additive only: existing rows keep every value and
-- receive 'unreviewed' / 'hold' / ''. The legacy status column is left as is.
begin;

alter table public.edu_items add column if not exists review_state text not null default 'unreviewed';
alter table public.edu_items add column if not exists usage text not null default 'hold';
alter table public.edu_items add column if not exists revised_from text not null default '';

alter table public.edu_items drop constraint if exists edu_items_review_state_check;
alter table public.edu_items add constraint edu_items_review_state_check
  check (review_state in ('unreviewed', 'feedback', 'applied'));
alter table public.edu_items drop constraint if exists edu_items_usage_check;
alter table public.edu_items add constraint edu_items_usage_check
  check (usage in ('hold', 'use', 'revise', 'revised', 'discard'));
alter table public.edu_items drop constraint if exists edu_items_difficulty_check;
alter table public.edu_items add constraint edu_items_difficulty_check
  check (difficulty in ('', '최상', '상', '중', '하'));

notify pgrst, 'reload schema';
commit;
