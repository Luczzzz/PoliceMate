/**
 * 对模型输出的两类已知偏差做容错（部署端日志第五节）：
 * 1. JSON 里字符串之外、紧随 `]` 或 `}` 的多余逗号；
 * 2. 模型自创、不在输出 Schema 白名单内的字段。
 *
 * 只做这两件事：修复后仍须能解析，已知字段内容不改动；其余损坏照常报错。
 */

/** 状态机逐字符扫描，只删除字符串字面量之外的多余逗号。 */
function stripTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === "]" || text[j] === "}") continue;
      out += ch;
    } else {
      out += ch;
    }
  }
  return out;
}

export function parseTolerantJson(text: string): { value: unknown; repaired: boolean } {
  try {
    return { value: JSON.parse(text) as unknown, repaired: false };
  } catch (original) {
    const fixed = stripTrailingCommas(text);
    if (fixed === text) throw original;
    return { value: JSON.parse(fixed) as unknown, repaired: true };
  }
}

type Schema = {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  definitions?: Record<string, Schema>;
};

export function pruneToSchema(value: unknown, root: Schema): { value: unknown; dropped: string[] } {
  const dropped: string[] = [];
  const resolve = (schema: Schema): Schema => {
    let current = schema;
    for (let depth = 0; current.$ref !== undefined && depth < 20; depth += 1) {
      const name = current.$ref.replace("#/definitions/", "");
      const next = root.definitions?.[name];
      if (next === undefined) break;
      current = next;
    }
    return current;
  };
  const walk = (node: unknown, schema: Schema): unknown => {
    const resolved = resolve(schema);
    const branches = resolved.anyOf ?? resolved.oneOf;
    if (branches !== undefined) {
      if (typeof node !== "object" || node === null) return node;
      const wantArray = Array.isArray(node);
      const candidates = branches.map(resolve).filter((branch) =>
        wantArray ? branch.items !== undefined : branch.properties !== undefined,
      );
      if (candidates.length === 0) return node;
      if (wantArray) return walk(node, candidates[0]);
      const keys = Object.keys(node);
      const best = candidates.reduce((a, b) =>
        keys.filter((k) => k in (b.properties ?? {})).length > keys.filter((k) => k in (a.properties ?? {})).length ? b : a,
      );
      return walk(node, best);
    }
    if (Array.isArray(node)) {
      return resolved.items === undefined ? node : node.map((item) => walk(item, resolved.items!));
    }
    if (typeof node === "object" && node !== null && resolved.properties !== undefined) {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node)) {
        const childSchema = resolved.properties[key];
        if (childSchema === undefined) dropped.push(key);
        else result[key] = walk(child, childSchema);
      }
      return result;
    }
    return node;
  };
  return { value: walk(value, root), dropped };
}
