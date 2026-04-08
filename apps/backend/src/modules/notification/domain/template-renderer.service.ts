import Handlebars from 'handlebars';

const handlebars = Handlebars.create();

// Register custom helpers
handlebars.registerHelper('formatDate', (date: unknown, format: unknown): string => {
  if (!date) return '';

  const d = date instanceof Date ? date : new Date(String(date));
  if (isNaN(d.getTime())) return String(date);

  const fmt = typeof format === 'string' ? format : 'YYYY-MM-DD';

  const pad = (n: number): string => String(n).padStart(2, '0');

  const tokens: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };

  let result = fmt;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(token, value);
  }
  return result;
});

handlebars.registerHelper('formatCurrency', (amount: unknown, currency: unknown): string => {
  if (amount === null || amount === undefined || amount === '') return '';

  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num)) return String(amount);

  const cur = typeof currency === 'string' ? currency : 'BRL';

  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: cur,
    }).format(num);
  } catch {
    // Fallback for invalid currency codes
    return `${cur} ${num.toFixed(2)}`;
  }
});

const templateCache = new Map<string, HandlebarsTemplateDelegate>();

function getCompiledTemplate(template: string): HandlebarsTemplateDelegate {
  let compiled = templateCache.get(template);
  if (!compiled) {
    compiled = handlebars.compile(template, { noEscape: false });
    templateCache.set(template, compiled);
  }
  return compiled;
}

export class TemplateRendererService {
  render(template: string, variables: Record<string, unknown>): string {
    if (!template) return '';
    const compiled = getCompiledTemplate(template);
    return compiled(variables);
  }

  extractVariables(template: string): string[] {
    if (!template) return [];
    const ast = Handlebars.parse(template);
    const variables = new Set<string>();
    this.walkAst(ast, variables);
    return [...variables];
  }

  private walkAst(node: hbs.AST.Node, variables: Set<string>): void {
    if (node.type === 'Program') {
      const program = node as hbs.AST.Program;
      for (const statement of program.body) {
        this.walkAst(statement, variables);
      }
    } else if (node.type === 'MustacheStatement') {
      const mustache = node as hbs.AST.MustacheStatement;
      this.extractPathFromExpression(mustache, variables);
    } else if (node.type === 'BlockStatement') {
      const block = node as hbs.AST.BlockStatement;
      this.extractPathFromExpression(block, variables);
      if (block.program) this.walkAst(block.program, variables);
      if (block.inverse) this.walkAst(block.inverse, variables);
    }
  }

  private extractPathFromExpression(
    node: hbs.AST.MustacheStatement | hbs.AST.BlockStatement,
    variables: Set<string>,
  ): void {
    const path = node.path;
    if (path.type === 'PathExpression') {
      const pathExpr = path as hbs.AST.PathExpression;
      // Skip built-in helpers
      if (!this.isHelper(pathExpr.original)) {
        variables.add(pathExpr.original);
      }
    }
    // Also extract variables from params (e.g., {{formatDate date "YYYY-MM-DD"}})
    if (node.params) {
      for (const param of node.params) {
        if (param.type === 'PathExpression') {
          const paramPath = param as hbs.AST.PathExpression;
          variables.add(paramPath.original);
        }
      }
    }
  }

  /**
   * Validates that all template variables have matching keys in the provided payload.
   * Returns the list of missing variable names (empty if all are present).
   */
  validateVariables(template: string, variables: Record<string, unknown>): string[] {
    const required = this.extractVariables(template);
    return required.filter((name) => !(name in variables));
  }

  private isHelper(name: string): boolean {
    const builtIn = ['if', 'unless', 'each', 'with', 'lookup', 'log'];
    const custom = ['formatDate', 'formatCurrency'];
    return builtIn.includes(name) || custom.includes(name);
  }
}
