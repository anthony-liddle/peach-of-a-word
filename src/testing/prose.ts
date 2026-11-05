import ts from 'typescript';

/**
 * The strings a source file can show a player, for the tests that read them.
 *
 * Shared by `vocabularyGuard.test.ts`, which keeps letterpress terms out of
 * the cute theme, and `playerWords.test.ts`, which keeps the machine tells out
 * of every theme. Both read the sources rather than rendering them, because a
 * literal renders the same whichever theme is on.
 */

/**
 * Only strings holding more than one word are candidates. Every user-facing
 * string is prose; identifiers, class names, module paths, and storage keys are
 * single tokens. Filtering on the shape of the value is what lets a term list
 * stay short and literal instead of carrying an exception for every code site
 * that legitimately says "letterpress" or "case".
 */
export function isProse(value: string): boolean {
  return /\S\s+\S/.test(value.trim());
}

/** A name that holds CSS classes: `className`, `class`, `revealClass`. */
const CLASS_NAME = /^(class|className)$|Class(Name)?$/;

/** Whether a node's subtree is a list of CSS classes rather than words. */
function holdsClasses(node: ts.Node): boolean {
  if (ts.isJsxAttribute(node)) return CLASS_NAME.test(node.name.getText());
  if (
    ts.isVariableDeclaration(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isPropertyDeclaration(node)
  ) {
    return ts.isIdentifier(node.name) && CLASS_NAME.test(node.name.text);
  }
  return false;
}

/**
 * Every string literal, template chunk, and JSX text node in a source file.
 *
 * The source is parsed, not read line by line, and only literal nodes are
 * collected. Comments are not nodes, so they never arrive. Nor do CSS class
 * lists, found by where they're written: a `className` attribute, or a
 * binding named for a class. "reveal reveal--quiet" is two words, and code.
 */
export function literals(source: string, file: string): string[] {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (holdsClasses(node)) return;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/** The literals that are prose: what a sentence looks like. */
export function prose(source: string, file: string): string[] {
  return literals(source, file).filter(isProse);
}
