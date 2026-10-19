-- 116 — Allow a media_library row that holds only a public URL.
--
-- media_id is the id Meta returns after a file is uploaded to the WhatsApp Cloud
-- API, and it was NOT NULL. That assumes every library item was uploaded to Meta
-- first, which is wrong for media we reference from somewhere else — product
-- photos pulled from the client's own storefront, for instance. Those have a
-- public URL and get uploaded to Meta on demand at send time (the payment-QR path
-- already works exactly this way: it reads `public_url ?? media_id` and calls
-- uploadMediaToWhatsApp before sending).
--
-- A row must still carry one of the two, which the check enforces.
ALTER TABLE public.media_library ALTER COLUMN media_id DROP NOT NULL;

ALTER TABLE public.media_library
  DROP CONSTRAINT IF EXISTS media_library_has_source;
ALTER TABLE public.media_library
  ADD CONSTRAINT media_library_has_source
  CHECK (media_id IS NOT NULL OR public_url IS NOT NULL);

COMMENT ON COLUMN public.media_library.media_id IS
  'WhatsApp Cloud API media id. Null for items referenced by public_url and uploaded to Meta on demand.';
