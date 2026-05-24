const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/g;

const ALLOWED_FUNCTIONS = {
  abs: {
    minArgs: 1,
    maxArgs: 1,
    execute: (value) => Math.abs(value),
  },
  ceil: {
    minArgs: 1,
    maxArgs: 1,
    execute: (value) => Math.ceil(value),
  },
  floor: {
    minArgs: 1,
    maxArgs: 1,
    execute: (value) => Math.floor(value),
  },
  max: {
    minArgs: 1,
    maxArgs: Number.POSITIVE_INFINITY,
    execute: (...values) => Math.max(...values),
  },
  min: {
    minArgs: 1,
    maxArgs: Number.POSITIVE_INFINITY,
    execute: (...values) => Math.min(...values),
  },
  pow: {
    minArgs: 2,
    maxArgs: 2,
    execute: (base, exponent) => Math.pow(base, exponent),
  },
  round: {
    minArgs: 1,
    maxArgs: 2,
    execute: (value, precision = 0) => {
      const digits = Number.isFinite(precision) ? precision : 0;
      const scale = 10 ** digits;
      return Math.round(value * scale) / scale;
    },
  },
};

function tokenizeExpression(expression) {
  const tokens = [];
  const source = String(expression || "").trim();
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if ("+-*/(),".includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    if (char === "{" && source[index + 1] === "{") {
      const closingIndex = source.indexOf("}}", index + 2);
      if (closingIndex === -1) {
        throw new Error("Formula placeholder is not closed properly.");
      }

      const rawId = source.slice(index + 2, closingIndex).trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(rawId)) {
        throw new Error("Formula placeholder must contain a valid parameter key.");
      }

      tokens.push({ type: "variable", value: rawId });
      index = closingIndex + 2;
      continue;
    }

    if (/\d|\./.test(char)) {
      let endIndex = index + 1;
      while (endIndex < source.length && /[\d.]/.test(source[endIndex])) {
        endIndex += 1;
      }

      const rawNumber = source.slice(index, endIndex);
      if (!/^\d*\.?\d+$/.test(rawNumber)) {
        throw new Error(`Invalid number "${rawNumber}" in formula.`);
      }

      tokens.push({ type: "number", value: Number(rawNumber) });
      index = endIndex;
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let endIndex = index + 1;
      while (endIndex < source.length && /[a-zA-Z0-9_]/.test(source[endIndex])) {
        endIndex += 1;
      }

      const identifier = source.slice(index, endIndex).toLowerCase();
      tokens.push({ type: "identifier", value: identifier });
      index = endIndex;
      continue;
    }

    throw new Error(`Unsupported token "${char}" in formula.`);
  }

  return tokens;
}

function createTokenCursor(tokens) {
  let index = 0;

  return {
    peek() {
      return tokens[index] || null;
    },
    next() {
      return tokens[index++] || null;
    },
    isComplete() {
      return index >= tokens.length;
    },
  };
}

function assertFunctionArity(name, args) {
  const config = ALLOWED_FUNCTIONS[name];
  if (!config) {
    throw new Error(`Unsupported function "${name}" in formula.`);
  }

  if (args.length < config.minArgs || args.length > config.maxArgs) {
    const maxArgsLabel = Number.isFinite(config.maxArgs) ? config.maxArgs : "many";
    throw new Error(`Function "${name}" expects ${config.minArgs} to ${maxArgsLabel} arguments.`);
  }

  return config;
}

function parseExpression(cursor, resolveVariable) {
  let value = parseTerm(cursor, resolveVariable);

  while (true) {
    const token = cursor.peek();
    if (!token || (token.type !== "+" && token.type !== "-")) {
      return value;
    }

    cursor.next();
    const right = parseTerm(cursor, resolveVariable);
    value = token.type === "+" ? value + right : value - right;
  }
}

function parseTerm(cursor, resolveVariable) {
  let value = parseFactor(cursor, resolveVariable);

  while (true) {
    const token = cursor.peek();
    if (!token || (token.type !== "*" && token.type !== "/")) {
      return value;
    }

    cursor.next();
    const right = parseFactor(cursor, resolveVariable);

    if (token.type === "/") {
      if (right === 0) {
        throw new Error("Division by zero is not allowed in formula.");
      }
      value /= right;
      continue;
    }

    value *= right;
  }
}

function parseFactor(cursor, resolveVariable) {
  const token = cursor.peek();

  if (!token) {
    throw new Error("Formula ended unexpectedly.");
  }

  if (token.type === "+") {
    cursor.next();
    return parseFactor(cursor, resolveVariable);
  }

  if (token.type === "-") {
    cursor.next();
    return -parseFactor(cursor, resolveVariable);
  }

  if (token.type === "number") {
    cursor.next();
    return token.value;
  }

  if (token.type === "variable") {
    cursor.next();
    return resolveVariable(token.value);
  }

  if (token.type === "(") {
    cursor.next();
    const nestedValue = parseExpression(cursor, resolveVariable);
    const closingToken = cursor.next();
    if (!closingToken || closingToken.type !== ")") {
      throw new Error("Closing bracket is missing in formula.");
    }
    return nestedValue;
  }

  if (token.type === "identifier") {
    cursor.next();
    const openingToken = cursor.next();
    if (!openingToken || openingToken.type !== "(") {
      throw new Error(`Function "${token.value}" must be followed by brackets.`);
    }

    const args = [];
    if (cursor.peek()?.type !== ")") {
      while (true) {
        args.push(parseExpression(cursor, resolveVariable));
        if (cursor.peek()?.type === ",") {
          cursor.next();
          continue;
        }
        break;
      }
    }

    const closingToken = cursor.next();
    if (!closingToken || closingToken.type !== ")") {
      throw new Error(`Function "${token.value}" is missing a closing bracket.`);
    }

    const config = assertFunctionArity(token.value, args);
    return config.execute(...args);
  }

  throw new Error(`Unexpected token "${token.value}" in formula.`);
}

function parseFormulaExpression(expression, resolveVariable) {
  const tokens = tokenizeExpression(expression);
  if (!tokens.length) {
    throw new Error("Formula expression is required.");
  }

  const cursor = createTokenCursor(tokens);
  const result = parseExpression(cursor, resolveVariable);

  if (!cursor.isComplete()) {
    throw new Error("Formula contains unexpected trailing tokens.");
  }

  if (!Number.isFinite(result)) {
    throw new Error("Formula result is not a valid number.");
  }

  return result;
}

function extractParameterIds(expression) {
  const matches = [];
  const normalized = String(expression || "");
  let currentMatch;

  while ((currentMatch = PLACEHOLDER_PATTERN.exec(normalized)) !== null) {
    matches.push(currentMatch[1]);
  }

  return [...new Set(matches)];
}

function evaluateFormulaExpression(expression, valuesByParameterId = {}) {
  const missingIds = [];
  const usedIds = extractParameterIds(expression);

  const result = parseFormulaExpression(expression, (parameterId) => {
    const rawValue = valuesByParameterId[parameterId];
    const numericValue =
      typeof rawValue === "number" ? rawValue : Number.parseFloat(String(rawValue ?? "").trim());

    if (!Number.isFinite(numericValue)) {
      missingIds.push(parameterId);
      return 0;
    }

    return numericValue;
  });

  return {
    result,
    missingIds: [...new Set(missingIds)],
    usedIds,
  };
}

function validateFormulaExpression(expression) {
  const usedIds = extractParameterIds(expression);
  parseFormulaExpression(expression, () => 1);

  return {
    usedIds,
    functionNames: Array.from(
      new Set(
        tokenizeExpression(expression)
          .filter((token) => token.type === "identifier")
          .map((token) => token.value)
      )
    ),
  };
}

export {
  ALLOWED_FUNCTIONS,
  evaluateFormulaExpression,
  extractParameterIds,
  validateFormulaExpression,
};
