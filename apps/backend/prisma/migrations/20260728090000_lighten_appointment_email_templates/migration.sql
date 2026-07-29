-- Remove the dark background from appointment email templates.
--
-- The appointment layout (email-layout.ts) is a seed-time generator: the HTML it
-- produces is stored verbatim in notification_templates.body_html and sent to the
-- provider as-is, with no wrapper applied at render time. Changing the generator
-- alone therefore leaves every already-stored template dark, so the stored rows
-- have to be rewritten here.
--
-- The replacements below are literal and mirror the new generator output exactly,
-- so a row holding the unmodified dark layout ends up byte-for-byte identical to
-- what the current catalogue produces. They cover every row -- platform defaults
-- (tenant_id IS NULL) and agency-owned copies alike.
--
-- Known limitation: an agency that hand-edited the HTML and changed the spacing
-- inside a style attribute will not match these literals. validateForSave rejects
-- without mutating, so stored HTML is exactly what the operator submitted; this
-- covers the common case of a faithful copy of the dark layout.
--
-- The light "Coral Clean" system templates (password reset, reports, stuck alert)
-- contain none of these strings and are left untouched.

UPDATE notification_templates
SET body_html = replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  body_html,
                  -- <body>: drop the dark canvas, recolour the inherited text
                  'background-color:rgb(47,47,47);color:#ffffff;',
                  'color:rgba(0,0,0,0.87);'
                ),
                -- both wrapper tables (outer 100% and inner 520px)
                'background-color:rgb(47,47,47);border-collapse:collapse;',
                'border-collapse:collapse;'
              ),
              -- header band: solid dark fill + coral gradient artwork
              'background-color:rgb(41,41,41);background-image:linear-gradient(115deg,rgba(233,74,111,0.45) 0%,rgba(233,74,111,0.12) 38%,rgba(41,41,41,0) 62%);',
              ''
            ),
            -- <h1> greeting
            'font-weight:700;color:#ffffff;',
            'font-weight:700;color:#21566E;'
          ),
          -- content column
          'padding:20px 30px 0 30px;color:#ffffff;',
          'padding:20px 30px 0 30px;color:rgba(0,0,0,0.87);'
        ),
        -- inline links: pink was only legible on the dark canvas
        'color:rgb(219,151,255);text-decoration:underline;',
        'color:#21566E;text-decoration:underline;'
      ),
      -- call-out box: dark amber fill -> light amber, keeping the accent bar
      'background-color:rgb(94,86,54);padding:12px;',
      'background-color:#FFF8E1;color:rgba(0,0,0,0.87);padding:12px;'
    )
WHERE body_html LIKE '%rgb(47,47,47)%'
   OR body_html LIKE '%rgb(41,41,41)%'
   OR body_html LIKE '%rgb(219,151,255)%'
   OR body_html LIKE '%rgb(94,86,54)%';
