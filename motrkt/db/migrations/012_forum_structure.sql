-- Forum per variant, structured (server/forum.ts, src/components/market/Forum.tsx): every topic sits in a category
-- and is a question or a discussion; the author of a question (or a reviewer) marks the reply that answered it.
-- Topics from before this migration become discussions in "allgemein"; their author or a reviewer can move them.

alter table forum_topics add column category text not null default 'allgemein';
alter table forum_topics add column kind text not null default 'diskussion';   -- 'frage' | 'diskussion'
alter table forum_topics add column solved_post_id text references forum_posts (id);
alter table forum_topics add column solved_at timestamptz;

create index forum_topics_variant_category on forum_topics (variant_id, category, last_post_at desc);
