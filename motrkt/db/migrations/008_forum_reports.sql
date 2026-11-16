-- Forum: posts can be edited by their author (edited_at) and reported by others (forum_reports, one report per user
-- and post); reviewers (MIP_ADMINS) see reported posts in the review area and hide them if need be.
alter table forum_posts add column edited_at timestamptz;

create table forum_reports (
  post_id text not null references forum_posts (id),
  user_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
