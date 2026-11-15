-- Forum per variant (server/forum.ts): owners and fans discuss a model at the bottom of its page (/markt/:variant).
-- A topic is opened with its first post; replies follow in order. Nothing is deleted: a post removed by its author or
-- hidden by a reviewer (MIP_ADMINS) keeps its row with hidden_at/hidden_by and is no longer shown.
-- username is stored with each post, so the demo account (which has no users row) can post too.

create table forum_topics (
  id text primary key,
  variant_id text not null,
  user_id text not null,
  username text not null,
  title text not null,
  created_at timestamptz not null default now(),
  last_post_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by text
);
create index forum_topics_variant on forum_topics (variant_id, last_post_at desc);

create table forum_posts (
  id text primary key,
  topic_id text not null references forum_topics (id),
  user_id text not null,
  username text not null,
  body text not null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by text
);
create index forum_posts_topic on forum_posts (topic_id, created_at);
create index forum_posts_user on forum_posts (user_id, created_at desc);
