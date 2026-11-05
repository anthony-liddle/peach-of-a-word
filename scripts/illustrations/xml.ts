/**
 * Just enough XML to read an Inkscape SVG: elements and their attributes, in
 * order. Text, comments, CDATA, processing instructions and the doctype are
 * skipped, since nothing the import reads lives in them.
 */

export class XmlError extends Error {}

export class XmlEl {
  readonly children: XmlEl[] = [];
  constructor(
    /** As written, with its prefix: `inkscape:grid`. */
    readonly name: string,
    readonly attrs: ReadonlyMap<string, string>,
  ) {}

  get localName(): string {
    return this.name.slice(this.name.indexOf(':') + 1);
  }

  get id(): string {
    return this.attrs.get('id') ?? '';
  }

  /** By the name as written, prefix and all: `inkscape:label`. */
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : Number(e.slice(1)),
      );
    const named = ENTITIES[e];
    if (named === undefined) throw new XmlError(`unknown entity ${whole}`);
    return named;
  });

/** The document's root element. */
export function parseXml(text: string): XmlEl {
  const stack: XmlEl[] = [];
  let root: XmlEl | undefined;
  let i = 0;
  const skipPast = (end: string) => {
    const at = text.indexOf(end, i);
    if (at < 0) throw new XmlError(`no closing ${end}`);
    i = at + end.length;
  };
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    i = lt;
    if (text.startsWith('<!--', i)) skipPast('-->');
    else if (text.startsWith('<![CDATA[', i)) skipPast(']]>');
    else if (text.startsWith('<?', i)) skipPast('?>');
    else if (text.startsWith('<!', i)) skipPast('>');
    else if (text.startsWith('</', i)) {
      const m = /^<\/([^\s>]+)\s*>/.exec(text.slice(i));
      const open = stack.pop();
      if (!m || !open || open.name !== m[1])
        throw new XmlError(`a mismatched closing tag at ${i}`);
      i += m[0].length;
    } else {
      const m = /^<([^\s/>]+)/.exec(text.slice(i));
      if (!m) throw new XmlError(`a malformed tag at ${i}`);
      i += m[0].length;
      const attrs = new Map<string, string>();
      const attr = /^\s*([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/;
      for (let a = attr.exec(text.slice(i)); a; a = attr.exec(text.slice(i))) {
        attrs.set(a[1]!, decode(a[3] ?? a[4] ?? ''));
        i += a[0].length;
      }
      const end = /^\s*(\/?)>/.exec(text.slice(i));
      if (!end) throw new XmlError(`a malformed tag <${m[1]}> at ${i}`);
      i += end[0].length;
      const el = new XmlEl(m[1]!, attrs);
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(el);
      else if (root) throw new XmlError('two root elements');
      else root = el;
      if (!end[1]) stack.push(el);
    }
  }
  if (!root || stack.length) throw new XmlError('an unfinished document');
  return root;
}
