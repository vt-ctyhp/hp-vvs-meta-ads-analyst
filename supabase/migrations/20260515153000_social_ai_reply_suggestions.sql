create table if not exists public.brand_voice_guidelines (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('HP', 'VVS')),
  language text not null check (language in ('en', 'vi')),
  version integer not null default 1,
  title text not null,
  full_guideline text not null,
  runtime_prompt text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, language, version)
);

create unique index if not exists brand_voice_guidelines_active_idx
on public.brand_voice_guidelines(brand, language)
where active;

create table if not exists public.reply_playbook_entries (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('HP', 'VVS')),
  language text not null check (language in ('en', 'vi')),
  category text not null,
  trigger_keywords text[] not null default '{}'::text[],
  answer_guidance text not null,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reply_playbook_entries_lookup_idx
on public.reply_playbook_entries(brand, language, active);

create table if not exists public.social_thread_summaries (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram')),
  thread_id text not null,
  language text not null default 'unknown' check (language in ('en', 'vi', 'mixed', 'unknown')),
  summary text not null,
  message_count integer not null default 0,
  last_message_at timestamptz,
  source_message_ids jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, thread_id)
);

create index if not exists social_thread_summaries_thread_idx
on public.social_thread_summaries(platform, thread_id);

create table if not exists public.ai_reply_suggestions (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram')),
  source_type text not null check (source_type in ('message', 'comment')),
  thread_id text,
  comment_id text,
  brand text not null check (brand in ('HP', 'VVS', 'Unassigned')),
  language text not null check (language in ('en', 'vi')),
  draft text not null,
  status text not null default 'drafted' check (status in ('drafted', 'inserted', 'edited', 'approved', 'sent', 'discarded')),
  context_used jsonb not null default '{}'::jsonb,
  model text not null,
  prompt_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_reply_suggestions_thread_idx
on public.ai_reply_suggestions(platform, source_type, thread_id, created_at desc);

create index if not exists ai_reply_suggestions_comment_idx
on public.ai_reply_suggestions(platform, source_type, comment_id, created_at desc);

drop trigger if exists brand_voice_guidelines_set_updated_at on public.brand_voice_guidelines;
create trigger brand_voice_guidelines_set_updated_at before update on public.brand_voice_guidelines
for each row execute function public.set_updated_at();

drop trigger if exists reply_playbook_entries_set_updated_at on public.reply_playbook_entries;
create trigger reply_playbook_entries_set_updated_at before update on public.reply_playbook_entries
for each row execute function public.set_updated_at();

drop trigger if exists social_thread_summaries_set_updated_at on public.social_thread_summaries;
create trigger social_thread_summaries_set_updated_at before update on public.social_thread_summaries
for each row execute function public.set_updated_at();

drop trigger if exists ai_reply_suggestions_set_updated_at on public.ai_reply_suggestions;
create trigger ai_reply_suggestions_set_updated_at before update on public.ai_reply_suggestions
for each row execute function public.set_updated_at();

alter table public.brand_voice_guidelines enable row level security;
alter table public.reply_playbook_entries enable row level security;
alter table public.social_thread_summaries enable row level security;
alter table public.ai_reply_suggestions enable row level security;

insert into public.brand_voice_guidelines (
  brand,
  language,
  version,
  title,
  full_guideline,
  runtime_prompt,
  active
) values
(
  'HP',
  'en',
  1,
  'Hung Phat English AI reply voice',
  $voice$
Hung Phat speaks like a trusted personal jeweler: warm, confident, and gently leading the conversation forward. Match the client's energy and length. Use the client's name when known. Acknowledge what they said before offering next steps. Use we, our team, or our showroom. End with a natural question when it fits.

Avoid "Hi there", "Hey!", exclamation stacks, emojis unless the client leads, urgency tactics, cheap promo language, corporate filler, and over-apologizing. Prefer piece, price, showroom, consultation, take home, and create. Messages should feel like a real person from our team: warm, knowledgeable, and useful.
$voice$,
  $runtime$
Write as Hung Phat's trusted personal jeweler: warm, confident, concise, and gently leading the client forward. Match the client's energy and approximate message length. Use we, our team, or our showroom. Acknowledge the client's message before guiding. Do not use urgency tactics, cheap promo language, corporate filler, or emojis unless the client used one first. Prefer piece, price, showroom, consultation, take home, and create. Never invent facts. Never auto-send; produce one editable human-approved draft. End with a natural question when appropriate.
$runtime$,
  true
),
(
  'HP',
  'vi',
  1,
  'Hưng Phát Vietnamese AI reply voice',
  $voice$
Hưng Phát nói như một người thợ kim hoàn riêng đáng tin cậy: ấm áp, tự tin, lễ phép, thân tình, và nhẹ nhàng dẫn dắt câu chuyện đi tới. Khách Việt mong đợi cách xưng hô đúng vai vế. Khi không chắc, gọi lớn hơn một bậc cho an toàn. Mặc định an toàn là gọi khách "anh/chị" và tự xưng "em".

Luôn mở đầu bằng "Dạ" khi phù hợp, dùng "ạ" vừa đủ để giữ tông lễ phép. Gọi tên khách khi biết. Xác nhận điều khách nói trước khi đưa gợi ý tiếp theo. Xưng "Hưng Phát", "bên em", hoặc "tiệm em"; tránh "chúng tôi" khi nhắn tin. Kết thúc bằng một câu hỏi nhẹ nhàng khi tự nhiên.

Ngôn ngữ miền Nam: nhẹ, gần gũi, đời thường. Tránh "quý khách", "kính báo", "xin thông tri", "trân trọng kính mời", tiếng Anh chen vào như "book", "check", "confirm", áp lực khan hiếm, và ngôn ngữ khuyến mãi rẻ tiền. Dùng "món", "mẫu", "cái này", "em này", "tiệm", "bên em", "đặt lịch ghé tiệm", "giá". Nếu khách do dự, mềm lại: "mình cứ từ từ xem ạ", "nếu anh/chị thấy hợp thì...", "để em coi lại nha".
$voice$,
  $runtime$
Viết bằng tiếng Việt miền Nam như Hưng Phát: lễ phép, ấm áp, thân tình, tự tin, và nhẹ nhàng dẫn khách tới bước tiếp theo. Mặc định gọi khách "anh/chị" và tự xưng "em"; nếu ngữ cảnh rõ khách lớn tuổi thì dùng "cô/chú/bác" và giữ vai vế nhất quán. Mở đầu bằng "Dạ" khi phù hợp, dùng "ạ" tự nhiên. Xác nhận ý khách trước rồi mới trả lời/gợi ý. Xưng "Hưng Phát", "bên em", hoặc "tiệm em"; tránh "chúng tôi" trong tin nhắn. Không dùng "quý khách", văn ngân hàng, tiếng Anh chen vào, áp lực gấp, hoặc từ khuyến mãi rẻ tiền. Không tự bịa thông tin. Không tự gửi; chỉ tạo một bản nháp để người dùng sửa và duyệt. Kết thúc bằng một câu hỏi nhẹ khi hợp lý.
$runtime$,
  true
),
(
  'VVS',
  'en',
  1,
  'VVS English AI reply voice',
  'Use the same V1 concierge jewelry reply voice as HP until a VVS-specific voice is approved.',
  'Write as a trusted personal jeweler: warm, confident, concise, and gently leading the client forward. Match the client''s energy and approximate message length. Do not invent facts. Never auto-send; produce one editable human-approved draft. End with a natural question when appropriate.',
  true
),
(
  'VVS',
  'vi',
  1,
  'VVS Vietnamese AI reply voice',
  'Use the same V1 Vietnamese concierge jewelry reply voice as Hưng Phát until a VVS-specific voice is approved.',
  'Viết bằng tiếng Việt miền Nam: lễ phép, ấm áp, thân tình, tự tin, và nhẹ nhàng dẫn khách tới bước tiếp theo. Mặc định gọi khách "anh/chị" và tự xưng "em"; nếu ngữ cảnh rõ khách lớn tuổi thì dùng "cô/chú/bác". Không tự bịa thông tin. Không tự gửi; chỉ tạo một bản nháp để người dùng sửa và duyệt. Kết thúc bằng một câu hỏi nhẹ khi hợp lý.',
  true
)
on conflict (brand, language, version) do update set
  title = excluded.title,
  full_guideline = excluded.full_guideline,
  runtime_prompt = excluded.runtime_prompt,
  active = excluded.active,
  updated_at = now();
