/** Result of a save-profile validation. */
export interface SanitizeResult {
  /** True if the input is safe and identical after applying the save allowlist. */
  safe: boolean;
  /** Human-readable description of the first rejected construct. Present when safe=false. */
  rejectedReason?: string;
}

/**
 * Port for HTML sanitization with two stage-specific profiles.
 *
 * save profile  — validates that the body contains only allowlist-conformant HTML;
 *                 literal img tags and unsafe constructs (script, on-handlers, javascript: URLs) cause
 *                 rejection. Does NOT mutate the body.
 * render profile — permits trusted-host img tags (injected by the resolver), strips
 *                  non-host images and unsafe constructs. Mutates (sanitizes) the output.
 */
export interface IHtmlSanitizerService {
  /**
   * Validates the body against the save profile.
   * Returns { safe: true } if the body is fully allowlist-conformant; otherwise
   * { safe: false, rejectedReason } describing the first violation.
   */
  validateForSave(html: string): SanitizeResult;

  /**
   * Sanitizes the body using the render profile.
   * Permits asset-host <img> tags, strips all unsafe constructs.
   * Returns the sanitized HTML string.
   */
  sanitizeForRender(html: string, assetHostOrigin?: string): string;
}
