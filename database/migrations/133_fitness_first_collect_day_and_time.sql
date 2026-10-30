-- 133 — Fitness First's booking flow stops accepting answers that are not answers.
--
-- The flow asks "Which day would you like to visit?" and saves whatever comes
-- back. A live session holds this:
--
--   {"name_text": "Pooja", "day_text": "Okay i will visit", ...}
--
-- "Okay i will visit" is not a day. It was saved, the flow moved on, and the
-- confirmation went out reading "confirmed for Okay i will visit at …". Nobody
-- found out until the session was read by hand. The same risk sits on the time
-- question one step later.
--
-- Both become Collect steps, which check the answer before keeping it, re-ask
-- in this flow's own voice, and after two tries hand the conversation to a
-- person rather than asking a third time.
--
-- The exact shape below was put through the editor's validator and run in the
-- simulator before this was written — see lib/fitness-first-upgrade.test.ts,
-- which asserts that "Okay i will visit" is refused and not saved, that "kal",
-- "5 Nov", "6 baje" and "evening" are all accepted, and that three poor answers
-- end with a person instead of a loop.
--
-- Two additions the flow needed either way:
--   * a handoff step for the Collect steps to give up to;
--   * an ending for the "not interested" branch, which stopped dead.
--
-- Node ids are preserved. Rebuilding them would strand the two sessions
-- currently parked inside this flow.

UPDATE public.chatbot_flows
SET nodes = (
  SELECT jsonb_agg(
           CASE n->>'id'
             WHEN 'message-1793174900605' THEN
               jsonb_set(n, '{type}', '"collect"')
                 || jsonb_build_object('data', (n->'data') || jsonb_build_object(
                      'label', 'Ask day',
                      'expects', 'date',
                      'saveAsVariable', 'day',
                      'maxAttempts', 2,
                      'timeoutHours', 48,
                      'retryMessage', 'Sorry, main samajh nahi paaya 😊 Kis din aana chahenge? Jaise: kal, Monday, ya 5 November.'
                    ))
             WHEN 'message-1793174747893' THEN
               jsonb_set(n, '{type}', '"collect"')
                 || jsonb_build_object('data', (n->'data') || jsonb_build_object(
                      'label', 'Ask time',
                      'expects', 'time',
                      'saveAsVariable', 'time',
                      'maxAttempts', 2,
                      'timeoutHours', 48,
                      'retryMessage', 'Sorry, time samajh nahi aaya 😊 Jaise: 10am, 6 baje, ya evening.'
                    ))
             ELSE n
           END
           ORDER BY ord
         )
  FROM jsonb_array_elements(nodes) WITH ORDINALITY AS t(n, ord)
)
WHERE id = '106b7e3e-57a5-4e55-af74-32f74bd4f8a6';

-- The step both Collects give up to.
UPDATE public.chatbot_flows
SET nodes = nodes || jsonb_build_array(
      jsonb_build_object(
        'id', 'handoff-collect-1',
        'type', 'assign_agent',
        'position', jsonb_build_object('x', 650, 'y', 650),
        'data', jsonb_build_object(
          'label', 'Hand to the team',
          'message', 'Koi baat nahi 😊 Humari team aapko call karke visit ka time set kar degi. Dhanyavaad!'
        )
      )
    )
WHERE id = '106b7e3e-57a5-4e55-af74-32f74bd4f8a6'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(nodes) n WHERE n->>'id' = 'handoff-collect-1'
  );

-- The give-up branches, and an ending for the branch that stopped dead.
UPDATE public.chatbot_flows
SET edges = edges || jsonb_build_array(
      jsonb_build_object('id', 'e-day-gaveup',  'source', 'message-1793174900605', 'target', 'handoff-collect-1', 'sourceHandle', 'gave_up'),
      jsonb_build_object('id', 'e-time-gaveup', 'source', 'message-1793174747893', 'target', 'handoff-collect-1', 'sourceHandle', 'gave_up'),
      jsonb_build_object('id', 'e-notnow-end',  'source', 'message-1793174550077', 'target', 'end-tpl-1')
    ),
    updated_at = now()
WHERE id = '106b7e3e-57a5-4e55-af74-32f74bd4f8a6'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(edges) e WHERE e->>'id' = 'e-day-gaveup'
  );

-- The two sessions parked inside this flow are sitting on nodes whose type just
-- changed, and one of them already holds a day that is not a day. Clearing them
-- means those two customers start cleanly on their next message rather than
-- resuming into a step that now behaves differently.
DELETE FROM public.flow_sessions
WHERE flow_id = '106b7e3e-57a5-4e55-af74-32f74bd4f8a6'
  AND status = 'active';
