-- 122 — Fitness First "Welcome Message": make the nodes that ask a question wait.
--
-- The whole flow fired on the keyword: one message after another, all at once,
-- and the yes/no condition judged the keyword itself rather than any answer.
--
-- Nothing is wrong with the engine. A `message` node sends and immediately runs
-- the next node; only a `question` node stops and waits for a reply. The flow was
-- built entirely out of `message` nodes, including the four places where it asks
-- something, so there was never anything to wait on.
--
-- Four nodes change type. The rest — the offer, the polite decline, the final
-- confirmation — are statements and stay as messages.
--
--   message-tpl-1            welcome + Diwali offer, then waits for yes/no.
--                            The condition immediately after it reads this reply;
--                            until now it was reading the trigger keyword.
--   message-1793174673597    "May I know your name?"        -> saves `name`
--   message-1793174900605    "Which day would you like?"    -> saves `day`
--   message-1793174747893    "What time is convenient?"     -> saves `time`
--
-- Saving `name` also repairs the copy: two later messages interpolate {{name}},
-- which could never fill in because no node captured it.
--
-- timeoutHours 48 matches what every other question node in the platform uses:
-- a member who wanders off mid-flow is released rather than left stuck.

UPDATE public.chatbot_flows
SET nodes = (
  SELECT jsonb_agg(
           CASE n->>'id'
             WHEN 'message-tpl-1' THEN
               jsonb_set(n, '{type}', '"question"')
                 || jsonb_build_object('data', (n->'data') || '{"timeoutHours":48}'::jsonb)
             WHEN 'message-1793174673597' THEN
               jsonb_set(n, '{type}', '"question"')
                 || jsonb_build_object('data', (n->'data') || '{"timeoutHours":48,"saveAsVariable":"name"}'::jsonb)
             WHEN 'message-1793174900605' THEN
               jsonb_set(n, '{type}', '"question"')
                 || jsonb_build_object('data', (n->'data') || '{"timeoutHours":48,"saveAsVariable":"day"}'::jsonb)
             WHEN 'message-1793174747893' THEN
               jsonb_set(n, '{type}', '"question"')
                 || jsonb_build_object('data', (n->'data') || '{"timeoutHours":48,"saveAsVariable":"time"}'::jsonb)
             ELSE n
           END
           ORDER BY ord
         )
  FROM jsonb_array_elements(nodes) WITH ORDINALITY AS t(n, ord)
),
updated_at = now()
WHERE id = '106b7e3e-57a5-4e55-af74-32f74bd4f8a6';

-- Any session already parked inside the broken flow would resume against node
-- types that no longer behave the same way. There are only ever a handful, and
-- the member simply starts again on their next message.
DELETE FROM public.flow_sessions
WHERE flow_id = '106b7e3e-57a5-4e55-af74-32f74bd4f8a6';
