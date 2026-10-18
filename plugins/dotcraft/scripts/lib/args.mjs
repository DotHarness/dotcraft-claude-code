export function parseArgs(argv, { values = [], lists = [], booleans = [], aliases = {} } = {}) {
  const options = {};
  const positionals = [];
  for (const name of lists) {
    options[name] = [];
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const key = aliases[rawKey] ?? rawKey;
    if (booleans.includes(key)) {
      options[key] = true;
      continue;
    }
    if (values.includes(key) || lists.includes(key)) {
      const value = inlineValue ?? argv[++index];
      if (value === undefined) {
        throw new Error(`Missing value for --${rawKey}.`);
      }
      if (lists.includes(key)) {
        options[key].push(value);
      } else {
        options[key] = value;
      }
      continue;
    }
    throw new Error(`Unknown option --${rawKey}.`);
  }

  return { options, positionals };
}

export function splitRawArguments(raw) {
  const tokens = [];
  let current = "";
  let quote = null;
  let started = false;

  for (const character of raw) {
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
    } else {
      current += character;
      started = true;
    }
  }
  if (started) {
    tokens.push(current);
  }
  return tokens;
}
