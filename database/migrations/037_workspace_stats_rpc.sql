-- Fast per-workspace stats for the admin panel.
-- Previously the admin/workspaces route downloaded ALL conversations and contacts
-- rows just to count them (O(N) rows across every workspace). This single-query
-- RPC replaces three full-table fetches with one efficient GROUP BY aggregation.
CREATE OR REPLACE FUNCTION get_workspace_stats(workspace_ids UUID[])
RETURNS TABLE (
  workspace_id    UUID,
  member_count    BIGINT,
  conversation_count BIGINT,
  contact_count   BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ws.id                                                    AS workspace_id,
    COALESCE(m.cnt, 0)                                       AS member_count,
    COALESCE(c.cnt, 0)                                       AS conversation_count,
    COALESCE(ct.cnt, 0)                                      AS contact_count
  FROM unnest(workspace_ids) AS ws(id)
  LEFT JOIN (
    SELECT workspace_id, count(*) AS cnt
    FROM workspace_members
    WHERE workspace_id = ANY(workspace_ids)
    GROUP BY workspace_id
  ) m  ON m.workspace_id  = ws.id
  LEFT JOIN (
    SELECT workspace_id, count(*) AS cnt
    FROM conversations
    WHERE workspace_id = ANY(workspace_ids)
    GROUP BY workspace_id
  ) c  ON c.workspace_id  = ws.id
  LEFT JOIN (
    SELECT workspace_id, count(*) AS cnt
    FROM contacts
    WHERE workspace_id = ANY(workspace_ids)
    GROUP BY workspace_id
  ) ct ON ct.workspace_id = ws.id;
$$;
