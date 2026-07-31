import { describe, it, expect } from 'vitest';
import { extractTemplateVariables, findTemplateVariableIssues } from './template-variables';

describe('extractTemplateVariables', () => {
  it('returns plain interpolations', () => {
    expect(extractTemplateVariables('Hi {{rentalTenantName}}, see {{propertyAddress}}')).toEqual([
      'rentalTenantName',
      'propertyAddress',
    ]);
  });

  it('deduplicates repeated references', () => {
    expect(extractTemplateVariables('{{a}} {{a}} {{b}}')).toEqual(['a', 'b']);
  });

  it('ignores {{else}} — the bug that made every appointment email unsaveable', () => {
    const serviceLabel = '{{#if serviceTypeName}}{{serviceTypeName}}{{else}}inspection{{/if}}';
    expect(extractTemplateVariables(serviceLabel)).toEqual(['serviceTypeName']);
  });

  it('reads the condition of a block open as a used variable', () => {
    expect(extractTemplateVariables('{{#if agencyPhone}}call us{{/if}}')).toEqual(['agencyPhone']);
  });

  it('ignores block closes', () => {
    expect(extractTemplateVariables('{{/if}} {{/each}} {{/with}}')).toEqual([]);
  });

  it('reads the subject of an each block', () => {
    expect(extractTemplateVariables('{{#each appointments}}{{propertyAddress}}{{/each}}')).toEqual([
      'appointments',
      'propertyAddress',
    ]);
  });

  it('handles the {{else if x}} chain', () => {
    expect(extractTemplateVariables('{{#if a}}1{{else if b}}2{{/if}}')).toEqual(['a', 'b']);
  });

  it('ignores the bare inverse marker and inverse blocks', () => {
    expect(extractTemplateVariables('{{#if a}}1{{^}}2{{/if}}')).toEqual(['a']);
    expect(extractTemplateVariables('{{^unlessThis}}2{{/unlessThis}}')).toEqual(['unlessThis']);
  });

  it('ignores comments', () => {
    expect(extractTemplateVariables('{{! internal note }} {{y}}')).toEqual(['y']);
  });

  it('ignores everything inside a block comment, including nested expressions', () => {
    // Without this, `{{!-- … {{draft}} … --}}` reported `draft` as used and the
    // editor refused the save — the very failure mode this module exists to end.
    expect(extractTemplateVariables('{{!-- was {{draft}} --}} {{y}}')).toEqual(['y']);
    expect(extractTemplateVariables('{{!--\n multi {{a}}\n line {{b}}\n--}}{{c}}')).toEqual(['c']);
  });

  it('ignores block-parameter declarations', () => {
    // `as |item|` is a local alias, and `as` is a keyword — reporting it gave
    // "Invalid variables: as", the same class of false rejection as {{else}}.
    expect(extractTemplateVariables('{{#each appointments as |appt|}}x{{/each}}')).toEqual([
      'appointments',
    ]);
    expect(extractTemplateVariables('{{#with property as |p|}}x{{/with}}')).toEqual(['property']);
    expect(extractTemplateVariables('{{#each rows as |row index|}}x{{/each}}')).toEqual(['rows']);
  });

  it('does not report references to a block alias', () => {
    // The alias is a loop-local name, never a payload variable. Reporting it
    // made the editor answer "Invalid variables: appointment" for a body the
    // renderer handles — a false rejection, which is the failure this module
    // exists to prevent.
    expect(
      extractTemplateVariables('{{#each appointments as |appointment|}}{{appointment}}{{/each}}'),
    ).toEqual(['appointments']);
    expect(
      extractTemplateVariables('{{#each rows as |row index|}}{{row}}-{{index}}{{/each}}'),
    ).toEqual(['rows']);
    expect(
      extractTemplateVariables('{{#with property as |p|}}{{p}} {{agencyName}}{{/with}}'),
    ).toEqual(['property', 'agencyName']);
  });

  it('reads through whitespace-control markers', () => {
    // `{{~x~}}` is `x` with whitespace trimming. Dropping it let a variable
    // outside the allow-list through unreported.
    expect(extractTemplateVariables('{{~propertyAddress~}}')).toEqual(['propertyAddress']);
    expect(extractTemplateVariables('{{~#if a~}}x{{~/if~}}')).toEqual(['a']);
    expect(extractTemplateVariables('{{#if a}}x{{~else~}}y{{/if}}')).toEqual(['a']);
  });

  it('ignores helper names and literal params, keeping the referenced variable', () => {
    expect(extractTemplateVariables('{{formatDate scheduledDate "DD/MM/YYYY"}}')).toEqual([
      'scheduledDate',
    ]);
    expect(extractTemplateVariables('{{#if this}}{{this}}{{/if}}')).toEqual([]);
    expect(extractTemplateVariables('{{#unless true}}x{{/unless}}')).toEqual([]);
    expect(extractTemplateVariables('{{#each 3}}x{{/each}}')).toEqual([]);
  });

  it('ignores triple-stache and dotted or indexed paths it cannot vouch for', () => {
    // `{{{raw}}}` is unescaped output; the inner braces still yield the name.
    expect(extractTemplateVariables('{{{rawHtml}}}')).toEqual(['rawHtml']);
    expect(extractTemplateVariables('{{a.b}} {{c}}')).toEqual(['c']);
  });

  it('tolerates empty and malformed input', () => {
    expect(extractTemplateVariables('')).toEqual([]);
    expect(extractTemplateVariables('{{ }}')).toEqual([]);
    expect(extractTemplateVariables('{{unclosed')).toEqual([]);
  });
});

describe('findTemplateVariableIssues', () => {
  const opts = { required: ['rentalTenantName'], allowed: ['rentalTenantName', 'propertyAddress'] };

  it('reports nothing for a body that uses only allowed variables', () => {
    expect(findTemplateVariableIssues('Hi {{rentalTenantName}} at {{propertyAddress}}', opts)).toEqual({
      invalid: [],
      missing: [],
    });
  });

  it('reports variables outside the allow-list', () => {
    expect(findTemplateVariableIssues('Hi {{rentalTenantName}} {{secretField}}', opts)).toEqual({
      invalid: ['secretField'],
      missing: [],
    });
  });

  it('reports required variables the body never prints', () => {
    expect(findTemplateVariableIssues('Inspection at {{propertyAddress}}', opts)).toEqual({
      invalid: [],
      missing: ['rentalTenantName'],
    });
  });

  it('does not report {{else}} as an invalid variable', () => {
    const body = '{{#if propertyAddress}}{{propertyAddress}}{{else}}your property{{/if}} {{rentalTenantName}}';
    expect(findTemplateVariableIssues(body, opts)).toEqual({ invalid: [], missing: [] });
  });

  it('counts a variable used only as a block condition as used', () => {
    expect(
      findTemplateVariableIssues('{{#if rentalTenantName}}hello{{/if}} {{propertyAddress}}', opts),
    ).toEqual({ invalid: [], missing: [] });
  });
});
